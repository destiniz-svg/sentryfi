const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requirePlatformAdmin } = require("../middleware/platform");
const { withTransaction } = require("../config/db");
const platform = require("../ledger/platform");

/**
 * The developer dashboard: Sentryfi's customers, for the people who run it.
 * Anyone else gets a 404, as if it were not here.
 */
const router = express.Router();
router.use(requireAuth, requirePlatformAdmin);

// Errors the ledger raises with a status become the answer the screen shows.
const run = (fn) =>
  withTransaction(async (client) => {
    try {
      return await fn(client);
    } catch (e) {
      if (e.status === 404) throw ApiError.notFound(e.message);
      if (e.status === 400) throw ApiError.badRequest(e.message);
      throw e;
    }
  });

const parse = (schema, body) => {
  const p = schema.safeParse(body || {});
  if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
  return p.data;
};

const reason = z.string().trim().min(3, "Say why, in a few words.").max(300);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [o, c, e] = await Promise.all([run(platform.overview), run((cl) => platform.customers(cl)), run((cl) => platform.events(cl))]);
    res.json({ ...o, ...c, events: e });
  })
);

router.post(
  "/customers/:id/trial",
  asyncHandler(async (req, res) => {
    const b = parse(z.object({ days: z.number().int().min(1).max(365), reason }), req.body);
    await run((client) => platform.extendTrial(client, { companyId: req.params.id, days: b.days, reason: b.reason, actor: req.user.email }));
    res.json({ ok: true });
  })
);

router.post(
  "/customers/:id/plan",
  asyncHandler(async (req, res) => {
    const b = parse(z.object({ plan: z.enum(["trial", "paid", "developer"]), reason }), req.body);
    await run((client) => platform.setPlan(client, { companyId: req.params.id, plan: b.plan, reason: b.reason, actor: req.user.email }));
    res.json({ ok: true });
  })
);

module.exports = router;
