const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const orders = require("../ledger/orders");
const push = require("../services/push");
const { formatLaari } = require("../ledger/money");

/**
 * Purchase and sales orders, their deliveries, and the bill or invoice made
 * from what was delivered. See ledger/orders.js.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const num = z.union([z.string().trim(), z.number()]).transform(String);
const parse = (schema, body) => {
  const p = schema.safeParse(body ?? {});
  if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
  return p.data;
};
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

/** What this person may approve: null for no limit, their limit, or -1 when they may not approve at all. */
async function approveUpTo(client, req) {
  if (!req.can("approve")) return -1n;
  const { rows } = await client.query("SELECT limit_laari FROM spending_limits WHERE company_id = $1 AND user_id = $2", [req.companyId, req.user.id]);
  return rows[0] ? BigInt(rows[0].limit_laari) : null;
}

/** An order is only for those who order (or receive, or keep the books) for its kind. */
const canSee = requireCan("read", "order", "receive");

router.get(
  "/",
  canSee,
  asyncHandler(async (req, res) => {
    const kind = ["purchase", "sale", "quote"].includes(req.query.kind) ? req.query.kind : null;
    res.json({ orders: await on(req, (client, ctx) => orders.list(client, { ...ctx, kind })) });
  })
);

/** The choices a new order needs, so ordering needs no other permission. */
router.get(
  "/options",
  canSee,
  asyncHandler(async (req, res) => {
    res.json(
      await on(req, async (client, { companyId }) => {
        const q = async (sql) => (await client.query(sql, [companyId])).rows;
        return {
          accounts: await q("SELECT id, code, name FROM accounts WHERE company_id = $1 AND type = 'expense' AND archived_at IS NULL ORDER BY code"),
          items: await q("SELECT id, name, unit, sale_price_laari, buy_price_laari, kind, counted, sells, buys FROM stock_items WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)"),
          projects: await q("SELECT id, name FROM projects WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)"),
          parties: await q("SELECT id, name, kind FROM counterparties WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)"),
        };
      })
    );
  })
);

const newBody = z.object({
  kind: z.enum(["purchase", "sale", "quote"]),
  validUntil: dateText.nullish(),
  counterpartyId: z.string().uuid().nullish(),
  partyName: z.string().trim().max(160).nullish(),
  projectId: z.string().uuid().nullish(),
  orderedOn: dateText.nullish(),
  expectedOn: dateText.nullish(),
  note: z.string().trim().max(500).nullish(),
  lines: z
    .array(z.object({ description: z.string().trim().max(300).default(""), itemId: z.string().uuid().nullish(), accountId: z.string().uuid().nullish(), quantity: num, unit: z.string().trim().max(20).nullish(), unitPrice: num }))
    .min(1)
    .max(100),
});

router.post(
  "/",
  refused(async (req, res) => {
    const b = parse(newBody, req.body);
    if (b.kind === "purchase" && !req.can("order") && !req.can("record")) throw ApiError.forbidden("Your role does not place orders.");
    if (b.kind !== "purchase" && !req.can("record")) throw ApiError.forbidden("Your role does not take sales orders or give quotes.");
    const r = await on(req, async (client, ctx) => {
      const made = await orders.create(client, { ...ctx, ...b, approveUpTo: await approveUpTo(client, req) });
      if (b.kind === "purchase" && !made.approved)
        await push.tell(client, {
          companyId: ctx.companyId, userIds: (await push.membersWith(client, ctx.companyId, "approve")).filter((u) => u !== ctx.userId),
          kind: "waiting", title: `${made.number} for MVR ${formatLaari(made.total)} waits for your approval`, body: "Nothing can be received against it until it is approved.", href: `/orders/${made.id}`, dedupeKey: `order:${made.id}`,
        });
      return made;
    });
    res.status(201).json({ id: r.id, number: r.number, total: formatLaari(r.total), approved: r.approved });
  })
);

router.get(
  "/:id",
  canSee,
  refused(async (req, res) => {
    res.json(await on(req, async (client, ctx) => ({ ...orders.show(await orders.load(client, { ...ctx, orderId: req.params.id })), deliveries: (await client.query("SELECT id, delivered_on::text AS on, reference FROM order_deliveries WHERE order_id = $1 AND company_id = $2 ORDER BY created_at", [req.params.id, ctx.companyId])).rows, canApproveUpTo: await approveUpTo(client, req).then((v) => (v === null ? null : formatLaari(v < 0n ? 0n : v))), mayApprove: req.can("approve") })));
  })
);

router.post(
  "/:id/approve",
  requireCan("approve"),
  refused(async (req, res) => {
    await on(req, async (client, ctx) => {
      await orders.approve(client, { ...ctx, orderId: req.params.id, approveUpTo: await approveUpTo(client, req) });
      const { rows } = await client.query("SELECT number, created_by FROM orders WHERE id = $1 AND company_id = $2", [req.params.id, ctx.companyId]);
      if (rows[0] && rows[0].created_by !== ctx.userId)
        await push.tell(client, { companyId: ctx.companyId, userIds: [rows[0].created_by], kind: "done", title: `${rows[0].number} was approved`, body: "It can go to the supplier, and be received against.", href: `/orders/${req.params.id}`, dedupeKey: `order-approved:${req.params.id}` });
    });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/deliveries",
  requireCan("receive", "record"),
  refused(async (req, res) => {
    const b = parse(z.object({ deliveredOn: dateText.nullish(), reference: z.string().trim().max(60).nullish(), note: z.string().trim().max(300).nullish(), lines: z.array(z.object({ orderLineId: z.string().uuid(), quantity: num })).min(1).max(100) }), req.body);
    const r = await on(req, (client, ctx) => orders.deliver(client, { ...ctx, orderId: req.params.id, ...b }));
    res.status(201).json(r);
  })
);

const billBody = z.object({
  billNo: z.string().trim().max(60).nullish(),
  issueDate: dateText.nullish(),
  gstTreatment: z.enum(["exclusive", "none_unregistered", "exempt", "zero_rated"]).default("exclusive"),
  lines: z.array(z.object({ orderLineId: z.string().uuid(), quantity: num, unitPrice: num.nullish() })).max(100).nullish(),
});

router.post(
  "/:id/bill",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(billBody, req.body);
    const r = await on(req, (client, ctx) => orders.billFromOrder(client, { ...ctx, orderId: req.params.id, ...b }));
    res.status(201).json({ billId: r.bill.id, gross: formatLaari(BigInt(r.bill.gross_laari)), differences: r.differences });
  })
);

router.post(
  "/:id/invoice",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(billBody.omit({ billNo: true }), req.body);
    const r = await on(req, (client, ctx) => orders.invoiceFromOrder(client, { ...ctx, orderId: req.params.id, ...b }));
    res.status(201).json({ invoiceId: r.invoice.id, invoiceNo: r.invoice.invoice_no, gross: formatLaari(BigInt(r.invoice.gross_laari)), differences: r.differences });
  })
);

for (const [how, accepted] of [["accept", true], ["decline", false]]) {
  router.post(
    `/:id/${how}`,
    requireCan("record"),
    refused(async (req, res) => {
      const made = await on(req, (client, ctx) => orders.answerQuote(client, { ...ctx, orderId: req.params.id, accepted, by: req.user.name, via: "office" }));
      res.json({ ok: true, orderId: made.id || null, number: made.number || null, invoiceId: made.invoiceId || null, invoiceNo: made.invoiceNo || null });
    })
  );
}

for (const how of ["cancel", "close"]) {
  router.post(
    `/:id/${how}`,
    requireCan("record", "order"),
    refused(async (req, res) => {
      await on(req, (client, ctx) => orders.finish(client, { ...ctx, orderId: req.params.id, how }));
      res.json({ ok: true });
    })
  );
}

module.exports = router;
