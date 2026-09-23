const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const analytics = require("../ledger/analytics");

/** Analytics for one period, and the entries behind any figure on it. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const period = (q) => {
  const today = new Date().toISOString().slice(0, 10);
  const p = z.object({ from: day.default(`${today.slice(0, 7)}-01`), to: day.default(today) }).safeParse(q);
  if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
  if (p.data.from > p.data.to) throw ApiError.badRequest("The period starts after it ends.");
  return p.data;
};

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const { from, to } = period(req.query);
    const compare = req.query.compare === "year" ? "year" : undefined;
    res.json(await asCompany(req, (client) => analytics.overview(client, { companyId: req.companyId, from, to, compare })));
  })
);

const uuid = z.string().uuid();
router.get(
  "/entries",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const { from, to } = period(req.query);
    const p = z
      .object({
        type: z.enum(["income", "expense", "cash"]),
        accountId: uuid.optional(),
        counterpartyId: z.union([uuid, z.literal("none")]).optional(),
        projectId: uuid.optional(),
        dimensionId: uuid.optional(),
      })
      .safeParse(req.query);
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    res.json(await asCompany(req, (client) => analytics.entries(client, { companyId: req.companyId, from, to, ...p.data })));
  })
);

module.exports = router;
