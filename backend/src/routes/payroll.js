const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const payroll = require("../ledger/payroll");
const { payrollPack } = require("../ledger/payrollRules");

/**
 * Payroll. Everything but a person's own payslips needs run_payroll
 * (administrators and accountants): salaries are private. See ledger/payroll.js.
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

// Anything the ledger refuses is a decision for a person, not a server fault.
const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.code === "23505") throw ApiError.conflict("That is already there.");
      throw ApiError.badRequest(err.message);
    }
  });
const ctx = (req) => ({ companyId: req.companyId, userId: req.user.id });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const uuid = z.string().uuid();
const parse = (schema, body) => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw ApiError.badRequest(r.error.issues[0].message);
  return r.data;
};

// A person's own payslips: anyone in the company whose sign-in is linked to them.
router.get(
  "/mine",
  refused(async (req, res) => {
    res.json({ slips: await asCompany(req, (client) => payroll.mine(client, ctx(req))) });
  })
);
router.get(
  "/mine/:runId",
  refused(async (req, res) => {
    const slip = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT e.id FROM employees e JOIN pay_run_lines l ON l.employee_id = e.id JOIN pay_runs r ON r.id = l.run_id
          WHERE e.company_id = $1 AND e.user_id = $2 AND r.id = $3 AND r.published_at IS NOT NULL`,
        [req.companyId, req.user.id, req.params.runId]
      );
      if (!rows.length) throw ApiError.notFound("That payslip is not yours, or is not out yet.");
      return payroll.payslip(client, { companyId: req.companyId, runId: req.params.runId, employeeId: rows[0].id });
    });
    res.json(slip);
  })
);

router.use(requireCan("run_payroll"));

router.get(
  "/",
  refused(async (req, res) => {
    res.json(
      await asCompany(req, async (client) => {
        const c = await payroll.company(client, ctx(req));
        const pack = payrollPack(c.pack);
        const { rows: projects } = await client.query("SELECT id, name FROM projects WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)", [req.companyId]);
        const { rows: users } = await client.query(
          "SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = $1 ORDER BY lower(u.name)",
          [req.companyId]
        );
        return {
          settings: c,
          rules: {
            pack: pack.code,
            tax: pack.tax && { name: pack.tax.name, form: pack.tax.form, authority: pack.tax.authority, dueDay: pack.tax.dueDay },
            pension: pack.pension && { name: pack.pension.name, authority: pack.pension.authority, dueDay: pack.pension.dueDay, national: pack.national, schemes: Object.entries(pack.pension.schemes).map(([key, s]) => ({ key, label: s.label })), base: pack.pension.base },
            overtime: Object.entries(pack.overtime).map(([key, o]) => ({ key, label: o.label, percent: o.bp / 100 })),
            serviceCharge: Boolean(pack.serviceCharge),
            gratuity: Boolean(pack.gratuity),
            bankFile: pack.bankFile,
            finalPayDays: pack.finalPayDays,
          },
          people: await payroll.people(client, ctx(req)),
          runs: await payroll.runs(client, ctx(req)),
          payFrom: await payroll.payFrom(client, ctx(req)),
          projects,
          users,
        };
      })
    );
  })
);

router.put(
  "/settings",
  refused(async (req, res) => {
    const b = parse(z.object({ size: z.enum(["small", "medium", "large"]).optional(), payDay: z.number().int().min(1).max(31).nullish(), wpsEmployerId: z.string().max(40).nullish(), wpsRoutingCode: z.string().max(20).nullish() }), req.body);
    res.json(await asCompany(req, (client) => payroll.saveSettings(client, { ...ctx(req), ...b })));
  })
);

router.post(
  "/people",
  refused(async (req, res) => {
    res.status(201).json(await asCompany(req, (client) => payroll.savePerson(client, { ...ctx(req), p: req.body || {} })));
  })
);
router.put(
  "/people/:id",
  refused(async (req, res) => {
    parse(z.object({ id: uuid }), req.params);
    res.json(await asCompany(req, (client) => payroll.savePerson(client, { ...ctx(req), id: req.params.id, p: req.body || {} })));
  })
);
router.post(
  "/people/:id/advance",
  refused(async (req, res) => {
    const b = parse(z.object({ amount: z.union([z.string(), z.number()]), instalment: z.union([z.string(), z.number()]).nullish(), givenOn: date, fromAccountId: uuid, note: z.string().max(200).nullish() }), req.body);
    res.status(201).json(await asCompany(req, (client) => payroll.giveAdvance(client, { ...ctx(req), employeeId: req.params.id, ...b })));
  })
);

router.post(
  "/runs",
  refused(async (req, res) => {
    const b = parse(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, "A pay period is a month, YYYY-MM."), kind: z.enum(["regular", "adjustment"]).default("regular"), payDate: date.nullish(), note: z.string().max(300).nullish() }), req.body);
    const run = await asCompany(req, (client) => payroll.createRun(client, { ...ctx(req), ...b }));
    res.status(201).json({ id: run.id });
  })
);
router.get(
  "/runs/:id",
  refused(async (req, res) => {
    parse(z.object({ id: uuid }), req.params);
    res.json(await asCompany(req, (client) => payroll.showRun(client, { companyId: req.companyId, runId: req.params.id })));
  })
);
router.delete(
  "/runs/:id",
  refused(async (req, res) => {
    await asCompany(req, (client) => payroll.deleteRun(client, { companyId: req.companyId, runId: req.params.id }));
    res.json({ ok: true });
  })
);
router.put(
  "/runs/:id/lines/:employeeId",
  refused(async (req, res) => {
    const inputs = await asCompany(req, (client) => payroll.setInputs(client, { companyId: req.companyId, runId: req.params.id, employeeId: req.params.employeeId, inputs: req.body || {} }));
    res.json({ inputs });
  })
);
router.post(
  "/runs/:id/lines",
  refused(async (req, res) => {
    const b = parse(z.object({ employeeId: uuid }), req.body);
    await asCompany(req, (client) => payroll.addToRun(client, { companyId: req.companyId, runId: req.params.id, ...b }));
    res.status(201).json({ ok: true });
  })
);
router.delete(
  "/runs/:id/lines/:employeeId",
  refused(async (req, res) => {
    await asCompany(req, (client) => payroll.removeFromRun(client, { companyId: req.companyId, runId: req.params.id, employeeId: req.params.employeeId }));
    res.json({ ok: true });
  })
);
router.post(
  "/runs/:id/service-charge",
  refused(async (req, res) => {
    const b = parse(z.object({ collected: z.union([z.string(), z.number()]), adminFeePercent: z.coerce.number().min(0).max(100).default(0) }), req.body);
    res.json(await asCompany(req, (client) => payroll.shareServiceCharge(client, { companyId: req.companyId, runId: req.params.id, collected: b.collected, adminFeeBp: Math.round(b.adminFeePercent * 100) })));
  })
);
router.post(
  "/runs/:id/approve",
  refused(async (req, res) => {
    res.json(await asCompany(req, (client) => payroll.approve(client, { ...ctx(req), runId: req.params.id })));
  })
);
router.post(
  "/runs/:id/reopen",
  refused(async (req, res) => {
    const b = parse(z.object({ reason: z.string().trim().min(3, "Say why it is being reopened.") }), req.body);
    await asCompany(req, (client) => payroll.reopen(client, { ...ctx(req), runId: req.params.id, reason: b.reason }));
    res.json({ ok: true });
  })
);
router.post(
  "/runs/:id/publish",
  refused(async (req, res) => {
    await asCompany(req, (client) => payroll.publish(client, { companyId: req.companyId, runId: req.params.id }));
    res.json({ ok: true });
  })
);
router.post(
  "/runs/:id/pay",
  refused(async (req, res) => {
    const b = parse(z.object({ kind: z.enum(["wages", "tax", "pension"]), fromAccountId: uuid, paidOn: date, reference: z.string().max(80).nullish() }), req.body);
    res.status(201).json(await asCompany(req, (client) => payroll.pay(client, { ...ctx(req), runId: req.params.id, ...b })));
  })
);
router.get(
  "/runs/:id/files/:which",
  refused(async (req, res) => {
    const f = await asCompany(req, (client) => payroll.file(client, { companyId: req.companyId, runId: req.params.id, which: req.params.which }));
    res.setHeader("Content-Type", `${f.type}; charset=utf-8`);
    res.setHeader("Content-Disposition", `attachment; filename="${f.name}"`);
    res.send(f.body);
  })
);
router.get(
  "/runs/:id/slips/:employeeId",
  refused(async (req, res) => {
    res.json(await asCompany(req, (client) => payroll.payslip(client, { companyId: req.companyId, runId: req.params.id, employeeId: req.params.employeeId })));
  })
);

module.exports = router;
