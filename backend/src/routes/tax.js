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
        tax.setRate(client, { companyId: req.companyId, userId: req.user.id, ...req.body })
      );
      res.status(201).json(out);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;
