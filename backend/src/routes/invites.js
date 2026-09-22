const express = require("express");
const { z } = require("zod");

const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { signToken, cookieOptions } = require("../utils/jwt");
const { authLimiter } = require("../middleware/rateLimit");
const { withTransaction } = require("../config/db");
const people = require("../ledger/people");

/**
 * The join link, opened by someone who is not signed in yet. Rate-limited
 * like sign-in, because a guessed link is a guessed password.
 */

const router = express.Router();
router.use(authLimiter);

router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    try {
      const found = await withTransaction(async (client) => {
        const invite = await people.readInvite(client, { token: req.params.token });
        const { rows } = await client.query("SELECT 1 FROM users WHERE email = $1", [invite.email]);
        return { company: invite.company, role: invite.role, email: invite.email, hasAccount: rows.length > 0 };
      });
      res.json(found);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

const acceptBody = z.object({
  name: z.string().trim().max(80).nullish(),
  password: z.string().min(1, "Enter a password.").max(128),
});

router.post(
  "/:token/accept",
  asyncHandler(async (req, res) => {
    const parsed = acceptBody.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    let joined;
    try {
      joined = await withTransaction((client) => people.acceptInvite(client, { token: req.params.token, ...parsed.data }));
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
    // The session carries the person's current version, like any sign-in.
    const who = await require("../models/User").findById(joined.user.id);
    res.cookie(env.cookieName, signToken({ sub: joined.user.id, v: who?.token_version || 0 }), cookieOptions);
    res.status(201).json(joined);
  })
);

module.exports = router;
