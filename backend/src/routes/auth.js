const express = require("express");
const { isPlatformAdmin } = require("../middleware/platform");
const { z } = require("zod");

const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { signToken, cookieOptions } = require("../utils/jwt");
const { validate } = require("../middleware/validate");
const { requireAuth, requireSession, mustVerify } = require("../middleware/auth");
const { sendLater, sendVerification, sendAlert, verifySecret } = require("../services/email");
const { authLimiter } = require("../middleware/rateLimit");
const User = require("../models/User");
const Settings = require("../models/Settings");

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  companyName: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

// A real bcrypt hash of a random secret nobody holds, made once on first use.
// Failed sign-ins per address, as well as per network: ten in fifteen minutes
// and that address waits. ponytail: in memory, per process; move to the
// database if Sentryfi ever runs on more than one.
const failures = new Map();
const WINDOW = 15 * 60 * 1000;
function tooMany(email) {
  const now = Date.now();
  const recent = (failures.get(email) || []).filter((t) => now - t < WINDOW);
  failures.set(email, recent);
  return recent.length >= 10;
}
function failed(email) {
  failures.set(email, [...(failures.get(email) || []), Date.now()]);
}

let dummyHash = null;
const dummy = async () => (dummyHash ||= await User.hashPassword(require("crypto").randomBytes(24).toString("hex")));

function issueSession(res, user) {
  const token = signToken({ sub: user.id, v: user.token_version || 0 });
  res.cookie(env.cookieName, token, cookieOptions);
}

router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, companyName, address } = req.body;

    const existing = await User.findByEmail(email);
    if (existing) throw ApiError.conflict("Email already registered");

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash });

    await Settings.ensure(user.id);
    if (companyName || address) {
      await Settings.update(user.id, {
        company_name: companyName || "",
        address: address || "",
        email,
      });
    }

    sendVerification(user);
    issueSession(res, user);
    res.status(201).json({ user: { ...user, mustVerify: mustVerify(user) } });
  })
);

router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const key = String(email).trim().toLowerCase();
    if (tooMany(key)) throw new ApiError(429, "Too many tries for this address. Wait fifteen minutes and try again.");

    const record = await User.findByEmail(email);
    if (!record) {
      // The same bcrypt work as a wrong password, so the time taken does not
      // say whether the address has an account.
      await User.comparePassword(password, await dummy());
      failed(key);
      throw ApiError.unauthorized("Invalid credentials");
    }

    const ok = await User.comparePassword(password, record.password_hash);
    if (!ok) {
      failed(key);
      throw ApiError.unauthorized("Invalid credentials");
    }
    failures.delete(key);

    const user = {
      id: record.id,
      email: record.email,
      name: record.name,
      created_at: record.created_at,
      updated_at: record.updated_at,
      token_version: record.token_version,
      mustVerify: mustVerify(record),
    };
    issueSession(res, user);
    delete user.token_version;
    res.json({ user });
  })
);

/**
 * A reset link, either handed over by an administrator (routes/companies.js)
 * or emailed by "Forgot password" below. Opening it says whose it is; using it
 * sets the password, ends every other session and signs the person in. Single
 * use, and only its hash is kept. An emailed one also confirms the address.
 */
const resetHash = (token) => require("crypto").createHash("sha256").update(String(token || "")).digest("hex");
const openReset = (token) =>
  require("../config/db").queryOne(
    `SELECT r.id, r.user_id, r.emailed, u.name, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [resetHash(token)]
  );

router.get(
  "/reset/:token",
  authLimiter,
  asyncHandler(async (req, res) => {
    const found = await openReset(req.params.token);
    if (!found) throw ApiError.notFound("That link has been used or has run out. Ask for a new one.");
    res.json({ name: found.name });
  })
);

router.post(
  "/reset/:token",
  authLimiter,
  asyncHandler(async (req, res) => {
    const password = String(req.body?.password || "");
    if (password.length < 8 || password.length > 128) throw ApiError.badRequest("Use at least eight characters.");
    const found = await openReset(req.params.token);
    if (!found) throw ApiError.notFound("That link has been used or has run out. Ask for a new one.");
    const { query } = require("../config/db");
    const used = await query("UPDATE password_resets SET used_at = now() WHERE id = $1 AND used_at IS NULL", [found.id]);
    if (!used.rowCount) throw ApiError.notFound("That link has just been used.");
    await User.updatePassword(found.user_id, await User.hashPassword(password));
    if (found.emailed) await User.markVerified(found.user_id);
    const v = await User.bumpTokenVersion(found.user_id);
    sendAlert(found, "Your password was changed");
    issueSession(res, { id: found.user_id, token_version: v });
    res.json({ ok: true });
  })
);

/**
 * Forgot password: emails a link good for an hour. The answer is the same
 * whether or not the address has an account, and an address gets at most
 * three links an hour.
 */
router.post(
  "/forgot",
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = email ? await User.findByEmail(email) : null;
    if (user) {
      const { query, queryOne } = require("../config/db");
      const recent = await queryOne(
        "SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND emailed AND created_at > now() - interval '1 hour'",
        [user.id]
      );
      if (recent.n < 3) {
        const token = require("crypto").randomBytes(32).toString("base64url");
        await query("INSERT INTO password_resets (user_id, token_hash, emailed, expires_at) VALUES ($1, $2, true, now() + interval '1 hour')", [
          user.id,
          resetHash(token),
        ]);
        sendLater({
          to: user.email,
          subject: "Set a new Sentryfi password",
          lines: [
            `Hello ${user.name},`,
            "Someone asked to set a new password for your Sentryfi account. If it was you, tap the button. The link works once, for an hour.",
            "If it was not you, ignore this email. Your password stays as it is.",
          ],
          link: { label: "Set a new password", url: `${env.publicUrl}/reset/${token}` },
        });
      }
    }
    res.json({ ok: true });
  })
);

/** The link in the confirm-your-address email. */
router.post(
  "/verify",
  authLimiter,
  asyncHandler(async (req, res) => {
    const bad = () => ApiError.badRequest("That link has run out or is not complete. Sign in and ask for a new one.");
    let claim;
    try {
      claim = require("jsonwebtoken").verify(String(req.body?.token || ""), verifySecret());
    } catch {
      throw bad();
    }
    const user = await User.findById(claim.sub);
    if (!user || user.email !== claim.email) throw bad();
    await User.markVerified(user.id);
    res.json({ ok: true });
  })
);

router.post(
  "/verify/resend",
  authLimiter,
  requireSession,
  asyncHandler(async (req, res) => {
    if (!req.user.email_verified_at) sendVerification(req.user);
    res.json({ ok: true, email: req.user.email });
  })
);

/** Ends every session this person has, on every device, this one included. */
router.post(
  "/logout-everywhere",
  requireSession,
  asyncHandler(async (req, res) => {
    await User.bumpTokenVersion(req.user.id);
    res.clearCookie(env.cookieName, { ...cookieOptions, maxAge: 0 });
    res.json({ ok: true });
  })
);

router.post("/logout", (req, res) => {
  res.clearCookie(env.cookieName, { ...cookieOptions, maxAge: 0 });
  res.json({ ok: true });
});

router.get(
  "/me",
  requireSession,
  asyncHandler(async (req, res) => {
    res.json({ user: { ...req.user, platformAdmin: isPlatformAdmin(req.user), mustVerify: mustVerify(req.user) } });
  })
);

router.patch(
  "/profile",
  requireAuth,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const user = await User.updateName(req.user.id, req.body.name);
    res.json({ user });
  })
);

router.patch(
  "/password",
  authLimiter,
  requireAuth,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const record = await User.findByIdWithHash(req.user.id);
    if (!record) throw ApiError.unauthorized("Session no longer valid");

    const ok = await User.comparePassword(
      req.body.currentPassword,
      record.password_hash
    );
    if (!ok) throw ApiError.unauthorized("Current password is incorrect");

    const passwordHash = await User.hashPassword(req.body.newPassword);
    await User.updatePassword(req.user.id, passwordHash);
    // Every other session ends; this one carries on with a fresh one.
    const v = await User.bumpTokenVersion(req.user.id);
    issueSession(res, { id: req.user.id, token_version: v });
    sendAlert(req.user, "Your password was changed");
    res.json({ ok: true, otherSessionsEnded: true });
  })
);

module.exports = router;
