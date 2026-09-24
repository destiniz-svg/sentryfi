const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const documents = require("../ledger/documents");

/**
 * Documents: the brand kit, a template per kind of document, and a document
 * to draw (the issued copy when there is one). See ledger/documents.js.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

// An image arrives as a data URL, already shrunk in the browser.
const image = z.string().max(700_000).regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, "An image, as PNG, JPEG, WebP or SVG.").or(z.literal(""));
const line = (n) => z.string().trim().max(n).optional();
const brandBody = z.object({
  name: line(120),
  tagline: line(160),
  address: line(400),
  phone: line(60),
  email: line(120),
  website: line(120),
  logo: image.optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  font: z.enum(["barlow", "inter", "plex", "source-serif", "lora", "space-grotesk"]).optional(),
  stamp: image.optional(),
  signature: image.optional(),
  signatory: line(120),
  signatoryTitle: line(120),
  paymentDetails: line(800),
  footer: line(400),
});

router.get(
  "/brand",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const brand = await asCompany(req, (client) => documents.brandOf(client, { companyId: req.companyId }));
    // Filled in once from the old per-person company profile, until the kit is saved.
    let earlier = null;
    if (!brand.savedAt) {
      const s = await require("../models/Settings").ensure(req.user.id).catch(() => null);
      if (s) earlier = { logo: s.logo_url || "", address: s.address || "", phone: s.phone || "", email: s.email || "" };
    }
    res.json({ brand, earlier });
  })
);

router.put(
  "/brand",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const p = brandBody.safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    const brand = { ...p.data, savedAt: new Date().toISOString() };
    await asCompany(req, (client) => client.query("UPDATE companies SET brand = $2 WHERE id = $1", [req.companyId, JSON.stringify(brand)]));
    res.json({ ok: true });
  })
);

const kind = (req) => {
  if (!documents.KINDS.includes(req.params.kind)) throw ApiError.badRequest("That is not a kind of document.");
  return req.params.kind;
};

router.get(
  "/templates",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const { rows } = await asCompany(req, (client) => client.query("SELECT kind, settings FROM document_templates WHERE company_id = $1", [req.companyId]));
    res.json({ templates: Object.fromEntries(rows.map((r) => [r.kind, r.settings])) });
  })
);

router.get(
  "/templates/:kind",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const k = kind(req);
    res.json({ template: await asCompany(req, (client) => documents.templateOf(client, { companyId: req.companyId, kind: k })) });
  })
);

router.put(
  "/templates/:kind",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const k = kind(req);
    const settings = req.body?.template;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw ApiError.badRequest("A template.");
    if (settings.copies && (!Array.isArray(settings.copies) || settings.copies.length > 12)) throw ApiError.badRequest("Up to 12 designs of your own for each kind of document.");
    if (JSON.stringify(settings).length > 200_000) throw ApiError.badRequest("That template is too large.");
    await asCompany(req, (client) =>
      client.query(
        `INSERT INTO document_templates (company_id, kind, settings, updated_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id, kind) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [req.companyId, k, JSON.stringify(settings), req.user.id]
      )
    );
    res.json({ ok: true });
  })
);

router.get(
  "/:kind/:id",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const k = kind(req);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such document.");
    try {
      res.json(await asCompany(req, (client) => documents.show(client, { companyId: req.companyId, kind: k, documentId: req.params.id })));
    } catch (err) {
      throw ApiError.notFound(err.message);
    }
  })
);

// A customer's questions about a document, and the company's answer.
const QUESTIONED = ["invoice", "quote", "proforma", "retainer"];
router.get(
  "/:kind/:id/questions",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    if (!QUESTIONED.includes(req.params.kind)) return res.json({ questions: [] });
    const questions = require("../ledger/questions");
    try {
      res.json({ questions: await asCompany(req, async (client) => {
        await questions.ownerOf(client, { companyId: req.companyId, kind: req.params.kind, documentId: req.params.id });
        return questions.thread(client, { companyId: req.companyId, kind: req.params.kind, documentId: req.params.id });
      }) });
    } catch (err) {
      throw ApiError.notFound(err.message);
    }
  })
);
router.post(
  "/:kind/:id/questions",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    if (!QUESTIONED.includes(req.params.kind)) throw ApiError.badRequest("Customers ask about invoices, quotes, proformas and retainers.");
    try {
      res.status(201).json({ questions: await asCompany(req, (client) => require("../ledger/questions").answer(client, { companyId: req.companyId, userId: req.user.id, kind: req.params.kind, documentId: req.params.id, body: req.body?.body })) });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/**
 * Is this paper genuine? Public: the QR code on an issued document carries its
 * fingerprint, and whoever holds the paper can check it against the copy kept
 * when it was issued. The fingerprint is 64 hex characters, so it cannot be
 * guessed; it answers only what the paper already says, plus whether it has
 * since been cancelled.
 */
const verify = express.Router();
const checking = require("express-rate-limit").rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
verify.get(
  "/:sha",
  checking,
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f]{64}$/.test(req.params.sha)) throw ApiError.notFound("No document has that fingerprint.");
    const { pool } = require("../config/db");
    // Outside the walls on purpose: the reader has no company. One row, found by an unguessable key.
    const { rows } = await pool.query("SELECT kind, document_id, body, created_at FROM document_copies WHERE sha256 = $1 LIMIT 1", [req.params.sha]);
    const c = rows[0];
    if (!c) throw ApiError.notFound("No document has that fingerprint.");
    let cancelled = false;
    if (c.kind === "invoice") cancelled = Boolean((await pool.query("SELECT voided_at FROM sales_invoices WHERE id = $1", [c.document_id])).rows[0]?.voided_at);
    const d = c.body.data || {};
    const b = c.body.brand || {};
    res.set("Cache-Control", "no-store");
    res.json({
      kind: c.kind,
      from: b.name || b.legalName || null,
      tin: b.tin || null,
      number: d.number,
      issued: d.issued,
      to: d.to?.name || null,
      currency: d.currency || b.baseCurrency || "MVR",
      total: d.totals?.gross || null,
      keptAt: c.created_at,
      cancelled,
    });
  })
);

module.exports = router;
module.exports.verify = verify;
