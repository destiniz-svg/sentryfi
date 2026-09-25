const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const advances = require("../ledger/advances");

/**
 * Retainer and proforma invoices, and money customers pay in advance.
 * See ledger/advances.js.
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(err.message);
    }
  });
const parse = (schema, body) => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw ApiError.badRequest(r.error.issues[0].message);
  return r.data;
};
const ctx = (req) => ({ companyId: req.companyId, userId: req.user.id });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const money = z.union([z.string().trim(), z.number()]).transform(String);
const uuid = z.string().uuid();

router.get(
  "/",
  requireCan("read"),
  refused(async (req, res) => {
    res.json(
      await asCompany(req, async (client) => ({
        requests: await advances.list(client, ctx(req)),
        held: await advances.money(client, ctx(req)),
        payInto: (await client.query("SELECT id, code, name FROM accounts WHERE company_id = $1 AND archived_at IS NULL AND type = 'asset' AND (code LIKE '11%' OR code LIKE '12%') ORDER BY code", [req.companyId])).rows,
        customers: (await client.query("SELECT id, name FROM counterparties WHERE company_id = $1 AND archived_at IS NULL AND 'customer' = ANY(kind) ORDER BY lower(name)", [req.companyId])).rows,
      }))
    );
  })
);

const line = z.object({ description: z.string().trim().min(1).max(300), quantity: z.coerce.number().positive().default(1), unitPrice: money, unit: z.string().max(20).nullish(), itemId: uuid.nullish() });
router.post(
  "/requests",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(
      z.object({
        kind: z.enum(["retainer", "proforma"]),
        counterpartyId: uuid.nullish(),
        customerName: z.string().max(160).nullish(),
        issueDate: date.nullish(),
        dueDate: date.nullish(),
        gstTreatment: z.enum(["exclusive", "inclusive", "zero_rated", "exempt"]).nullish(),
        subject: z.string().max(300).nullish(),
        notes: z.string().trim().max(2000).nullish(),
        projectId: uuid.nullish(),
        lines: z.array(line).min(1, "Say what it is for.").max(100),
      }),
      req.body
    );
    const r = await asCompany(req, (client) => advances.create(client, { ...ctx(req), ...b }));
    res.status(201).json({ id: r.id, number: r.number });
  })
);
router.post(
  "/requests/:id/cancel",
  requireCan("record"),
  refused(async (req, res) => {
    await asCompany(req, (client) => advances.cancel(client, { companyId: req.companyId, id: req.params.id, reason: req.body?.reason }));
    res.json({ ok: true });
  })
);
router.post(
  "/requests/:id/invoice",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ issueDate: date.nullish(), dueDate: date.nullish() }), req.body);
    const r = await asCompany(req, (client) => advances.invoiceProforma(client, { ...ctx(req), id: req.params.id, ...b }));
    res.status(201).json({ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo });
  })
);
router.post(
  "/receive",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ requestId: uuid.nullish(), counterpartyId: uuid.nullish(), amount: money, receivedOn: date.nullish(), accountId: uuid, reference: z.string().max(120).nullish() }), req.body);
    res.status(201).json(await asCompany(req, (client) => advances.receive(client, { ...ctx(req), ...b })));
  })
);
router.post(
  "/:id/use",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ invoiceId: uuid, amount: money.nullish(), on: date.nullish() }), req.body);
    res.status(201).json(await asCompany(req, (client) => advances.useAgainst(client, { ...ctx(req), advanceId: req.params.id, ...b })));
  })
);
router.post(
  "/:id/refund",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ amount: money.nullish(), on: date.nullish(), fromAccountId: uuid }), req.body);
    res.status(201).json(await asCompany(req, (client) => advances.refund(client, { ...ctx(req), advanceId: req.params.id, ...b })));
  })
);
// A customer's invoices that an advance could pay.
router.get(
  "/:id/invoices",
  requireCan("read"),
  refused(async (req, res) => {
    res.json({
      invoices: await asCompany(req, async (client) => {
        const [a] = await advances.held(client, { companyId: req.companyId, advanceId: req.params.id });
        if (!a) throw new Error("That advance is not in these books.");
        const { rows } = await client.query(
          `SELECT s.id, s.invoice_no, s.issue_date::text AS issued,
                  s.gross_laari - COALESCE((SELECT SUM(x.amount_laari) FROM receipt_allocations x JOIN receipts r ON r.id = x.receipt_id AND r.voided_at IS NULL WHERE x.invoice_id = s.id), 0)
                               - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = s.id), 0) AS owed
             FROM sales_invoices s
            WHERE s.company_id = $1 AND s.counterparty_id = $2 AND s.status = 'posted' AND s.voided_at IS NULL AND s.fc_gross IS NULL
            ORDER BY s.issue_date`,
          [req.companyId, a.counterparty_id]
        );
        const { formatLaari } = require("../ledger/money");
        return rows.filter((r) => BigInt(r.owed) > 0n).map((r) => ({ id: r.id, number: r.invoice_no, issued: r.issued, owed: formatLaari(BigInt(r.owed)) }));
      }),
    });
  })
);

module.exports = router;
