const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const claims = require("../ledger/claims");
const payments = require("../ledger/payments");
const orders = require("../ledger/orders");
const { formatLaari, toLaari } = require("../ledger/money");

/**
 * Expense claims, payment runs, and the list of what waits for an approver.
 * See ledger/claims.js and ledger/payments.js.
 */

const router = express.Router();
// Mounted at /api: its checks cover only its own paths, never another router's.
router.use(["/claims", "/payments", "/approvals"], requireAuth, requireCompany);

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const money = z.union([z.string().trim(), z.number()]).transform(String);
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
async function approveUpTo(client, req) {
  if (!req.can("approve")) return -1n;
  const { rows } = await client.query("SELECT limit_laari FROM spending_limits WHERE company_id = $1 AND user_id = $2", [req.companyId, req.user.id]);
  return rows[0] ? BigInt(rows[0].limit_laari) : null;
}
// Anyone who works for the company may claim back what they spent for it.
const mayClaim = requireCan("capture", "record", "spend_cash", "order", "read");

// ------------------------------------------------------------------ claims

router.get(
  "/claims",
  mayClaim,
  asyncHandler(async (req, res) => {
    const everyone = req.can("approve") || req.can("record");
    res.json({ claims: await on(req, (client, ctx) => claims.list(client, { ...ctx, everyone })) });
  })
);

router.get(
  "/claims/options",
  mayClaim,
  asyncHandler(async (req, res) => {
    res.json(
      await on(req, async (client, { companyId }) => ({
        accounts: (await client.query("SELECT id, code, name FROM accounts WHERE company_id = $1 AND type = 'expense' AND archived_at IS NULL ORDER BY code", [companyId])).rows,
        projects: (await client.query("SELECT id, name FROM projects WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)", [companyId])).rows,
      }))
    );
  })
);

router.post(
  "/claims",
  mayClaim,
  refused(async (req, res) => {
    const b = parse(
      z.object({
        note: z.string().trim().max(300).nullish(),
        lines: z
          .array(z.object({ spentOn: dateText, description: z.string().trim().max(200), accountId: z.string().uuid(), projectId: z.string().uuid().nullish(), amount: money }))
          .min(1)
          .max(50),
      }),
      req.body
    );
    const r = await on(req, (client, ctx) => claims.create(client, { ...ctx, ...b }));
    res.status(201).json(r);
  })
);

router.post(
  "/claims/:id/approve",
  requireCan("approve"),
  refused(async (req, res) => {
    const r = await on(req, async (client, ctx) => claims.approve(client, { ...ctx, claimId: req.params.id, approveUpTo: await approveUpTo(client, req) }));
    res.json({ entryNo: String(r.entry.entryNo), total: formatLaari(r.total) });
  })
);

router.post(
  "/claims/:id/reject",
  requireCan("approve"),
  refused(async (req, res) => {
    const { why } = parse(z.object({ why: z.string().trim().max(300) }), req.body);
    await on(req, (client, ctx) => claims.reject(client, { ...ctx, claimId: req.params.id, why }));
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ payment runs

router.get(
  "/payments",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    res.json(
      await on(req, async (client, ctx) => ({
        unpaid: await payments.unpaid(client, ctx),
        runs: await payments.runs(client, ctx),
        from: (
          await client.query(
            "SELECT id, code, name FROM accounts WHERE company_id = $1 AND type = 'asset' AND (code LIKE '11%' OR code LIKE '12%') AND archived_at IS NULL ORDER BY code",
            [ctx.companyId]
          )
        ).rows,
      }))
    );
  })
);

router.post(
  "/payments",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(
      z.object({
        fromAccountId: z.string().uuid(),
        paidOn: dateText,
        reference: z.string().trim().max(60).nullish(),
        items: z.array(z.object({ billId: z.string().uuid().nullish(), claimId: z.string().uuid().nullish(), amount: money })).min(1).max(200),
      }),
      req.body
    );
    const r = await on(req, (client, ctx) => payments.pay(client, { ...ctx, ...b }));
    res.status(201).json({ runId: r.runId, entryNo: String(r.entry.entryNo), total: formatLaari(r.total), from: r.from, transfers: r.transfers });
  })
);

// ------------------------------------------------------------------ approvals

/** Everything waiting for this person's approval: orders, claims, and bills over someone's limit. */
router.get(
  "/approvals",
  requireCan("approve"),
  asyncHandler(async (req, res) => {
    const out = await on(req, async (client, { companyId, userId }) => {
      const upTo = await approveUpTo(client, req);
      const within = (laari) => upTo === null || BigInt(laari) <= upTo;
      const items = [];

      const { rows: po } = await client.query(
        "SELECT id FROM orders WHERE company_id = $1 AND kind = 'purchase' AND needs_approval AND approved_at IS NULL AND cancelled_at IS NULL ORDER BY created_at",
        [companyId]
      );
      for (const r of po) {
        const loaded = await orders.load(client, { companyId, orderId: r.id });
        const s = orders.show(loaded);
        items.push({ kind: "order", id: s.id, title: `${s.number} · ${s.party}`, by: s.orderer, amount: s.total, mine: false, within: within(loaded.total), href: `/orders/${s.id}` });
      }

      for (const c of await claims.list(client, { companyId, userId, everyone: true })) {
        if (c.status !== "submitted") continue;
        items.push({ kind: "claim", id: c.id, title: `${c.number} · ${c.claimant}`, by: c.claimant, amount: c.total, mine: c.claimantId === userId, within: within(toLaari(c.total)), lines: c.lines, href: "/claims" });
      }

      const { rows: bills } = await client.query(
        `SELECT b.id, b.bill_no, b.gross_laari, c.name AS supplier, u.name AS recorder FROM bills b
           JOIN spending_limits l ON l.company_id = b.company_id AND l.user_id = b.received_by
           LEFT JOIN counterparties c ON c.id = b.counterparty_id LEFT JOIN users u ON u.id = b.received_by
           LEFT JOIN orders o ON o.id = b.order_id
          WHERE b.company_id = $1 AND b.status IN ('draft','awaiting_review') AND b.voided_at IS NULL
            AND b.gross_laari > l.limit_laari AND (o.id IS NULL OR o.approved_at IS NULL)`,
        [companyId]
      );
      for (const b of bills) {
        items.push({
          kind: "bill", id: b.id, title: `${b.supplier || "A supplier"}${b.bill_no ? ` · ${b.bill_no}` : ""}`, by: b.recorder,
          amount: formatLaari(BigInt(b.gross_laari)), mine: false, within: within(b.gross_laari), href: "/bills",
        });
      }
      return { items, limit: upTo === null ? null : formatLaari(upTo < 0n ? 0n : upTo) };
    });
    res.json(out);
  })
);

module.exports = router;
