const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const statements = require("../ledger/statements");

/**
 * The statements an accountant checks the work with. Read only, and computed
 * from the journal every time it is asked, for the date asked.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const day = (v, what) => {
  const s = String(v || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw ApiError.badRequest(`${what} should be a date, YYYY-MM-DD.`);
  return s;
};
const today = () => new Date().toISOString().slice(0, 10);

router.get(
  "/trial-balance",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const asAt = req.query.asAt ? day(req.query.asAt, "As at") : today();
    const t = await asCompany(req, (client) => statements.trialBalance(client, { companyId: req.companyId, asAt }));
    res.json(statements.wire.trialBalance(t));
  })
);

router.get(
  "/profit-and-loss",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const to = req.query.to ? day(req.query.to, "To") : today();
    const from = req.query.from ? day(req.query.from, "From") : `${to.slice(0, 4)}-01-01`;
    if (from > to) throw ApiError.badRequest("From is after To.");
    const p = await asCompany(req, (client) => statements.profitAndLoss(client, { companyId: req.companyId, from, to }));
    res.json(statements.wire.profitAndLoss(p));
  })
);

router.get(
  "/balance-sheet",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const asAt = req.query.asAt ? day(req.query.asAt, "As at") : today();
    const b = await asCompany(req, (client) => statements.balanceSheet(client, { companyId: req.companyId, asAt }));
    res.json(statements.wire.balanceSheet(b));
  })
);

module.exports = router;
