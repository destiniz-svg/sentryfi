const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const periods = require("../ledger/periods");

/** Closing the books, reopening them, and adjusting into a month that is closed. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const amount = z.union([z.string().trim().min(1), z.number()]);

const closeBody = z.object({ through: day });
const reopenBody = z.object({ through: day.nullish(), reason: z.string().trim().min(3, "Say why the books are being reopened.").max(500) });
const adjustBody = z.object({
  date: day,
  narrative: z.string().trim().min(3, "Say what this adjustment is.").max(300),
  reason: z.string().trim().max(500).nullish(),
  lines: z
    .array(z.object({ accountId: z.string().uuid(), debit: amount.nullish(), credit: amount.nullish(), memo: z.string().trim().max(300).nullish() }))
    .min(2, "An adjustment needs at least two lines."),
});

const act = (shape, fn) =>
  asyncHandler(async (req, res) => {
    const parsed = shape.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      res.json(await asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id, ...parsed.data })));
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  });

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json(await asCompany(req, (client) => periods.overview(client, { companyId: req.companyId })));
  })
);

/** What is unfinished up to a date, so somebody can look before closing. */
router.get(
  "/doubts",
  requireCan("close"),
  asyncHandler(async (req, res) => {
    const through = String(req.query.through || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) throw ApiError.badRequest("Which month end?");
    res.json(await asCompany(req, (client) => periods.doubtsFor(client, { companyId: req.companyId, through })));
  })
);

/** Every account an adjustment can name. */
router.get(
  "/accounts",
  requireCan("adjust"),
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT id, code, name, type FROM accounts WHERE company_id = $1 AND archived_at IS NULL ORDER BY code`,
        [req.companyId]
      );
      return found;
    });
    res.json({ accounts: rows });
  })
);

router.post("/close", requireCan("close"), act(closeBody, periods.close));
router.post("/reopen", requireCan("close"), act(reopenBody, periods.reopen));
router.post(
  "/adjust",
  requireCan("adjust"),
  act(adjustBody, async (client, args) => {
    const r = await periods.adjust(client, args);
    return { entryId: r.entry.id, entryNo: String(r.entry.entryNo), intoClosedPeriod: r.intoClosedPeriod, total: formatLaari(r.entry.totalLaari) };
  })
);

module.exports = router;
