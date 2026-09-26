const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { validate } = require("../middleware/validate");
const { asCompany } = require("../ledger/session");
const tax = require("../ledger/tax");

/** The company's tax pack and rates, and changing a rate from a date. */

const router = express.Router();
router.use(requireAuth, requireCompany);

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const on = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.on || "")) ? req.query.on : undefined;
    res.json(await asCompany(req, (client) => tax.overview(client, { companyId: req.companyId, on })));
  })
);

router.post(
  "/rates",
  requireCan("manage_settings"),
  validate(
    z.object({
      rate: z.string().trim().max(40).nullish(),
      bp: z.number().int().min(0).max(10000),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
      reason: z.string().trim().min(3, "Say why the rate changes.").max(300),
    })
  ),
  asyncHandler(async (req, res) => {
    try {
      const out = await asCompany(req, (client) =>
        tax.setRate(client, { ...req.body, companyId: req.companyId, userId: req.user.id })
      );
      res.status(201).json(out);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

// ---- withholding tax on payments to non-residents
const nwt = require("../ledger/nwt");

router.get(
  "/withholding",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const key = /^\d{4}-\d{2}$/.test(String(req.query.month || "")) ? req.query.month : require("../ledger/today").today().slice(0, 7);
    res.json(
      await asCompany(req, async (client) => {
        const rules = await nwt.rules(client, { companyId: req.companyId });
        if (!rules) return { available: false };
        return {
          available: true,
          categories: Object.entries(rules.categories).map(([code, c]) => ({ code, label: c.label, ratePct: c.bp / 100 })),
          suppliers: await nwt.suppliers(client, { companyId: req.companyId }),
          month: await nwt.month(client, { companyId: req.companyId, key }),
        };
      })
    );
  })
);

router.put(
  "/withholding/suppliers/:id",
  requireCan("manage_settings"),
  validate(z.object({ category: z.string().trim().max(40).nullable() })),
  asyncHandler(async (req, res) => {
    try {
      await asCompany(req, (client) => nwt.setSupplier(client, { companyId: req.companyId, counterpartyId: req.params.id, category: req.body.category }));
      res.json({ ok: true });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

// ---- the year as the income tax return reads it
const incomeTax = require("../ledger/incomeTax");

router.get(
  "/income",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const y = /^\d{4}$/.test(String(req.query.year || "")) ? Number(req.query.year) : Number(require("../ledger/today").today().slice(0, 4)) - 1;
    res.json(await asCompany(req, (client) => incomeTax.year(client, { companyId: req.companyId, year: y })));
  })
);

router.put(
  "/income/lines/:code",
  requireCan("manage_settings"),
  validate(z.object({ line: z.string().trim().max(40).nullable() })),
  asyncHandler(async (req, res) => {
    try {
      await asCompany(req, (client) => incomeTax.setLine(client, { companyId: req.companyId, code: req.params.code, line: req.body.line }));
      res.json({ ok: true });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;
