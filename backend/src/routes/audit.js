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

// ------------------------------------------------------------------ confirmations (ISA 505)

const confirmations = require("../ledger/auditConfirmations");
// Choosing, sending and reading confirmations is the auditor's alone: the company must not control them.
const auditorOnly = (req, res, next) => (isAuditor(req) ? next() : next(ApiError.forbidden("Confirmations are the auditor's to choose, send and read.")));

router.get(
  "/:id/confirmations",
  requireCan("read_trail"),
  refused(async (req, res) => res.json({ confirmations: await as(req, (c, ctx) => confirmations.list(c, { ...ctx, periodId: uuid(req.params.id), auditor: isAuditor(req) })), auditor: isAuditor(req) }))
);
router.get("/:id/confirmations/suggest", requireCan("read_trail"), auditorOnly, refused(async (req, res) => res.json({ suggestions: await as(req, (c, ctx) => confirmations.suggest(c, { ...ctx, periodId: uuid(req.params.id) })) })));
router.post(
  "/:id/confirmations",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => {
    const p = z.object({ items: z.array(z.object({ counterpartyId: z.string().uuid(), side: z.enum(["receivable", "payable"]), form: z.enum(["blank", "balance"]).optional() })).min(1).max(100) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Pick whom to confirm.");
    res.status(201).json(await as(req, (c, ctx) => confirmations.create(c, { ...ctx, periodId: uuid(req.params.id), items: p.data.items })));
  })
);
router.patch(
  "/confirmations/:cid",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => {
    const p = z.object({ email: z.string().max(200).nullish(), emailChecked: z.boolean().optional(), emailCheckNote: z.string().max(300).nullish(), form: z.enum(["blank", "balance"]).optional() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("That change cannot be made.");
    res.json(await as(req, (c, ctx) => confirmations.update(c, { ...ctx, id: uuid(req.params.cid), ...p.data })));
  })
);
/** The company authorises its auditor to ask, or refuses with its reason. Not the auditor. */
router.post(
  "/:id/confirmations/authorise",
  requireCan("approve"),
  refused(async (req, res) => {
    if (isAuditor(req)) throw ApiError.forbidden("The company authorises its auditor's requests, not the auditor.");
    const p = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), allow: z.boolean(), reason: z.string().max(500).nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Say which requests, and whether they are authorised.");
    res.json(await as(req, (c, ctx) => confirmations.authorise(c, { ...ctx, ...p.data })));
  })
);
router.post(
  "/confirmations/:cid/send",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => {
    const env = require("../config/env");
    const email = require("../services/email");
    // Not sent (no mail set up, or the mail service failing): the auditor gets the private link to send themselves.
    const mail = async (m) => {
      if (!env.resendApiKey) return false;
      try {
        await email.send(m);
        return true;
      } catch (err) {
        console.error(`[audit] confirmation email not sent: ${err.message}`);
        return false;
      }
    };
    res.json(await as(req, (c, ctx) => confirmations.send(c, { ...ctx, id: uuid(req.params.cid), publicUrl: env.publicUrl, mail })));
  })
);
router.post(
  "/confirmations/:cid/conclude",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => {
    const p = z.object({ outcome: z.enum(["agreed", "explained", "alternative"]), note: z.string().max(1000).nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Agreed, explained, or other procedures.");
    res.json(await as(req, (c, ctx) => confirmations.conclude(c, { ...ctx, id: uuid(req.params.cid), ...p.data })));
  })
);
router.get(
  "/confirmations/:cid/file",
  requireCan("read_trail"),
  auditorOnly,
  refused(async (req, res) => {
    const file = await as(req, (c, ctx) => confirmations.replyFile(c, { ...ctx, id: uuid(req.params.cid) }));
    if (!file) throw ApiError.notFound("No file came with that reply.");
    res.set("Content-Type", file.file_type);
    res.set("Content-Disposition", `inline; filename="${file.file_name}"`);
    res.set("Cache-Control", "private, no-store");
    res.send(file.file_bytes);
  })
);

// ------------------------------------------------------------------ sign-off and access

const signoff = require("../ledger/auditSignoff");

/** What is left before the auditor signs: each part, done, unfinished, or blocking. */
router.get("/:id/readiness", requireCan("read_trail"), refused(async (req, res) => res.json(await asCompany(req, (c) => signoff.readiness(c, req, { periodId: uuid(req.params.id) })))));

router.post(
  "/:id/signoff",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => {
    const p = z.object({ opinion: z.enum(["unmodified", "qualified", "adverse", "disclaimer"]), note: z.string().max(2000).nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Say the opinion.");
    res.json(await asCompany(req, (c) => signoff.signOff(c, req, { periodId: uuid(req.params.id), ...p.data })));
  })
);

/** Who holds the Auditor role here, and until when. The company sets the dates in People, or here. */
router.get(
  "/access/auditors",
  requireCan("read_trail"),
  refused(async (req, res) => {
    const rows = await asCompany(req, (c) =>
      c
        .query(
          `SELECT u.id, u.name, u.email, m.access_until, (m.access_until IS NOT NULL AND m.access_until <= now()) AS ended
             FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = $1 AND m.role = 'auditor' ORDER BY u.name`,
          [req.companyId]
        )
        .then((r) => r.rows)
    );
    res.json({ auditors: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, until: r.access_until, ended: r.ended })), manage: req.can("manage_people") });
  })
);

// ------------------------------------------------------------------ the year-end count (ISA 501)

const count = require("../ledger/auditCount");

/** The company's counts around the period end, and which the auditor attended. */
router.get("/:id/counts", requireCan("read_trail"), refused(async (req, res) => res.json({ counts: await as(req, (c, ctx) => count.near(c, { ...ctx, periodId: uuid(req.params.id) })), attended: await as(req, (c, ctx) => count.list(c, { ...ctx, periodId: uuid(req.params.id) })), auditor: isAuditor(req) })));
router.post(
  "/:id/observations",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => res.status(201).json(await as(req, (c, ctx) => count.observe(c, { ...ctx, periodId: uuid(req.params.id), countId: uuid(String(req.body?.countId || "")) }))))
);
router.get("/observations/:oid", requireCan("read_trail"), auditorOnly, refused(async (req, res) => res.json(await as(req, (c, ctx) => count.view(c, { ...ctx, observationId: uuid(req.params.oid) })))));
router.post(
  "/observations/:oid/tests",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => {
    const p = z.object({ itemId: z.string().uuid("Pick the item."), direction: z.enum(["sheet_to_floor", "floor_to_sheet"]), qty: z.union([z.string(), z.number()]).transform(String), note: z.string().max(300).nullish() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    res.json(await as(req, (c, ctx) => count.record(c, { ...ctx, observationId: uuid(req.params.oid), ...p.data })));
  })
);
router.post(
  "/observations/:oid/conclude",
  requireCan("audit"),
  auditorOnly,
  refused(async (req, res) => res.json(await as(req, (c, ctx) => count.conclude(c, { ...ctx, observationId: uuid(req.params.oid), instructions: req.body?.instructions, conclusion: req.body?.conclusion }))))
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
