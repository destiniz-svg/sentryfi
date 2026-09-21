const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const { findOrCreate } = require("../ledger/counterparties");
const sales = require("../ledger/sales");

/**
 * Invoices, receipts and credit notes.
 *
 * Every figure comes from journal lines or is derived from documents at the
 * moment it is asked for. Nothing here stores what is owed, because an
 * invoice with a "paid" column and an entry in the books is two records of
 * one fact, and two records are how they come to disagree.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const money = (laari) => formatLaari(BigInt(laari || 0));
const amount = z.union([z.string().trim().min(1), z.number()]);

const newInvoice = z.object({
  customerName: z.string().trim().min(2, "Who is this invoice to?").max(200).optional(),
  counterpartyId: z.string().uuid().nullish(),
  invoiceNo: z.string().trim().max(60).nullish(),
  purchaseOrder: z.string().trim().max(80).nullish(),
  subject: z.string().trim().max(300).nullish(),
  issueDate: z.string().trim().nullish(),
  dueDate: z.string().trim().nullish(),
  gstTreatment: z
    .enum(["inclusive", "exclusive", "none_unregistered", "exempt", "zero_rated", "unknown"])
    .default("exclusive"),
  gstRateBp: z.number().int().min(0).max(10000).nullish(),
  projectId: z.string().uuid().nullish(),
  clientRef: z.string().uuid().nullish(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().max(400).default(""),
        quantity: z.number().default(1),
        uom: z.string().trim().max(20).nullish(),
        unitPrice: amount.optional(),
        amount: amount.optional(),
        accountId: z.string().uuid().nullish(),
        projectId: z.string().uuid().nullish(),
      })
    )
    .min(1, "An invoice needs at least one line."),
});

const newReceipt = z.object({
  counterpartyId: z.string().uuid().nullish(),
  amount,
  accountId: z.string().uuid("Which account did it land in?"),
  receivedOn: z.string().trim().nullish(),
  reference: z.string().trim().max(200).nullish(),
  allocations: z
    .array(z.object({ invoiceId: z.string().uuid(), amount }))
    .default([]),
});

const newCredit = z.object({
  reason: z.string().trim().min(3, "Say why this is being credited.").max(500),
  amount: amount.nullish(),
  noteNo: z.string().trim().max(60).nullish(),
  issueDate: z.string().trim().nullish(),
});

/** Every invoice, with what is left on each. */
router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT s.*, c.name AS customer,
                COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a
                           JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
                          WHERE a.invoice_id = s.id), 0) AS paid,
                COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n
                          WHERE n.invoice_id = s.id), 0) AS credited
           FROM sales_invoices s
           LEFT JOIN counterparties c ON c.id = s.counterparty_id
          WHERE s.company_id = $1
          ORDER BY s.issue_date DESC, s.created_at DESC
          LIMIT 200`,
        [req.companyId]
      );
      return found;
    });

    res.json({
      invoices: rows.map((s) => {
        const left = BigInt(s.gross_laari) - BigInt(s.paid) - BigInt(s.credited);
        return {
          id: s.id,
          invoiceNo: s.invoice_no,
          customer: s.customer,
          purchaseOrder: s.purchase_order,
          subject: s.subject,
          issueDate: s.issue_date,
          dueDate: s.due_date,
          net: money(s.net_laari),
          tax: money(s.tax_laari),
          gross: money(s.gross_laari),
          outstanding: money(left.toString()),
          settled: left === 0n,
          status: s.status,
          voided: Boolean(s.voided_at),
          // Worth saying plainly: a corporate customer's accounts department
          // will not match an invoice without it, and it will simply not be
          // paid until somebody chases it.
          missingPurchaseOrder: !s.purchase_order,
        };
      }),
    });
  })
);

/** Who owes what, and for how long. */
router.get(
  "/aged",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const data = await asCompany(req, (client) => sales.aged(client, { companyId: req.companyId }));
    res.json(data);
  })
);

/**
 * Where money can land: the bank accounts and the cash tins. Both live under
 * 11xx and 12xx in the chart, and a receipt names which one it went into.
 */
router.get(
  "/money-accounts",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT id, code, name FROM accounts
          WHERE company_id = $1 AND type = 'asset' AND archived_at IS NULL
            AND (code LIKE '11%' OR code LIKE '12%') AND code <> '1200'
          ORDER BY code`,
        [req.companyId]
      );
      return found;
    });
    res.json({ accounts: rows.map((r) => ({ id: r.id, name: r.name, code: r.code })) });
  })
);

/** The number this company's next invoice would carry. */
router.get(
  "/next-number",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
    const invoiceNo = await asCompany(req, (client) =>
      sales.nextInvoiceNo(client, { companyId: req.companyId, prefix })
    );
    res.json({ invoiceNo });
  })
);

/** Raises one. Records it; does not put it in the books. */
router.post(
  "/",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const parsed = newInvoice.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const b = parsed.data;

    try {
      const result = await asCompany(req, async (client) => {
        // Sent before? Then this is the same invoice arriving twice.
        if (b.clientRef) {
          const { rows: already } = await client.query(
            `SELECT id, invoice_no FROM sales_invoices WHERE company_id = $1 AND client_ref = $2`,
            [req.companyId, b.clientRef]
          );
          if (already.length) return { invoice: already[0], alreadyHad: true };
        }

        let counterpartyId = b.counterpartyId || null;
        if (!counterpartyId && b.customerName) {
          // The customer's record fills itself in over time, exactly as a
          // supplier's does. Nobody types a customer into existence first.
          const found = await findOrCreate(client, {
            companyId: req.companyId,
            userId: req.user.id,
            name: b.customerName,
            kind: "customer",
          });
          counterpartyId = found.id;
        }

        const raised = await sales.raise(client, {
          companyId: req.companyId,
          userId: req.user.id,
          ...b,
          counterpartyId,
        });
        return { invoice: raised.invoice };
      });

      res.status(result.alreadyHad ? 200 : 201).json({
        invoice: {
          id: result.invoice.id,
          invoiceNo: result.invoice.invoice_no,
          gross: result.invoice.gross_laari ? money(result.invoice.gross_laari) : undefined,
        },
        alreadyHad: Boolean(result.alreadyHad),
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Puts it in the books. */
router.post(
  "/:id/post",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    try {
      const result = await asCompany(req, (client) =>
        sales.post(client, {
          companyId: req.companyId,
          userId: req.user.id,
          invoiceId: req.params.id,
        })
      );
      res.json({
        ok: true,
        entryId: result.entry.id,
        entryNo: String(result.entry.entryNo),
        total: formatLaari(result.entry.totalLaari),
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Money in. */
router.post(
  "/receipts",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const parsed = newReceipt.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const result = await asCompany(req, (client) =>
        sales.receive(client, {
          companyId: req.companyId,
          userId: req.user.id,
          ...parsed.data,
        })
      );
      res.status(201).json({
        receiptId: result.receipt.id,
        entryNo: String(result.entry.entryNo),
        applied: formatLaari(result.allocated),
        // Money that arrived without an invoice to sit against is still money
        // that arrived. Saying so is the difference between a receipt and a
        // refusal.
        onAccount: formatLaari(result.onAccount),
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Taking an invoice back, in whole or in part. */
router.post(
  "/:id/credit",
  requireCan("adjust", "record"),
  asyncHandler(async (req, res) => {
    const parsed = newCredit.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    try {
      const result = await asCompany(req, (client) =>
        sales.creditNote(client, {
          companyId: req.companyId,
          userId: req.user.id,
          invoiceId: req.params.id,
          ...parsed.data,
        })
      );
      res.status(201).json({
        noteNo: result.note.note_no,
        entryNo: String(result.entry.entryNo),
        credited: money(result.note.gross_laari),
        ofWhichTax: money(result.note.tax_laari),
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;
