const express = require("express");
const { pool } = require("../config/db");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const { findOrCreate } = require("../ledger/counterparties");
const stock = require("../ledger/stock");
const sales = require("../ledger/sales");
const { today: localToday } = require("../ledger/today");

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
  notes: z.string().trim().max(2000).nullish(),
  issueDate: z.string().trim().nullish(),
  dueDate: z.string().trim().nullish(),
  gstTreatment: z
    .enum(["inclusive", "exclusive", "none_unregistered", "exempt", "zero_rated", "unknown"])
    .default("exclusive"),
  gstRateBp: z.number().int().min(0).max(10000).nullish(),
  projectId: z.string().uuid().nullish(),
  dimensionIds: z.array(z.string().uuid()).max(6).nullish(),
  // Another currency: its code, and how many of ours one of it bought on the invoice date.
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "A currency is three letters, like USD.").nullish(),
  fxRate: z.union([z.string().trim(), z.number()]).transform(String).nullish(),
  clientRef: z.string().uuid().nullish(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().max(400).default(""),
        quantity: z.number().default(1),
        uom: z.string().trim().max(20).nullish(),
        unitPrice: amount.optional(),
        discountPercent: z.coerce.number().min(0).max(100).nullish(),
        amount: amount.optional(),
        accountId: z.string().uuid().nullish(),
        projectId: z.string().uuid().nullish(),
        itemId: z.string().uuid().nullish(),
      })
    )
    .min(1, "An invoice needs at least one line."),
});

const newReceipt = z.object({
  counterpartyId: z.string().uuid().nullish(),
  amount: amount.nullish(),
  // Money in another currency: how much of it, and the day's rate.
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullish(),
  amountFc: amount.nullish(),
  rate: z.union([z.string().trim(), z.number()]).transform(String).nullish(),
  accountId: z.string().uuid("Which account did it land in?"),
  receivedOn: z.string().trim().nullish(),
  reference: z.string().trim().max(200).nullish(),
  allocations: z
    .array(z.object({ invoiceId: z.string().uuid(), amount: amount.nullish(), amountFc: amount.nullish() }))
    .default([]),
});

const newCredit = z.object({
  reason: z.string().trim().min(3, "Say why this is being credited.").max(500),
  amount: amount.nullish(),
  noteNo: z.string().trim().max(60).nullish(),
  issueDate: z.string().trim().nullish(),
  returned: z.array(z.object({ itemId: z.string().uuid(), quantity: z.union([z.string().trim(), z.number()]).transform(String) })).max(50).optional(),
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
                          WHERE n.invoice_id = s.id), 0) AS credited,
                COALESCE((SELECT SUM(a.amount_fc) FROM receipt_allocations a
                           JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
                          WHERE a.invoice_id = s.id), 0) AS paid_fc
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
          customerId: s.counterparty_id,
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
          // In another currency: the invoice's own figures, and what is left in them.
          foreign: s.fc_gross
            ? {
                currency: s.currency.trim(),
                rate: String(s.fx_rate).replace(/0+$/, "").replace(/\.$/, ""),
                gross: money(s.fc_gross),
                outstanding: money((BigInt(s.fc_gross) - BigInt(s.paid_fc)).toString()),
              }
            : null,
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

/**
 * What a new invoice copied from this one starts with: who, what, and on
 * which terms. Never its number, dates or customer reference, which belong to
 * the one it came from. Nothing is saved until a person saves the copy.
 */
router.get(
  "/:id/copy",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such invoice.");
    const found = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT s.invoice_no, s.counterparty_id, c.name AS customer, c.payment_terms_days, c.email, s.subject, s.notes,
                s.gst_treatment, s.currency, s.fx_rate, s.fc_gross, s.project_id, s.dimension_ids
           FROM sales_invoices s LEFT JOIN counterparties c ON c.id = s.counterparty_id
          WHERE s.id = $1 AND s.company_id = $2`,
        [req.params.id, req.companyId]
      );
      if (!rows[0]) return null;
      const { rows: lines } = await client.query(
        `SELECT description, quantity::text AS quantity, uom, unit_price_laari, discount_bp, item_id
           FROM sales_invoice_lines WHERE invoice_id = $1 AND company_id = $2 ORDER BY position`,
        [req.params.id, req.companyId]
      );
      return { s: rows[0], lines };
    });
    if (!found) throw ApiError.notFound("That invoice is not in these books.");
    const { s, lines } = found;
    const foreign = s.fc_gross !== null && s.fc_gross !== undefined;
    res.json({
      from: s.invoice_no,
      customer: { id: s.counterparty_id, name: s.customer, termsDays: s.payment_terms_days ?? null, email: s.email },
      subject: s.subject,
      notes: s.notes,
      gstTreatment: s.gst_treatment,
      currency: foreign ? String(s.currency).trim() : null,
      fxRate: foreign && s.fx_rate ? String(Number(s.fx_rate)) : null,
      projectId: s.project_id,
      dimensionIds: s.dimension_ids || [],
      discountPercent: lines[0]?.discount_bp ? lines[0].discount_bp / 100 : null,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: String(Number(l.quantity)),
        uom: l.uom || "",
        rate: money(l.unit_price_laari).replace(/,/g, ""),
        itemId: l.item_id,
      })),
    });
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
        let matchedTo = null;
        if (!counterpartyId && b.customerName) {
          // The customer's record fills itself in over time, exactly as a
          // supplier's does. Nobody types a customer into existence first.
          const found = await findOrCreate(client, {
            companyId: req.companyId,
            userId: req.user.id,
            name: b.customerName,
            kind: "customer",
          });
          // findOrCreate answers { party, created, matchedOn }. Reading .id off
          // that wrapper gave undefined, and every invoice was saved with no
          // customer — which then could not be posted.
          counterpartyId = found.party.id;
          // A close-but-not-exact name was taken as an existing customer. That
          // is right for "Road Development Corp." and wrong for two different
          // councils whose names happen to overlap, so it is never silent: the
          // screen says which customer the invoice was filed under.
          if (found.matchedOn === "similar-name" && found.party.name !== b.customerName) {
            matchedTo = found.party.name;
          }
        }

        const raised = await sales.raise(client, {
          companyId: req.companyId,
          userId: req.user.id,
          ...b,
          counterpartyId,
        });
        return { invoice: raised.invoice, matchedTo };
      });

      res.status(result.alreadyHad ? 200 : 201).json({
        invoice: {
          id: result.invoice.id,
          invoiceNo: result.invoice.invoice_no,
          gross: result.invoice.gross_laari ? money(result.invoice.gross_laari) : undefined,
        },
        alreadyHad: Boolean(result.alreadyHad),
        matchedTo: result.matchedTo || null,
      });
    } catch (err) {
      // A number that is already used is an ordinary thing to run into — two
      // people raising invoices at once, or a number typed by hand — and it
      // used to reach the screen as a Postgres constraint name. Say it in
      // words, with the number that is free.
      if (err.code === "23505" && /sales_invoice_no_once/.test(err.constraint || err.message)) {
        const free = await asCompany(req, (client) =>
          sales.nextInvoiceNo(client, { companyId: req.companyId })
        ).catch(() => null);
        throw ApiError.badRequest(
          `${b.invoiceNo || "That number"} is already used by another invoice.` +
            (free ? ` The next free number is ${free}.` : "")
        );
      }
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
      require("../services/webhooks").emit(req.companyId, "invoice.posted", { invoiceId: req.params.id, entryNo: String(result.entry.entryNo), total: formatLaari(result.entry.totalLaari) });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/**
 * An invoice said in a sentence ("22 days of excavator hire to Blue Lagoon at
 * 3,000 a day, plus mobilisation 4,500, due in 30 days"), turned into the
 * form's fields for a person to check. Nothing is saved: it fills the form,
 * and the person saves it. Only what was said is filled; the rest is left empty.
 */
router.post(
  "/from-words",
  requireCan("record"),
  require("../middleware/rateLimit").aiLimiter,
  asyncHandler(async (req, res) => {
    const text = String(req.body?.text || "").trim().slice(0, 1000);
    if (text.length < 5) throw ApiError.badRequest("Say what the invoice is for.");
    if (!process.env.GEMINI_API_KEY) throw ApiError.badRequest("Filling from a sentence needs a Gemini key on the server.");
    const today = localToday();
    try {
      const out = await require("../services/geminiService").generate({
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          systemInstruction:
            `Today is ${today}. Turn the person's words into an invoice's fields. Fill only what they said; never invent a customer, a price, a quantity or a date. ` +
            "Money is digits with at most one dot, no commas or currency. A line is one charge: what, how many, the unit if said (DAY, HR, LOT, M3…), and the price for one. " +
            "If they gave a total for a line and no price for one, put quantity 1 and that total as the rate. Due date as YYYY-MM-DD, worked out from 'due in N days' if said. " +
            "gstTreatment only if they said: 'plus GST' is exclusive, 'including GST' is inclusive, 'no GST' is none_unregistered; otherwise null.",
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              customerName: { type: "string", nullable: true },
              subject: { type: "string", nullable: true },
              purchaseOrder: { type: "string", nullable: true },
              dueDate: { type: "string", nullable: true },
              gstTreatment: { type: "string", enum: ["exclusive", "inclusive", "none_unregistered"], nullable: true },
              lines: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "string", nullable: true }, unit: { type: "string", nullable: true }, rate: { type: "string", nullable: true } }, required: ["description"] } },
            },
            required: ["lines"],
          },
          temperature: 0,
        },
      });
      const p = JSON.parse(out);
      const num = (v) => (v && /^\d+(\.\d+)?$/.test(String(v).replace(/,/g, "")) ? String(v).replace(/,/g, "") : "");
      res.json({
        customerName: p.customerName || "",
        subject: p.subject || "",
        purchaseOrder: p.purchaseOrder || "",
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate || "") ? p.dueDate : null,
        gstTreatment: p.gstTreatment || null,
        lines: (p.lines || []).slice(0, 30).map((l) => ({ description: String(l.description || "").slice(0, 400), quantity: num(l.quantity) || "1", uom: String(l.unit || "").slice(0, 20), rate: num(l.rate) })),
      });
    } catch (err) {
      console.error(JSON.stringify({ at: "sales/from-words", error: err.message }));
      throw ApiError.badRequest("That could not be read into an invoice. Fill the form instead.");
    }
  })
);

/**
 * Emails an invoice to its customer: a private link to their page, where the
 * invoice is drawn exactly as issued (and can be printed or saved as a PDF)
 * beside what they owe. Sent from Sentryfi on the company's behalf; replies go
 * to the company's own address. A new link each time; each can be turned off.
 */
router.post(
  "/:id/email",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such invoice.");
    const p = z.object({ to: z.string().trim().email("That is not an email address.").optional(), note: z.string().trim().max(600).optional() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    const env = require("../config/env");
    const found = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT s.invoice_no, s.status, s.voided_at, s.counterparty_id, s.gross_laari, s.fc_gross, trim(s.currency) AS currency, s.due_date::text AS due,
                c.name AS customer, c.email, co.name AS company, co.brand ->> 'email' AS company_email, trim(co.base_currency) AS base
           FROM sales_invoices s JOIN counterparties c ON c.id = s.counterparty_id JOIN companies co ON co.id = s.company_id
          WHERE s.id = $1 AND s.company_id = $2`,
        [req.params.id, req.companyId]
      );
      return rows[0] || null;
    });
    if (!found) throw ApiError.notFound("No such invoice.");
    if (found.status !== "posted" || found.voided_at) throw ApiError.badRequest("Only an invoice in the books is sent. Put it in the books first.");
    const to = p.data.to || found.email;
    if (!to) throw ApiError.badRequest(`What is ${found.customer}'s email address?`);
    const token = require("crypto").randomBytes(24).toString("base64url");
    await pool.query("INSERT INTO portal_links (company_id, counterparty_id, token_hash, created_by) VALUES ($1,$2,$3,$4)", [
      req.companyId, found.counterparty_id, require("crypto").createHash("sha256").update(token).digest("hex"), req.user.id,
    ]);
    const amount = found.fc_gross ? `${found.currency} ${formatLaari(BigInt(found.fc_gross))}` : `${found.base} ${formatLaari(BigInt(found.gross_laari))}`;
    await require("../services/email").send({
      to,
      subject: `Invoice ${found.invoice_no} from ${found.company}`,
      lines: [
        `${found.company} has sent you invoice ${found.invoice_no} for ${amount}${found.due ? `, due ${found.due}` : ""}.`,
        ...(p.data.note ? [p.data.note] : []),
        "The link below shows it exactly as issued, beside everything else you have been invoiced and what is still to pay. You can print it or save it as a PDF there.",
      ],
      link: { label: "See the invoice", url: `${env.publicUrl}/portal/${token}` },
      ...(found.company_email ? { replyTo: `${found.company} <${found.company_email}>` } : {}),
    });
    res.json({ ok: true, to });
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
        // Money in another currency: what the rate moved between the invoice and the payment.
        exchange: result.exchange === undefined ? null : formatLaari(result.exchange < 0n ? -result.exchange : result.exchange),
        exchangeLoss: result.exchange !== undefined && result.exchange < 0n,
      });
      require("../services/webhooks").emit(req.companyId, "money.received", { receiptId: result.receipt.id, entryNo: String(result.entry.entryNo), applied: formatLaari(result.allocated), onAccount: formatLaari(result.onAccount) });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** What of each item an invoice sold could still come back on a credit note. */
router.get(
  "/:id/returnable",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const items = await asCompany(req, (client) => stock.returnable(client, { companyId: req.companyId, invoiceId: req.params.id }));
    res.json({ items: items.map((i) => ({ itemId: i.itemId, name: i.name, unit: i.unit, quantity: stock.unitsText(i.units) })) });
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
        id: result.note.id,
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

/**
 * Discards a draft.
 *
 * Only a draft. An invoice that is in the books has told the customer and the
 * tax authority something, and it comes back out with a credit note — never
 * by being marked void underneath its entry, which is how a bill once left
 * 312.00 stranded in what a company owed.
 */
router.delete(
  "/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const reason = z.string().trim().min(3).max(500).safeParse(req.body?.reason);
    if (!reason.success) throw ApiError.badRequest("Say why this draft is being discarded.");

    const voided = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT id, entry_id, voided_at FROM sales_invoices WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.companyId]
      );
      const invoice = found[0];
      if (!invoice) throw ApiError.notFound("Invoice not found");
      if (invoice.voided_at) throw ApiError.badRequest("This invoice was discarded already.");
      if (invoice.entry_id) {
        throw ApiError.badRequest(
          "This invoice is in the books. Raise a credit note for it instead — that takes it " +
            "back out of what the customer owes, and the GST with it."
        );
      }
      const { rows } = await client.query(
        `UPDATE sales_invoices
            SET voided_at = now(), void_reason = $3, status = 'void', updated_at = now()
          WHERE id = $1 AND company_id = $2 RETURNING id`,
        [req.params.id, req.companyId, reason.data]
      );
      return rows[0];
    });

    res.json({ ok: Boolean(voided) });
  })
);

module.exports = router;
