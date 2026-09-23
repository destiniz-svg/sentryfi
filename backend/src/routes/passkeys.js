const express = require("express");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const env = require("../config/env");
const { query, queryOne } = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { signToken, verifyToken, cookieOptions } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const User = require("../models/User");

/**
 * Signing in with Face ID or a fingerprint: passkeys (WebAuthn).
 *
 * The phone makes a key pair; Sentryfi keeps only the public half, and a
 * sign-in is the phone proving it holds the private half, unlocked by the face
 * or finger. Nothing a person could be tricked into typing is involved, which
 * is why passkeys cannot be phished. Each ceremony has a one-time challenge,
 * kept for five minutes in a signed cookie, and the origin must be one of
 * Sentryfi's own.
 */

const router = express.Router();
const CHALLENGE = "sentryfi_passkey";

/** Where the request came from, if it is one of ours, and the domain passkeys are bound to. */
function party(req) {
  const origin = req.get("origin");
  const allowed = new Set([...env.clientOrigins, "https://sentryfi.app"]);
  if (!origin || !allowed.has(origin)) throw ApiError.badRequest("Passkeys work only on Sentryfi's own address.");
  return { origin, rpID: new URL(origin).hostname };
}

function holdChallenge(res, challenge, userId) {
  res.cookie(CHALLENGE, signToken({ c: challenge, u: userId || null }), { ...cookieOptions, maxAge: 5 * 60 * 1000 });
}

function takeChallenge(req, res) {
  const raw = req.cookies?.[CHALLENGE];
  res.clearCookie(CHALLENGE, { ...cookieOptions, maxAge: 0 });
  if (!raw) throw ApiError.badRequest("That took too long. Try again.");
  try {
    return verifyToken(raw);
  } catch {
    throw ApiError.badRequest("That took too long. Try again.");
  }
}

function issueSession(res, user) {
  res.cookie(env.cookieName, signToken({ sub: user.id, v: user.token_version || 0 }), cookieOptions);
}

/** This person's passkeys. */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      "SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = $1 ORDER BY created_at",
      [req.user.id]
    );
    res.json({ passkeys: rows.rows });
  })
);

router.post(
  "/register/options",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rpID } = party(req);
    const existing = await query("SELECT credential_id, transports FROM passkeys WHERE user_id = $1", [req.user.id]);
    const options = await generateRegistrationOptions({
      rpName: "Sentryfi",
      rpID,
      userName: req.user.email,
      userDisplayName: req.user.name,
      userID: new TextEncoder().encode(req.user.id),
      attestationType: "none",
      excludeCredentials: existing.rows.map((p) => ({ id: p.credential_id, transports: p.transports || undefined })),
      // Required: a passkey stands in for the password, so the face or finger
      // must be checked, not just the phone held.
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    holdChallenge(res, options.challenge, req.user.id);
    res.json(options);
  })
);

router.post(
  "/register",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { origin, rpID } = party(req);
    const held = takeChallenge(req, res);
    if (held.u !== req.user.id) throw ApiError.badRequest("That was started by someone else. Try again.");
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response: req.body?.response,
        expectedChallenge: held.c,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (err) {
      throw ApiError.badRequest(`This device could not be added: ${err.message}`);
    }
    if (!verified.verified || !verified.registrationInfo) throw ApiError.badRequest("This device could not be added.");
    const { credential } = verified.registrationInfo;
    const name = String(req.body?.name || "").trim().slice(0, 60) || "This device";
    await query(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, name) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports || null, name]
    );
    require("../services/email").sendAlert(req.user, `Face ID or fingerprint sign-in was added, for ${name}`);
    res.status(201).json({ ok: true, name });
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query("DELETE FROM passkeys WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!r.rowCount) throw ApiError.notFound("That is not one of your devices.");
    res.json({ ok: true });
  })
);

router.post(
  "/login/options",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { rpID } = party(req);
    // No list of allowed keys: the phone offers whichever passkey it holds for
    // Sentryfi, so nobody has to type who they are first.
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    holdChallenge(res, options.challenge, null);
    res.json(options);
  })
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { origin, rpID } = party(req);
    const held = takeChallenge(req, res);
    const response = req.body?.response;
    const key = await queryOne("SELECT * FROM passkeys WHERE credential_id = $1", [String(response?.id || "")]);
    if (!key) throw ApiError.unauthorized("This device is not known to Sentryfi. Sign in with your password and add it.");
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: held.c,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: key.credential_id, publicKey: new Uint8Array(key.public_key), counter: Number(key.counter), transports: key.transports || undefined },
        requireUserVerification: true,
      });
    } catch {
      throw ApiError.unauthorized("That did not work. Try again, or sign in with your password.");
    }
    if (!verified.verified) throw ApiError.unauthorized("That did not work. Try again, or sign in with your password.");
    await query("UPDATE passkeys SET counter = $2, last_used_at = now() WHERE id = $1", [key.id, verified.authenticationInfo.newCounter]);
    const user = await User.findById(key.user_id);
    if (!user) throw ApiError.unauthorized("That account no longer exists.");
    issueSession(res, user);
    delete user.token_version;
    res.json({ user });
  })
);

module.exports = router;
