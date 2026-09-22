const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const loans = require("../ledger/loans");

/** Money borrowed, and money a director owes the business. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const amount = z.union([z.string().trim().min(1), z.number()]);

const createBody = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(Object.keys(loans.KINDS)),
  principal: amount,
  ratePct: z.number().min(0).max(1000).nullish(),
  rateBasis: z.enum(["reducing", "flat"]).nullish(),
  method: z.enum(["annuity", "equal_principal", "none"]).nullish(),
  termMonths: z.number().int().positive().max(600).nullish(),
  startsOn: day,
  firstDue: day.nullish(),
  fee: amount.nullish(),
  intoAccountId: z.string().uuid().nullish(),
});
const repayBody = z.object({
  on: day,
  amount,
  fromAccountId: z.string().uuid("Where was it paid from?"),
  interest: amount.nullish(),
});

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const out = await asCompany(req, async (client) => ({
      loans: await loans.list(client, { companyId: req.companyId }),
      // Where money can come from or go to: banks and tins.
      places: (
        await client.query(
          `SELECT id, code, name FROM accounts WHERE company_id = $1 AND archived_at IS NULL AND (code LIKE '11%' OR code LIKE '12%') ORDER BY code`,
          [req.companyId]
        )
      ).rows,
    }));
    res.json({ ...out, kinds: Object.entries(loans.KINDS).map(([key, k]) => ({ key, ...k })) });
  })
);

router.post(
  "/",
  requireCan("adjust"),
  asyncHandler(async (req, res) => {
    const parsed = createBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const r = await asCompany(req, (client) => loans.create(client, { ...parsed.data, companyId: req.companyId, userId: req.user.id }));
      res.status(201).json({ id: r.id, account: r.account, entryNo: r.entryNo && String(r.entryNo) });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.post(
  "/:id/repay",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const parsed = repayBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const r = await asCompany(req, (client) =>
        loans.repay(client, { ...parsed.data, companyId: req.companyId, userId: req.user.id, loanId: req.params.id })
      );
      res.json({
        entryNo: String(r.entryNo),
        principal: formatLaari(r.principal),
        cost: formatLaari(r.cost),
        costName: r.costName,
        owedAfter: formatLaari(r.owedAfter),
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;
