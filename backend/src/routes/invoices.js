const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { query, queryOne, withTransaction } = require("../config/db");
const Settings = require("../models/Settings");
const { computeTotals, serializeInvoice } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

const uuid = z.string().uuid("Invalid id");
const idParam = z.object({ id: uuid });
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

const itemSchema = z.object({
  description: z.string().trim().max(500).default(""),
  quantity: z.coerce.number().min(0).max(1_000_000).default(1),
  rate: z.coerce.number().min(0).max(100_000_000).default(0),
});

const invoiceSchema = z.object({
  client_id: uuid.nullish(),
  invoice_number: z.string().trim().max(40).optional(),
  status: z.enum(["draft", "sent", "paid"]).default("draft"),
  issue_date: dateStr,
  due_date: dateStr,
  currency: z.string().trim().max(8).default("MVR"),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  discount: z.coerce.number().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(4000).default(""),
  terms: z.string().trim().max(2000).default(""),
  items: z.array(itemSchema).default([]),
});

async function loadInvoice(userId, id) {
  const invoice = await queryOne(
    `SELECT i.*, c.name AS client_name, c.email AS client_email,
            c.company AS client_company, c.address AS client_address
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id AND c.user_id = i.user_id
     WHERE i.id = $1 AND i.user_id = $2`,
    [id, userId]
  );
  if (!invoice) throw ApiError.notFound("Invoice not found");
  const { rows: items } = await query(
    `SELECT id, description, quantity, rate, amount, position
     FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC`,
    [id]
  );
  return serializeInvoice(invoice, items);
}

async function replaceItems(client, invoiceId, items) {
  await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [
    invoiceId,
  ]);
  for (const it of items) {
    await client.query(
      `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount, position)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [invoiceId, it.description, it.quantity, it.rate, it.amount, it.position]
    );
  }
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, client_id, search, sort = "issue_date", order = "desc" } =
      req.query;

    const params = [req.user.id];
    const where = ["i.user_id = $1"];

    if (client_id) {
      params.push(client_id);
      where.push(`i.client_id = $${params.length}`);
    }
    if (status && status !== "all") {
      if (status === "overdue") {
        where.push(`i.status = 'sent' AND i.due_date < CURRENT_DATE`);
      } else if (status === "sent") {
        where.push(`i.status = 'sent' AND (i.due_date IS NULL OR i.due_date >= CURRENT_DATE)`);
      } else {
        params.push(status);
        where.push(`i.status = $${params.length}`);
      }
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(i.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`
      );
    }

    const sortCol =
      { issue_date: "i.issue_date", total: "i.total", due_date: "i.due_date", created_at: "i.created_at" }[
        sort
      ] || "i.issue_date";
    const sortDir = order === "asc" ? "ASC" : "DESC";

    const { rows } = await query(
      `SELECT i.*, c.name AS client_name, c.company AS client_company
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${sortCol} ${sortDir}, i.created_at DESC`,
      params
    );

    res.json({ invoices: rows.map((r) => serializeInvoice(r)) });
  })
);

router.get(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.user.id, req.params.id);
    res.json({ invoice });
  })
);

router.post(
  "/",
  validate(invoiceSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const totals = computeTotals(b.items, b.tax_rate, b.discount);
    const invoiceNumber =
      b.invoice_number || (await Settings.nextInvoiceNumber(req.user.id));

    const invoice = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO invoices
          (user_id, client_id, invoice_number, status, issue_date, due_date,
           currency, tax_rate, discount, subtotal, tax_amount, total, notes, terms, paid_at)
         VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          req.user.id,
          b.client_id || null,
          invoiceNumber,
          b.status,
          b.issue_date || null,
          b.due_date || null,
          b.currency,
          b.tax_rate,
          totals.discount,
          totals.subtotal,
          totals.taxAmount,
          totals.total,
          b.notes,
          b.terms,
          b.status === "paid" ? new Date() : null,
        ]
      );
      await replaceItems(client, rows[0].id, totals.items);
      return rows[0];
    });

    res.status(201).json({ invoice: await loadInvoice(req.user.id, invoice.id) });
  })
);

router.patch(
  "/:id",
  validate(idParam, "params"),
  validate(invoiceSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await queryOne(
      `SELECT * FROM invoices WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!existing) throw ApiError.notFound("Invoice not found");

    const b = req.body;
    const taxRate = b.tax_rate ?? Number(existing.tax_rate);
    const discount = b.discount ?? Number(existing.discount);

    await withTransaction(async (client) => {

      let totals = null;
      if (b.items) totals = computeTotals(b.items, taxRate, discount);
      else if (b.tax_rate !== undefined || b.discount !== undefined) {
        const { rows: curItems } = await client.query(
          `SELECT description, quantity, rate FROM invoice_items WHERE invoice_id = $1 ORDER BY position`,
          [existing.id]
        );
        totals = computeTotals(curItems, taxRate, discount);
      }

      const sets = [];
      const values = [existing.id];
      const set = (col, val) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };

      if (b.client_id !== undefined) set("client_id", b.client_id || null);
      if (b.invoice_number !== undefined) set("invoice_number", b.invoice_number);
      if (b.status !== undefined) {
        set("status", b.status);
        set("paid_at", b.status === "paid" ? new Date() : null);
      }
      if (b.issue_date !== undefined) set("issue_date", b.issue_date);
      if (b.due_date !== undefined) set("due_date", b.due_date || null);
      if (b.currency !== undefined) set("currency", b.currency);
      if (b.notes !== undefined) set("notes", b.notes);
      if (b.terms !== undefined) set("terms", b.terms);
      if (totals) {
        set("tax_rate", taxRate);
        set("discount", totals.discount);
        set("subtotal", totals.subtotal);
        set("tax_amount", totals.taxAmount);
        set("total", totals.total);
      }

      if (sets.length) {
        await client.query(
          `UPDATE invoices SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
          values
        );
      }
      if (totals && b.items) await replaceItems(client, existing.id, totals.items);
    });

    res.json({ invoice: await loadInvoice(req.user.id, existing.id) });
  })
);

router.patch(
  "/:id/status",
  validate(idParam, "params"),
  validate(z.object({ status: z.enum(["draft", "sent", "paid"]) })),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const updated = await queryOne(
      `UPDATE invoices
       SET status = $3, paid_at = $4, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id, status, status === "paid" ? new Date() : null]
    );
    if (!updated) throw ApiError.notFound("Invoice not found");
    res.json({ invoice: await loadInvoice(req.user.id, req.params.id) });
  })
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const result = await query(
      `DELETE FROM invoices WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) throw ApiError.notFound("Invoice not found");
    res.json({ ok: true });
  })
);

module.exports = router;
