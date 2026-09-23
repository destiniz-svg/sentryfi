const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const projects = require("../ledger/projects");
const { formatLaari } = require("../ledger/money");

/**
 * Projects: the contract, the budget, what is committed and spent, progress
 * claims and their certificates, and retention. See ledger/projects.js.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const money = z.union([z.string().trim(), z.number()]).transform(String);
const parse = (schema, body) => {
  const p = schema.safeParse(body ?? {});
  if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
  return p.data;
};
// Anything the ledger refuses is a decision for a person, not a server fault.
const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.code === "23505") throw ApiError.conflict("There is already one like that.");
      throw ApiError.badRequest(err.message);
    }
  });
const on = (req, fn) => asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id }));

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json({ projects: await on(req, (client, ctx) => projects.list(client, ctx)) });
  })
);

router.post(
  "/",
  requireCan("manage_settings", "record"),
  refused(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(1, "Give it a name.").max(120) }), req.body);
    const id = await on(req, async (client, ctx) => {
      const { rows: same } = await client.query("SELECT 1 FROM projects WHERE company_id = $1 AND lower(name) = lower($2)", [ctx.companyId, name]);
      if (same.length) throw new Error(`There is already a project called "${name}".`);
      return (await client.query("INSERT INTO projects (company_id, name) VALUES ($1,$2) RETURNING id", [ctx.companyId, name])).rows[0].id;
    });
    res.status(201).json({ id });
  })
);

router.get(
  "/:id",
  requireCan("read"),
  refused(async (req, res) => {
    const out = await on(req, async (client, ctx) => {
      const summary = await projects.summary(client, { ...ctx, projectId: req.params.id });
      // The choices a person needs on the page.
      const { rows: accounts } = await client.query("SELECT id, code, name FROM accounts WHERE company_id = $1 AND type = 'expense' AND archived_at IS NULL ORDER BY code", [ctx.companyId]);
      const { rows: parties } = await client.query("SELECT id, name, kind FROM counterparties WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)", [ctx.companyId]);
      const { rows: bills } = await client.query(
        `SELECT b.id, b.bill_no, b.issue_date, b.gross_laari, c.name AS supplier FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1 AND b.commitment_id IS NULL AND b.voided_at IS NULL AND b.created_at > now() - interval '240 days'
          ORDER BY b.created_at DESC LIMIT 60`,
        [ctx.companyId]
      );
      return {
        ...summary,
        accounts,
        customers: parties.filter((p) => (p.kind || []).includes("customer")).map(({ id, name }) => ({ id, name })),
        suppliers: parties.filter((p) => (p.kind || []).includes("supplier")).map(({ id, name }) => ({ id, name })),
        bills: bills.map((b) => ({ id: b.id, billNo: b.bill_no, supplier: b.supplier, issueDate: b.issue_date })),
      };
    });
    res.json(out);
  })
);

router.put(
  "/:id/contract",
  requireCan("manage_settings", "record"),
  refused(async (req, res) => {
    const b = parse(
      z.object({ counterpartyId: z.string().uuid().nullish(), contract: money.nullish(), retentionPct: z.coerce.number().default(0), retentionCapPct: z.coerce.number().nullish(), startsOn: dateText.nullish(), endsOn: dateText.nullish() }),
      req.body
    );
    await on(req, (client, ctx) => projects.configure(client, { ...ctx, projectId: req.params.id, ...b }));
    res.json({ ok: true });
  })
);

router.put(
  "/:id/budget",
  requireCan("manage_settings", "record"),
  refused(async (req, res) => {
    const { lines } = parse(z.object({ lines: z.array(z.object({ accountId: z.string().uuid(), amount: money })).max(40) }), req.body);
    await on(req, (client, ctx) => projects.setBudget(client, { ...ctx, projectId: req.params.id, lines }));
    res.json({ ok: true });
  })
);

router.post(
  "/:id/commitments",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ counterpartyId: z.string().uuid().nullish(), description: z.string().trim().max(200), accountId: z.string().uuid(), amount: money }), req.body);
    const id = await on(req, (client, ctx) => projects.commit(client, { ...ctx, projectId: req.params.id, ...b }));
    res.status(201).json({ id });
  })
);

router.put(
  "/:id/commitments/:cid/bills/:billId",
  requireCan("record"),
  refused(async (req, res) => {
    await on(req, async (client, ctx) => {
      const { rows } = await client.query("SELECT 1 FROM project_commitments WHERE id = $1 AND project_id = $2 AND company_id = $3", [req.params.cid, req.params.id, ctx.companyId]);
      if (!rows.length) throw new Error("That commitment is not on this project.");
      await projects.billAgainst(client, { ...ctx, commitmentId: req.params.cid, billId: req.params.billId });
    });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/claims",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(
      z.object({
        periodTo: dateText,
        claimedToDate: money.nullish(),
        measured: z.array(z.object({ boqId: z.string().uuid(), done: money })).max(500).nullish(),
      }),
      req.body
    );
    if (!b.measured && !b.claimedToDate) throw ApiError.badRequest("How much work is done to date?");
    const c = await on(req, (client, ctx) => projects.claim(client, { ...ctx, projectId: req.params.id, ...b }));
    res.status(201).json({ id: c.id, number: c.number, claimed: formatLaari(c.value) });
  })
);

router.post(
  "/:id/claims/:claimId/certify",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ certifiedToDate: money, on: dateText }), req.body);
    const r = await on(req, async (client, ctx) => {
      const { rows } = await client.query("SELECT 1 FROM project_claims WHERE id = $1 AND project_id = $2 AND company_id = $3", [req.params.claimId, req.params.id, ctx.companyId]);
      if (!rows.length) throw new Error("That claim is not on this project.");
      return projects.certify(client, { ...ctx, claimId: req.params.claimId, ...b });
    });
    res.status(201).json({ certificate: formatLaari(r.certificate), retention: formatLaari(r.retention), invoiced: formatLaari(r.due) });
  })
);

router.post(
  "/:id/retention",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ amount: money, on: dateText }), req.body);
    await on(req, (client, ctx) => projects.releaseRetention(client, { ...ctx, projectId: req.params.id, ...b }));
    res.status(201).json({ ok: true });
  })
);

/** A variation to the contract: proposed, then approved or rejected. */
router.post(
  "/:id/variations",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ description: z.string().trim().min(1, "Say what the variation is.").max(300), amount: money }), req.body);
    const v = await on(req, (client, ctx) => projects.vary(client, { ...ctx, projectId: req.params.id, ...b }));
    res.status(201).json(v);
  })
);

router.post(
  "/:id/variations/:vid/decide",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ approved: z.boolean(), on: dateText.nullish() }), req.body);
    await on(req, async (client, ctx) => {
      const { rows } = await client.query("SELECT 1 FROM project_variations WHERE id = $1 AND project_id = $2 AND company_id = $3", [req.params.vid, req.params.id, ctx.companyId]);
      if (!rows.length) throw new Error("That variation is not on this project.");
      await projects.decideVariation(client, { ...ctx, variationId: req.params.vid, ...b });
    });
    res.json({ ok: true });
  })
);

/** The bill of quantities, replaced whole. */
router.put(
  "/:id/boq",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(
      z.object({
        items: z.array(z.object({ ref: z.string().trim().max(30).nullish(), description: z.string().trim().max(300), unit: z.string().trim().max(20).nullish(), quantity: money, rate: money })).max(500),
      }),
      req.body
    );
    const r = await on(req, (client, ctx) => projects.setBoq(client, { ...ctx, projectId: req.params.id, items: b.items }));
    res.json({ total: formatLaari(r.total) });
  })
);

router.post(
  "/:id/hours",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(
      z.object({ workedOn: dateText, who: z.string().trim().max(120), hours: money, rate: money.nullish(), note: z.string().trim().max(300).nullish() }),
      req.body
    );
    const h = await on(req, (client, ctx) => projects.logHours(client, { ...ctx, projectId: req.params.id, ...b }));
    res.status(201).json(h);
  })
);

router.delete(
  "/:id/hours/:hid",
  requireCan("record"),
  refused(async (req, res) => {
    const gone = await on(req, async (client, ctx) =>
      (await client.query("DELETE FROM project_hours WHERE id = $1 AND project_id = $2 AND company_id = $3", [req.params.hid, req.params.id, ctx.companyId])).rowCount
    );
    if (!gone) throw ApiError.notFound("Those hours are not on this project.");
    res.json({ ok: true });
  })
);

router.get(
  "/:id/entries",
  requireCan("read"),
  refused(async (req, res) => {
    const b = parse(z.object({ figure: z.enum(["spent", "revenue", "retention"]), accountId: z.string().uuid().optional() }), req.query);
    res.json({ entries: await on(req, (client, ctx) => projects.entries(client, { ...ctx, projectId: req.params.id, ...b })) });
  })
);

module.exports = router;
