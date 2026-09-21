const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const bank = require("../ledger/bank");

/** Bank accounts and tins, and money moving between them. Every balance is read from the journal. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const newBank = z.object({ name: z.string().trim().min(2, "A bank account needs a name.").max(80) });

const newTransfer = z.object({
  fromId: z.string().uuid("Where does it come from?"),
  toId: z.string().uuid("Where does it go?"),
  amount: z.union([z.string().trim().min(1), z.number()]),
  note: z.string().trim().max(300).nullish(),
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullish(),
  clientRef: z.string().uuid().nullish(),
});

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const places = await asCompany(req, (client) => bank.places(client, { companyId: req.companyId }));
    res.json({
      places: places.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        kind: p.kind,
        balance: formatLaari(p.balance),
        overdrawn: p.balance < 0n,
      })),
    });
  })
);

router.post(
  "/",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const parsed = newBank.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const account = await asCompany(req, (client) =>
        bank.openBank(client, { companyId: req.companyId, ...parsed.data })
      );
      res.status(201).json({ account: { id: account.id, code: account.code, name: account.name } });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.post(
  "/transfer",
  requireCan("approve", "adjust"),
  asyncHandler(async (req, res) => {
    const parsed = newTransfer.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const result = await asCompany(req, (client) =>
        bank.transfer(client, { companyId: req.companyId, userId: req.user.id, ...parsed.data })
      );
      res.status(result.alreadyHad ? 200 : 201).json({
        entryId: result.entry.id,
        entryNo: String(result.entry.entryNo),
        alreadyHad: result.alreadyHad,
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;
