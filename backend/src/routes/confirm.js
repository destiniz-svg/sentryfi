const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { asCompany } = require("../ledger/session");
const confirmations = require("../ledger/auditConfirmations");

/**
 * /api/confirm/:token is public: the customer or supplier an auditor asked
 * opens it without an account, sees who asks about what, and replies once.
 * The reply goes where only the auditor can read it.
 */
const router = express.Router();
const looking = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: (req, res) => ipKeyGenerator(req, res) });

const plain = (fn) =>
  asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.status === 404) throw ApiError.notFound(err.message);
      if (err.status === 409) throw ApiError.conflict(err.message);
      if (err.code) throw err;
      throw ApiError.badRequest(err.message);
    }
  });

router.get("/:token", looking, plain(async (req, res) => res.json(await confirmations.view({ token: req.params.token, asCompany }))));

router.post(
  "/:token",
  looking,
  plain(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(201).json(await confirmations.reply({ token: req.params.token, asCompany, body: req.body ?? {}, ip: req.ip, userAgent: req.get("user-agent") }));
  })
);

module.exports = router;
