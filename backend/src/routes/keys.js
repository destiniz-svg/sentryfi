const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { pool } = require("../config/db");
const { hashKey } = require("../middleware/apiKey");

/**
 * A person's keys for their assistant and other software, in the company open
 * (middleware/apiKey.js). Made by a person for themselves: a key acts as them,
 * so it can do no more than they can, and less. Shown once; kept as a hash.
 * Keys cannot reach this router, so a key cannot make another key.
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

const shape = (k) => ({ id: k.id, name: k.name, scope: k.scope, hint: k.hint, createdAt: k.created_at, lastUsedAt: k.last_used_at, writes: Number(k.writes || 0) });

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT k.*, (SELECT count(*) FROM api_key_log l WHERE l.key_id = k.id) AS writes
         FROM api_keys k WHERE k.user_id = $1 AND k.company_id = $2 AND k.revoked_at IS NULL ORDER BY k.created_at DESC`,
      [req.user.id, req.companyId]
    );
    res.json({ keys: rows.map(shape) });
  })
);

router.post(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const p = z.object({ name: z.string().trim().min(1, "Give it a name you will recognise.").max(80), scope: z.enum(["read", "draft"]) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    if (p.data.scope === "draft" && !req.can("record")) throw ApiError.forbidden("Your role does not make drafts, so a key of yours cannot either.");
    const count = (await pool.query("SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1 AND company_id = $2 AND revoked_at IS NULL", [req.user.id, req.companyId])).rows[0].n;
    if (count >= 10) throw ApiError.badRequest("Ten keys at once is the most. Turn one off first.");
    const token = "sfk_" + crypto.randomBytes(30).toString("base64url");
    const { rows } = await pool.query(
      "INSERT INTO api_keys (company_id, user_id, name, scope, token_hash, hint) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [req.companyId, req.user.id, p.data.name, p.data.scope, hashKey(token), token.slice(-4)]
    );
    res.status(201).json({ key: shape(rows[0]), token });
  })
);

router.get(
  "/:id/log",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such key.");
    const { rows: own } = await pool.query("SELECT 1 FROM api_keys WHERE id = $1 AND user_id = $2 AND company_id = $3", [req.params.id, req.user.id, req.companyId]);
    if (!own.length) throw ApiError.notFound("No such key.");
    const { rows } = await pool.query("SELECT method, path, status, at FROM api_key_log WHERE key_id = $1 ORDER BY at DESC LIMIT 50", [req.params.id]);
    res.json({ log: rows });
  })
);

router.delete(
  "/:id",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such key.");
    const { rowCount } = await pool.query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND company_id = $3 AND revoked_at IS NULL", [req.params.id, req.user.id, req.companyId]);
    if (!rowCount) throw ApiError.notFound("No such key.");
    res.json({ ok: true });
  })
);

module.exports = router;
