const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { pool } = require("../config/db");
const { formatLaari } = require("../ledger/money");

/**
 * The customer portal. /api/portal/:token is public: whoever holds the link
 * sees that one customer's invoices in that one company, read-only, and
 * nothing else. /api/portal-links is for the company: make, list and revoke
 * links, and say how customers pay.
 */

const hash = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

// ------------------------------------------------------------------ public

const publicRouter = express.Router();
const looking = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: (req, res) => ipKeyGenerator(req, res) });

publicRouter.get(
  "/:token",
  looking,
  asyncHandler(async (req, res) => {
    // Found outside the walls (the table is out of the app role's reach),
    // then read inside them, as the person who made the link.
    const { rows } = await pool.query("SELECT id, company_id, counterparty_id, created_by FROM portal_links WHERE token_hash = $1 AND revoked_at IS NULL", [hash(req.params.token)]);
    const link = rows[0];
    if (!link) throw ApiError.notFound("This link has been turned off, or is not complete. Ask for a new one.");
    await pool.query("UPDATE portal_links SET last_seen_at = now() WHERE id = $1", [link.id]);
    const view = await asCompany({ companyId: link.company_id, user: { id: link.created_by } }, async (client) => {
      const { rows: co } = await client.query("SELECT name, payment_details, tin, gst_number FROM companies WHERE id = $1", [link.company_id]);
      const { rows: party } = await client.query("SELECT name FROM counterparties WHERE id = $1 AND company_id = $2", [link.counterparty_id, link.company_id]);
      const { rows: invoices } = await client.query(
        `SELECT s.id, s.invoice_no, s.issue_date::text AS issued, s.due_date::text AS due, s.subject, s.net_laari, s.tax_laari, s.gross_laari,
                COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = s.id), 0) AS paid,
                COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = s.id), 0) AS credited
           FROM sales_invoices s
          WHERE s.company_id = $1 AND s.counterparty_id = $2 AND s.status = 'posted' AND s.voided_at IS NULL AND s.fc_gross IS NULL
          ORDER BY s.issue_date DESC LIMIT 60`,
        [link.company_id, link.counterparty_id]
      );
      const out = [];
      for (const s of invoices) {
        const { rows: lines } = await client.query("SELECT description, quantity, uom, unit_price_laari, net_laari FROM sales_invoice_lines WHERE invoice_id = $1 ORDER BY position", [s.id]);
        const owed = BigInt(s.gross_laari) - BigInt(s.paid) - BigInt(s.credited);
        out.push({
          id: s.id, number: s.invoice_no, issued: s.issued, due: s.due, subject: s.subject,
          net: formatLaari(BigInt(s.net_laari)), tax: formatLaari(BigInt(s.tax_laari)), gross: formatLaari(BigInt(s.gross_laari)),
          owed: formatLaari(owed > 0n ? owed : 0n),
          lines: lines.map((l) => ({ description: l.description, quantity: String(Number(l.quantity)), unit: l.uom, price: formatLaari(BigInt(l.unit_price_laari)), amount: formatLaari(BigInt(l.net_laari)) })),
        });
      }
      const total = out.reduce((a, i) => a + BigInt(i.owed.replace(/[,.]/g, "")), 0n);
      return {
        company: { name: co[0]?.name, paymentDetails: co[0]?.payment_details || "", tin: co[0]?.gst_number || co[0]?.tin || null },
        customer: party[0]?.name,
        owed: formatLaari(total),
        invoices: out,
      };
    });
    res.set("Cache-Control", "no-store");
    res.json(view);
  })
);

// ------------------------------------------------------------------ the company's side

const manage = express.Router();
manage.use(requireAuth, requireCompany);

manage.get(
  "/",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    // Checked inside the walls first: this person, in this company.
    const { names, details } = await asCompany(req, async (client) => ({
      names: Object.fromEntries((await client.query("SELECT id, name FROM counterparties WHERE company_id = $1", [req.companyId])).rows.map((r) => [r.id, r.name])),
      details: (await client.query("SELECT payment_details FROM companies WHERE id = $1", [req.companyId])).rows[0]?.payment_details || "",
    }));
    const { rows } = await pool.query(
      "SELECT id, counterparty_id, created_at, last_seen_at FROM portal_links WHERE company_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
      [req.companyId]
    );
    res.json({ paymentDetails: details, links: rows.map((r) => ({ id: r.id, customer: names[r.counterparty_id] || "A customer", createdAt: r.created_at, lastSeenAt: r.last_seen_at })) });
  })
);

manage.post(
  "/",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const p = z.object({ counterpartyId: z.string().uuid() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Which customer?");
    const ok = await asCompany(req, async (client) => (await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [p.data.counterpartyId, req.companyId])).rows.length);
    if (!ok) throw ApiError.badRequest("That customer is not in these books.");
    const token = crypto.randomBytes(24).toString("base64url");
    await pool.query("INSERT INTO portal_links (company_id, counterparty_id, token_hash, created_by) VALUES ($1,$2,$3,$4)", [req.companyId, p.data.counterpartyId, hash(token), req.user.id]);
    res.status(201).json({ token });
  })
);

manage.delete(
  "/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("That link is not one of this company's.");
    const { rowCount } = await pool.query("UPDATE portal_links SET revoked_at = now() WHERE id = $1 AND company_id = $2 AND revoked_at IS NULL", [req.params.id, req.companyId]);
    if (!rowCount) throw ApiError.notFound("That link is not one of this company's.");
    res.json({ ok: true });
  })
);

manage.put(
  "/payment-details",
  requireCan("manage_settings", "record"),
  asyncHandler(async (req, res) => {
    const p = z.object({ paymentDetails: z.string().trim().max(600) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Up to 600 characters.");
    await asCompany(req, (client) => client.query("UPDATE companies SET payment_details = $2 WHERE id = $1", [req.companyId, p.data.paymentDetails]));
    res.json({ ok: true });
  })
);

module.exports = manage;
module.exports.publicRouter = publicRouter;
