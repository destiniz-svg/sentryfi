const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const recurring = require("../ledger/recurring");
const { findOrCreate } = require("../ledger/counterparties");

/** Repeat billing: invoices raised on a schedule. See ledger/recurring.js. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(err.message);
    }
  });
const on = (req, fn) => asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id }));

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json({ schedules: await on(req, (client, ctx) => recurring.list(client, ctx)) });
  })
);

const body = z.object({
  customerName: z.string().trim().min(1, "Who is billed?").max(160),
  name: z.string().trim().max(120).nullish(),
  every: z.enum(["week", "month", "quarter", "year"]),
  startsOn: dateText,
  endsOn: dateText.nullish(),
  gstTreatment: z.enum(["exclusive", "none_unregistered", "exempt", "zero_rated"]).default("exclusive"),
  postAutomatically: z.boolean().default(false),
  projectId: z.string().uuid().nullish(),
  lines: z.array(z.object({ description: z.string().trim().max(300), quantity: z.coerce.number().default(1), unitPrice: z.union([z.string().trim(), z.number()]).transform(String) })).min(1).max(40),
});

router.post(
  "/",
  requireCan("record"),
  refused(async (req, res) => {
    const p = body.safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    const r = await on(req, async (client, ctx) => {
      const party = (await findOrCreate(client, { ...ctx, name: p.data.customerName, kind: "customer" })).party.id;
      const id = await recurring.create(client, { ...ctx, ...p.data, counterpartyId: party });
      // A schedule that starts today, or started earlier, bills now.
      const raised = await recurring.runDue(client, ctx);
      return { id, raised };
    });
    res.status(201).json(r);
  })
);

router.post(
  "/run",
  requireCan("record"),
  refused(async (req, res) => {
    res.json({ raised: await on(req, (client, ctx) => recurring.runDue(client, ctx)) });
  })
);

router.post(
  "/:id/pause",
  requireCan("record"),
  refused(async (req, res) => {
    await on(req, (client, ctx) => recurring.pause(client, { ...ctx, id: req.params.id, paused: req.body?.paused !== false }));
    res.json({ ok: true });
  })
);

/** Tells those who record that repeat billing raised invoices. */
async function announce(client, companyId, raised) {
  if (!raised.length) return;
  const push = require("../services/push");
  const numbers = raised.map((x) => x.invoiceNo).filter(Boolean);
  await push.tell(client, {
    companyId, userIds: await push.membersWith(client, companyId, "record"), kind: "done",
    title: `Repeat billing raised ${raised.length} ${raised.length === 1 ? "invoice" : "invoices"}`,
    body: `${numbers.slice(0, 5).join(", ")}${raised.some((x) => !x.posted) ? ". Drafts wait to be sent." : ", posted."}`,
    href: "/invoices", dedupeKey: `recurring:${raised.map((x) => x.invoiceId).join(",").slice(0, 200)}`,
  });
}

/**
 * The hourly job: every company with a schedule due. Run as whoever set the
 * schedule up. If the database hides schedules from this connection, the
 * fallback in Needs you still raises them when someone opens the books.
 */
function schedule() {
  const { pool } = require("../config/db");
  const tick = async () => {
    try {
      const { rows } = await pool.query(
        "SELECT DISTINCT ON (company_id) company_id, created_by FROM recurring_invoices WHERE paused_at IS NULL AND next_on <= current_date"
      );
      for (const r of rows) {
        await asCompany({ companyId: r.company_id, user: { id: r.created_by } }, async (client) =>
          announce(client, r.company_id, await recurring.runDue(client, { companyId: r.company_id, userId: r.created_by }))
        ).catch((err) => console.error(JSON.stringify({ at: "recurring", company: r.company_id, error: err.message })));
      }
    } catch (err) {
      console.error(JSON.stringify({ at: "recurring-schedule", error: err.message }));
    }
  };
  setTimeout(tick, 90_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}

module.exports = router;
module.exports.schedule = schedule;
module.exports.announce = announce;
