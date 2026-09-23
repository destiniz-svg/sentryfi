const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { pool } = require("../config/db");
const hooks = require("../services/webhooks");

/**
 * A company's webhooks (services/webhooks.js): the addresses told when
 * something goes into its books. Set up by whoever manages settings; the
 * secret is shown once. Keys cannot reach this router.
 */
const router = express.Router();
router.use(requireAuth, requireCompany, requireCan("manage_settings"));

const shape = (w) => ({ id: w.id, url: w.url, events: w.events, createdAt: w.created_at, last: w.last_status === undefined ? null : { status: w.last_status, error: w.last_error, at: w.last_at } });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT w.*, d.status AS last_status, d.error AS last_error, d.created_at AS last_at
         FROM webhooks w
         LEFT JOIN LATERAL (SELECT status, error, created_at FROM webhook_deliveries WHERE webhook_id = w.id ORDER BY created_at DESC LIMIT 1) d ON true
        WHERE w.company_id = $1 AND w.disabled_at IS NULL ORDER BY w.created_at`,
      [req.companyId]
    );
    res.json({ webhooks: rows.map(shape), events: hooks.EVENTS.filter((e) => e !== "ping") });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const p = z.object({ url: z.string().trim().max(500), events: z.array(z.enum(hooks.EVENTS.filter((e) => e !== "ping"))).min(1, "Choose at least one event.") }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    let url;
    try {
      url = await hooks.checkUrl(p.data.url);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
    const count = (await pool.query("SELECT count(*)::int AS n FROM webhooks WHERE company_id = $1 AND disabled_at IS NULL", [req.companyId])).rows[0].n;
    if (count >= 10) throw ApiError.badRequest("Ten webhooks is the most. Turn one off first.");
    const secret = "whsec_" + crypto.randomBytes(24).toString("base64url");
    const { rows } = await pool.query(
      "INSERT INTO webhooks (company_id, url, events, secret, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.companyId, url, [...new Set([...p.data.events, "ping"])], secret, req.user.id]
    );
    res.status(201).json({ webhook: shape(rows[0]), secret });
  })
);

router.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT id FROM webhooks WHERE id = $1 AND company_id = $2 AND disabled_at IS NULL", [req.params.id, req.companyId]);
    if (!rows.length) throw ApiError.notFound("No such webhook.");
    await hooks.emit(req.companyId, "ping", { message: "A test from Sentryfi." });
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such webhook.");
    const { rowCount } = await pool.query("UPDATE webhooks SET disabled_at = now() WHERE id = $1 AND company_id = $2 AND disabled_at IS NULL", [req.params.id, req.companyId]);
    if (!rowCount) throw ApiError.notFound("No such webhook.");
    res.json({ ok: true });
  })
);

module.exports = router;
