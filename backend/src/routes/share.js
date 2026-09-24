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
const env = require("../config/env");
const documents = require("../ledger/documents");
const { today: localToday } = require("../ledger/today");

/**
 * Sharing a document: a link to copy, send on WhatsApp or Viber, or email.
 *
 * A customer's invoice, quote, proforma or retainer opens on their portal
 * page at that document, where they can accept it, ask about it and see how
 * to pay. Anything else (a purchase order to a supplier, a delivery note, a
 * credit note, a receipt, a statement) gets a private link to that one
 * document, read-only and printable.
 */

const hash = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");
const ON_PORTAL = ["invoice", "quote", "proforma", "retainer"];
const ALONE = ["sales_order", "delivery_note", "goods_received", "credit_note", "receipt", "statement", "purchase_order"];
const LABEL = {
  invoice: "invoice", quote: "quotation", proforma: "proforma invoice", retainer: "retainer invoice", sales_order: "sales order",
  delivery_note: "delivery note", goods_received: "goods received note", credit_note: "credit note", receipt: "receipt",
  statement: "statement", purchase_order: "purchase order",
};

// ------------------------------------------------------------------ the company's side

const manage = express.Router();
manage.use(requireAuth, requireCompany);

/** Is it in a state to send, and who is it for? */
async function sendable(client, { companyId, kind, id }) {
  const shown = await documents.show(client, { companyId, kind, documentId: id });
  const d = shown.data;
  if (kind === "invoice" && (d.status === "draft" || d.status === "void")) throw new Error("Only an invoice in the books is sent. Put it in the books first.");
  if (["proforma", "retainer"].includes(kind) && d.watermark === "WITHDRAWN") throw new Error("This has been withdrawn.");
  if (kind === "purchase_order" && d.watermark === "NOT APPROVED") throw new Error("This order is waiting for approval; approve it before sending.");
  const { rows: co } = await client.query("SELECT name, brand ->> 'email' AS email, trim(base_currency) AS base FROM companies WHERE id = $1", [companyId]);
  return { d, company: co[0] };
}

manage.post(
  "/:kind/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const kind = req.params.kind;
    if (![...ON_PORTAL, ...ALONE].includes(kind)) throw ApiError.badRequest("That kind of document is not sent.");
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such document.");
    const p = z
      .object({ how: z.enum(["link", "email"]).default("link"), to: z.string().trim().email("That is not an email address.").optional(), note: z.string().trim().max(600).optional() })
      .safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);

    const token = crypto.randomBytes(24).toString("base64url");
    let found;
    try {
      found = await asCompany(req, async (client) => {
        const s = await sendable(client, { companyId: req.companyId, kind, id: req.params.id });
        let party = null;
        if (ON_PORTAL.includes(kind)) party = await require("../ledger/questions").ownerOf(client, { companyId: req.companyId, kind, documentId: req.params.id });
        return { ...s, party };
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
    let url;
    if (found.party) {
      await pool.query("INSERT INTO portal_links (company_id, counterparty_id, token_hash, created_by) VALUES ($1,$2,$3,$4)", [req.companyId, found.party, hash(token), req.user.id]);
      url = `${env.publicUrl}/portal/${token}?open=${kind}:${req.params.id}`;
    } else {
      await pool.query("INSERT INTO document_links (company_id, kind, document_id, token_hash, created_by) VALUES ($1,$2,$3,$4,$5)", [req.companyId, kind, req.params.id, hash(token), req.user.id]);
      url = `${env.publicUrl}/d/${token}`;
    }

    const d = found.d;
    const label = LABEL[kind];
    const amount = d.totals?.gross && kind !== "delivery_note" && kind !== "goods_received" ? `${d.currency || found.company.base} ${d.totals.gross}` : null;
    const text = `${found.company.name}: ${label} ${d.number}${amount ? ` for ${amount}` : ""}`;
    if (p.data.how === "email") {
      const to = p.data.to || d.to?.email;
      if (!to) throw ApiError.badRequest(`What is ${d.to?.name || "their"}'s email address?`);
      await require("../services/email").send({
        to,
        subject: `${label[0].toUpperCase()}${label.slice(1)} ${d.number} from ${found.company.name}`,
        lines: [
          `${found.company.name} has sent you ${label} ${d.number}${amount ? ` for ${amount}` : ""}${d.due ? `, ${(d.dueLabel || "due").toLowerCase()} ${d.due}` : ""}.`,
          ...(p.data.note ? [p.data.note] : []),
          ON_PORTAL.includes(kind)
            ? `The link opens it exactly as sent, on your page with ${found.company.name}, where you can ${kind === "invoice" ? "see what is still to pay" : "accept it"} and ask about anything on it. You can print it or save it as a PDF there.`
            : "The link opens it exactly as sent. You can print it or save it as a PDF there.",
        ],
        link: { label: `Open the ${label}`, url },
        ...(found.company.email ? { replyTo: `${found.company.name} <${found.company.email}>` } : {}),
      });
      return res.status(201).json({ url, text, to });
    }
    res.status(201).json({ url, text });
  })
);

/** Turning off every one-document link to this document (a customer's page link stays; turn that off under Customers). */
manage.delete(
  "/:kind/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such document.");
    // Checked inside the walls first: the document is this company's.
    await asCompany(req, (client) => documents.show(client, { companyId: req.companyId, kind: req.params.kind, documentId: req.params.id })).catch(() => {
      throw ApiError.notFound("No such document.");
    });
    const { rowCount } = await pool.query("UPDATE document_links SET revoked_at = now() WHERE company_id = $1 AND kind = $2 AND document_id = $3 AND revoked_at IS NULL", [req.companyId, req.params.kind, req.params.id]);
    res.json({ turnedOff: rowCount });
  })
);

// ------------------------------------------------------------------ public

const publicRouter = express.Router();
const looking = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: (req, res) => ipKeyGenerator(req, res) });

publicRouter.get(
  "/:token",
  looking,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT id, company_id, kind, document_id, created_by FROM document_links WHERE token_hash = $1 AND revoked_at IS NULL", [hash(req.params.token)]);
    const link = rows[0];
    if (!link) throw ApiError.notFound("This link has been turned off, or is not complete. Ask for a new one.");
    await pool.query("UPDATE document_links SET last_seen_at = now() WHERE id = $1", [link.id]);
    let doc;
    try {
      doc = await asCompany({ companyId: link.company_id, user: { id: link.created_by } }, async (client) => {
        const shown = await documents.show(client, { companyId: link.company_id, kind: link.kind, documentId: link.document_id });
        await require("../services/push").tell(client, {
          companyId: link.company_id, userIds: [link.created_by], kind: "done",
          title: `${shown.data.to?.name || "Someone"} opened ${LABEL[link.kind]} ${shown.data.number}`,
          body: "Through the link you sent.", href: `/documents/${link.kind}/${link.document_id}`, dedupeKey: `doclink:${link.id}:${localToday()}`,
        });
        return shown;
      });
    } catch {
      throw ApiError.notFound("This document is no longer there.");
    }
    res.set("Cache-Control", "no-store");
    res.json({ kind: link.kind, ...doc });
  })
);

module.exports = manage;
module.exports.publicRouter = publicRouter;
