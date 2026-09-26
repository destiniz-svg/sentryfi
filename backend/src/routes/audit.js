const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const audit = require("../ledger/audit");

/**
 * The auditor's workspace (/api/audit): periods with their seal, and samples.
 * Read by anyone who may read the trail; drawn and ticked by those who audit
 * (the auditor, and the owner or accountant setting it up for them).
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

const as = (req, fn) => asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id }));
// The workspace's refusals are plain sentences for the auditor, not server errors.
const refused = (fn) =>
  asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.code) throw err;
      throw ApiError.badRequest(err.message);
    }
  });
const uuid = (v) => {
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw ApiError.notFound("Not in these books.");
  return v;
};

/** Accounts an adjustment can name: read-only, for the auditor's line editor. */
router.get(
  "/accounts",
  requireCan("read_trail"),
  refused(async (req, res) => {
    const rows = await asCompany(req, (c) => c.query("SELECT id, code, name, type::text AS type FROM accounts WHERE company_id = $1 AND archived_at IS NULL ORDER BY code", [req.companyId]).then((r) => r.rows));
    res.json({ accounts: rows });
  })
);


router.get("/", requireCan("read_trail"), refused(async (req, res) => res.json({ periods: await as(req, (c, ctx) => audit.periods(c, ctx)) })));

router.post(
  "/",
  requireCan("audit"),
  refused(async (req, res) => {
    const p = z.object({ name: z.string().trim().max(120).nullish(), from: z.string(), to: z.string() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Say the first and last day of the period.");
    res.status(201).json(await as(req, (c, ctx) => audit.createPeriod(c, { ...ctx, ...p.data })));
  })
);

router.get("/:id", requireCan("read_trail"), refused(async (req, res) => res.json(await as(req, (c, ctx) => audit.period(c, { ...ctx, periodId: uuid(req.params.id) })))));

router.post("/:id/seal", requireCan("audit"), refused(async (req, res) => res.json(await as(req, (c, ctx) => audit.checkSeal(c, { ...ctx, periodId: uuid(req.params.id) })))));

router.post(
  "/:id/samples",
  requireCan("audit"),
  refused(async (req, res) => {
    const p = z
      .object({
        kind: z.enum(audit.KINDS),
        how: z.enum(["random", "over", "key", "mus", "risk"]),
        size: z.coerce.number().int().nullish(),
        over: z.union([z.string(), z.number()]).transform(String).nullish(),
        tests: z.array(z.string().max(20)).max(12).optional(),
      })
      .safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Say what to sample, and how.");
    res.status(201).json(await as(req, (c, ctx) => audit.draw(c, { ...ctx, periodId: uuid(req.params.id), ...p.data })));
  })
);

/** The period's journal entries, screened for the signs of management override (ISA 240). */
router.get(
  "/:id/risk",
  requireCan("read_trail"),
  refused(async (req, res) =>
    res.json(
      await as(req, async (c, ctx) => {
        const p = await audit.period(c, { ...ctx, periodId: uuid(req.params.id) });
        return require("../ledger/auditRisk").screen(c, { companyId: ctx.companyId, from: p.from, to: p.to });
      })
    )
  )
);

/**
 * The audit pack: one zip for the period, every file fingerprinted, the pack
 * itself recorded by its SHA-256. Making one checks the seal again, so it is
 * for those who audit; the packs made are listed to anyone who reads the trail.
 */
router.get(
  "/:id/pack",
  requireCan("audit"),
  refused(async (req, res) => {
    const pack = await as(req, (c, ctx) => require("../ledger/auditPack").build(c, { ...ctx, periodId: uuid(req.params.id) }));
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="${pack.name}"`);
    res.set("X-Pack-SHA256", pack.sha);
    res.set("Cache-Control", "no-store");
    res.send(pack.body);
  })
);
router.get("/:id/packs", requireCan("read_trail"), refused(async (req, res) => res.json({ packs: await as(req, (c, ctx) => require("../ledger/auditPack").packs(c, { ...ctx, periodId: uuid(req.params.id) })) })));

// ------------------------------------------------------------------ questions

const questions = require("../ledger/auditQuestions");
const { rolesCan } = require("../middleware/company");

/** The period's questions to the company, with their state. */
router.get("/:id/questions", requireCan("read_trail"), refused(async (req, res) => res.json(await asCompany(req, (c) => questions.list(c, req, { periodId: uuid(req.params.id) })))));

/** Who in the company can be asked: those who keep the books (read them and record or approve), not other auditors. */
router.get(
  "/:id/answerers",
  requireCan("read_trail"),
  refused(async (req, res) => {
    const people = await asCompany(req, (c) => require("../ledger/comments").members(c, req.companyId));
    res.json({ people: people.filter((m) => m.id !== req.user.id && rolesCan(m.roles, "read") && (rolesCan(m.roles, "record") || rolesCan(m.roles, "approve"))).map((m) => ({ id: m.id, name: m.name })) });
  })
);

router.post(
  "/:id/questions",
  requireCan("audit"),
  refused(async (req, res) => {
    const p = z
      .object({
        kind: z.string().max(20),
        recordId: z.string().uuid().nullish(),
        body: z.string().trim().min(3, "Write the question.").max(4000),
        askOf: z.string().uuid({ message: "Say who in the company should answer." }),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      })
      .safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    res.status(201).json(await asCompany(req, (c) => questions.ask(c, req, { periodId: uuid(req.params.id), ...p.data })));
  })
);

/** A journal entry, for a question's conversation page: its lines, who posted it and when. Anyone who reads the books. */
router.get("/entries/:eid", requireCan("read"), refused(async (req, res) => res.json({ entry: await as(req, (c, ctx) => audit.entryOf(c, ctx.companyId, uuid(req.params.eid))) })));

// ------------------------------------------------------------------ materiality and adjustments

const adjustments = require("../ledger/auditAdjustments");
const money = z.union([z.string().trim(), z.number()]).transform(String);

router.put(
  "/:id/materiality",
  requireCan("audit"),
  refused(async (req, res) => {
    if (!isAuditor(req)) throw ApiError.forbidden("Materiality is the auditor's own judgement: only the auditor sets it.");
    const p = z.object({ materiality: money, performance: money.nullish(), trivial: money.nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Say overall materiality.");
    res.json(await as(req, (c, ctx) => adjustments.setMateriality(c, { ...ctx, periodId: uuid(req.params.id), ...p.data })));
  })
);

// Materiality is the auditor's own: only someone who holds the Auditor role sets or sees it.
const isAuditor = (req) => (req.roles || []).includes("auditor");

router.get(
  "/:id/adjustments",
  requireCan("read_trail"),
  refused(async (req, res) => res.json(await as(req, (c, ctx) => adjustments.list(c, { ...ctx, periodId: uuid(req.params.id), auditor: isAuditor(req) }))))
);

router.post(
  "/:id/adjustments",
  requireCan("audit"),
  refused(async (req, res) => {
    const p = z
      .object({
        class: z.enum(["factual", "judgemental", "projected"]),
        reason: z.string().trim().max(1000),
        lines: z.array(z.object({ accountId: z.string().uuid("Each line needs an account."), debit: money.nullish(), credit: money.nullish(), memo: z.string().max(200).nullish() })).min(2).max(40),
      })
      .safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    res.status(201).json(await as(req, (c, ctx) => adjustments.propose(c, { ...ctx, periodId: uuid(req.params.id), klass: p.data.class, reason: p.data.reason, lines: p.data.lines })));
  })
);

/** The company decides: accept (posts it), pass (left unbooked, immaterial) or reject. Only those who may adjust the books. */
router.post(
  "/adjustments/:aid/decide",
  requireCan("adjust"),
  refused(async (req, res) => {
    const p = z.object({ how: z.enum(["accept", "pass", "reject"]), note: z.string().max(1000).nullish(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Accept it, pass it, or reject it.");
    res.json(await as(req, (c, ctx) => adjustments.decide(c, { ...ctx, id: uuid(req.params.aid), ...p.data })));
  })
);

router.post(
  "/adjustments/:aid/withdraw",
  requireCan("audit"),
  refused(async (req, res) => res.json(await as(req, (c, ctx) => adjustments.withdraw(c, { ...ctx, id: uuid(req.params.aid), note: req.body?.note }))))
);

/** Re-draws a sample from its seed and rule, and says whether it is the same. */
router.post("/samples/:sid/prove", requireCan("read_trail"), refused(async (req, res) => res.json(await as(req, (c, ctx) => audit.prove(c, { ...ctx, sampleId: uuid(req.params.sid) })))));

router.get("/samples/:sid", requireCan("read_trail"), refused(async (req, res) => res.json(await as(req, (c, ctx) => audit.sample(c, { ...ctx, sampleId: uuid(req.params.sid) })))));

router.get(
  "/samples/:sid/items/:iid",
  requireCan("read_trail"),
  refused(async (req, res) => res.json(await as(req, (c, ctx) => audit.evidence(c, { ...ctx, sampleId: uuid(req.params.sid), itemId: uuid(req.params.iid) }))))
);

router.post(
  "/samples/:sid/items/:iid/seen",
  requireCan("audit"),
  refused(async (req, res) => {
    const p = z.object({ seen: z.boolean().optional(), note: z.string().max(500).nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("A note is at most 500 characters.");
    res.json(await as(req, (c, ctx) => audit.see(c, { ...ctx, sampleId: uuid(req.params.sid), itemId: uuid(req.params.iid), ...p.data })));
  })
);

module.exports = router;
