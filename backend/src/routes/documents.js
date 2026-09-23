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
    if (JSON.stringify(settings).length > 20_000) throw ApiError.badRequest("That template is too large.");
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

module.exports = router;
