const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const assets = require("../ledger/assets");

/** The fixed asset register: buying, wearing out, selling or scrapping. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const amount = z.union([z.string().trim().min(1), z.number()]);

const registerBody = z.object({
  name: z.string().trim().min(2, "What is the asset?").max(200),
  category: z.enum(Object.keys(assets.CATEGORIES)),
  cost: amount,
  residual: amount.nullish(),
  acquiredOn: day,
  lifeYears: z.number().positive().max(100).nullish(),
  method: z.enum(["straight_line", "reducing_balance"]).nullish(),
  ratePct: z.number().positive().max(100).nullish(),
  fromAccountId: z.string().uuid("How was it paid for?"),
});
const depreciateBody = z.object({ through: day });
const disposeBody = z.object({ on: day, proceeds: amount.nullish(), toAccountId: z.string().uuid().nullish() });

const act = (shape, fn) =>
  asyncHandler(async (req, res) => {
    const parsed = shape.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      res.json(await asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id, params: req.params, ...parsed.data })));
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  });

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const out = await asCompany(req, async (client) => {
      const list = await assets.list(client, { companyId: req.companyId });
      // Where the money for an asset can have come from: a bank, a tin,
      // a supplier still owed, a director, or a cost it was first put under.
      const { rows: payFrom } = await client.query(
        `SELECT id, code, name, type::text AS type FROM accounts
          WHERE company_id = $1 AND archived_at IS NULL
            AND (code LIKE '11%' OR code LIKE '12%' OR code IN ('2100','2300') OR type = 'expense')
          ORDER BY code`,
        [req.companyId]
      );
      return { assets: list, payFrom };
    });
    res.json({
      ...out,
      categories: Object.entries(assets.CATEGORIES).map(([key, c]) => ({ key, name: c.name, years: c.years })),
    });
  })
);

router.post(
  "/",
  requireCan("record"),
  act(registerBody, async (client, args) => {
    const r = await assets.register(client, args);
    return { id: r.id, entryNo: String(r.entryNo), paidFrom: r.paidFrom };
  })
);

router.post(
  "/depreciate",
  requireCan("adjust"),
  act(depreciateBody, async (client, args) => {
    const r = await assets.depreciate(client, args);
    return { months: r.posted.map((p) => ({ month: p.month, entryNo: String(p.entryNo), total: formatLaari(p.total) })), total: formatLaari(r.total) };
  })
);

router.post(
  "/:id/dispose",
  requireCan("adjust"),
  act(disposeBody, async (client, { params, ...args }) => {
    const r = await assets.dispose(client, { ...args, assetId: params.id });
    return {
      entryNo: String(r.entryNo),
      bookValue: formatLaari(r.bookValue),
      proceeds: formatLaari(r.proceeds),
      gain: formatLaari(r.gain < 0n ? -r.gain : r.gain),
      loss: r.gain < 0n,
    };
  })
);

module.exports = router;
