const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const reports = require("../ledger/reports");
const { today: localToday } = require("../ledger/today");

/** The everyday reports (/api/reports): the list, and one report over any dates. */
const router = express.Router();
router.use(requireAuth, requireCompany, requireCan("read"));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");

router.get("/", (req, res) => res.json({ reports: reports.list() }));

router.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const today = localToday();
    const p = z.object({ from: day.default(`${today.slice(0, 7)}-01`), to: day.default(today) }).safeParse(req.query);
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    if (p.data.from > p.data.to) throw ApiError.badRequest("The period starts after it ends.");
    const out = await asCompany(req, (client) => reports.run(client, { companyId: req.companyId, key: req.params.key, ...p.data }));
    if (!out) throw ApiError.notFound("There is no such report.");
    res.json(out);
  })
);

module.exports = router;
