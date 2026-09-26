const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const contacts = require("../ledger/contacts");

/** Customers and suppliers (/api/contacts): read by anyone who reads the books, changed by anyone who records. */
const router = express.Router();
router.use(requireAuth, requireCompany);

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json(await asCompany(req, (client) => contacts.list(client, { companyId: req.companyId })));
  })
);

router.get(
  "/:id",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json(await asCompany(req, (client) => contacts.show(client, { companyId: req.companyId, id: req.params.id })));
  })
);

const text = (max) => z.string().max(max).nullable().optional();
const fields = z.object({
  name: z.string().min(1).max(200).optional(),
  customer: z.boolean().optional(),
  supplier: z.boolean().optional(),
  email: z.union([z.string().trim().email("That is not an email address."), z.literal(""), z.null()]).optional(),
  phone: text(40),
  address: text(500),
  tin: text(40),
  gstNumber: text(40),
  notes: text(2000),
  paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
  creditLimit: z.string().regex(/^\d+(\.\d{1,2})?$/, "The credit limit is an amount.").or(z.literal("")).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  archived: z.boolean().optional(),
  // A supplier's bills: for what arrived, or for what was ordered (paid ahead).
  billControl: z.enum(["received", "ordered"]).optional(),
});
const parse = (body) => {
  const p = fields.safeParse(body ?? {});
  if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
  return p.data;
};

router.post(
  "/",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const body = parse(req.body);
    const id = await asCompany(req, (client) => contacts.create(client, { companyId: req.companyId, body, force: req.body?.force === true }));
    res.status(201).json({ id });
  })
);

router.patch(
  "/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const body = parse(req.body);
    await asCompany(req, (client) => contacts.update(client, { companyId: req.companyId, id: req.params.id, body }));
    res.json({ ok: true });
  })
);

router.post(
  "/:id/people",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const p = z
      .object({ id: z.string().uuid().optional(), name: z.string().min(1).max(120), role: text(60), phone: text(40), email: text(200), forAccounts: z.boolean().optional(), removed: z.boolean().optional() })
      .safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Give the person a name.");
    await asCompany(req, (client) => contacts.savePerson(client, { companyId: req.companyId, id: req.params.id, person: p.data }));
    res.json({ ok: true });
  })
);

/** What they owed, or were owed, before these books began. */
router.post(
  "/:id/opening",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const p = z.object({ side: z.enum(["customer", "supplier"]), amount: z.union([z.string(), z.number()]).transform((v) => String(v).replace(/,/g, "")), on: z.string() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Say how much, which way, and as at which day.");
    try {
      res.status(201).json(await asCompany(req, (client) => contacts.setOpening(client, { companyId: req.companyId, userId: req.user.id, id: req.params.id, ...p.data })));
    } catch (err) {
      throw err.statusCode ? err : ApiError.badRequest(err.message);
    }
  })
);

/** Two records that are one business: this one kept, the other folded into it. */
router.post(
  "/:id/merge",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const p = z.object({ otherId: z.string().uuid() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Which record is the same business?");
    await asCompany(req, (client) => contacts.merge(client, { companyId: req.companyId, keepId: req.params.id, loseId: p.data.otherId }));
    res.json({ ok: true });
  })
);

/** Take a detail a document disagreed with, or keep what is on file. Changing where money goes is for those who approve. */
router.post(
  "/:id/doubts/:doubtId",
  requireCan("approve"),
  asyncHandler(async (req, res) => {
    await asCompany(req, (client) => contacts.settleDoubt(client, { companyId: req.companyId, userId: req.user.id, id: req.params.id, doubtId: req.params.doubtId, take: req.body?.take === true }));
    res.json({ ok: true });
  })
);

module.exports = router;
