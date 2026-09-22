const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { validate } = require("../middleware/validate");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const gst = require("../ledger/gstReturn");
const { xlsx } = require("../utils/xlsx");

/** The GST return: what is owed so far, what would make it wrong, and the two statements. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const keyOf = (req) => (req.params.key === "current" ? null : req.params.key);
const load = (req) =>
  asCompany(req, (client) => gst.build(client, { companyId: req.companyId, key: keyOf(req) })).catch((err) => {
    throw ApiError.badRequest(err.message);
  });

router.get(
  "/:key",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const r = await load(req);
    res.json({
      period: r.period,
      periods: gst.recentKeys(r.company.gst_period).map((k) => ({ key: k, label: gst.period(k).label })),
      frequency: r.company.gst_period,
      activityNo: r.company.gst_number,
      figures: gst.figures(r),
      problems: r.problems,
      unfinished: r.unfinished,
      counts: { bills: r.bills.length, invoices: r.invoices.length },
      filed: r.filed
        ? { at: r.filed.filed_at, who: r.filed.who, reference: r.filed.reference, output: formatLaari(BigInt(r.filed.output_laari)), input: formatLaari(BigInt(r.filed.input_laari)) }
        : null,
    });
  })
);

const send = (res, name, buf) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(buf);
};

router.get(
  "/:key/input.xlsx",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const r = await load(req);
    send(res, `input-tax-statement-${r.period.key}.xlsx`, xlsx([{ name: "Sheet1", rows: gst.inputRows(r) }]));
  })
);

router.get(
  "/:key/output.xlsx",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const r = await load(req);
    send(res, `output-tax-statement-${r.period.key}.xlsx`, xlsx(gst.outputSheets(r)));
  })
);

router.post(
  "/:key/filed",
  requireCan("close"),
  validate(z.object({ reference: z.string().trim().max(120).nullish() })),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(
        await asCompany(req, (client) =>
          gst.markFiled(client, { companyId: req.companyId, userId: req.user.id, key: req.params.key, reference: req.body.reference })
        )
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/** The two filing facts: the taxable activity number, and month or quarter. */
router.post(
  "/settings",
  requireCan("manage_settings"),
  validate(
    z.object({
      activityNo: z.string().trim().max(40).nullish(),
      frequency: z.enum(["month", "quarter"]),
    })
  ),
  asyncHandler(async (req, res) => {
    await asCompany(req, (client) =>
      client.query("UPDATE companies SET gst_number = $2, gst_period = $3 WHERE id = $1", [
        req.companyId,
        req.body.activityNo || null,
        req.body.frequency,
      ])
    );
    res.json({ ok: true });
  })
);

module.exports = router;
