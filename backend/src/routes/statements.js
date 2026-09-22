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

/** The same day a year earlier; 29 February becomes the 28th. */
const yearBefore = (d) => {
  const y = Number(d.slice(0, 4)) - 1;
  const md = d.slice(5) === "02-29" ? "02-28" : d.slice(5);
  return `${y}-${md}`;
};
const comparing = (req) => req.query.compare === "1" || req.query.compare === "true";

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
    const [p, prior] = await asCompany(req, async (client) => [
      await statements.profitAndLoss(client, { companyId: req.companyId, from, to }),
      comparing(req) ? await statements.profitAndLoss(client, { companyId: req.companyId, from: yearBefore(from), to: yearBefore(to) }) : null,
    ]);
    res.json({ ...statements.wire.profitAndLoss(p), prior: prior && statements.wire.profitAndLoss(prior) });
  })
);

router.get(
  "/balance-sheet",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const asAt = req.query.asAt ? day(req.query.asAt, "As at") : today();
    const [b, prior] = await asCompany(req, async (client) => [
      await statements.balanceSheet(client, { companyId: req.companyId, asAt }),
      comparing(req) ? await statements.balanceSheet(client, { companyId: req.companyId, asAt: yearBefore(asAt) }) : null,
    ]);
    res.json({ ...statements.wire.balanceSheet(b), prior: prior && statements.wire.balanceSheet(prior) });
  })
);

module.exports = router;
