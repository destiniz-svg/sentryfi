const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const shipments = require("../ledger/shipments");

/**
 * Shipments: goods bought abroad, their containers, and every cost of landing
 * them, shared into what the goods cost. See ledger/shipments.js.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");
const num = z.union([z.string().trim(), z.number()]).transform(String);
const container = z.object({ number: z.string().trim().min(1).max(20), size: z.string().trim().max(10).nullish(), cbm: num.nullish(), weightKg: num.nullish() });
const newBody = z.object({
  reference: z.string().trim().min(1, "Give it the bill of lading number.").max(60),
  description: z.string().trim().max(300).nullish(),
  basis: z.enum(["value", "quantity", "cbm"]).default("value"),
  arrivedOn: dateText.nullish(),
  containers: z.array(container).max(40).default([]),
});

// Anything the ledger refuses is a decision for a person, not a server fault.
const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.code === "23505") throw ApiError.conflict("There is already a shipment with that reference.");
      throw ApiError.badRequest(err.message);
    }
  });

const parse = (schema, body) => {
  const p = schema.safeParse(body ?? {});
  if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
  return p.data;
};

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json({ shipments: await asCompany(req, (client) => shipments.list(client, { companyId: req.companyId })) });
  })
);

router.post(
  "/",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(newBody, req.body);
    const id = await asCompany(req, (client) => shipments.create(client, { companyId: req.companyId, userId: req.user.id, ...b }));
    res.status(201).json({ id });
  })
);

router.get(
  "/:id",
  requireCan("read"),
  refused(async (req, res) => {
    const out = await asCompany(req, async (client) => {
      const s = await shipments.shipment(client, { companyId: req.companyId, shipmentId: req.params.id });
      const summary = await shipments.summary(client, { companyId: req.companyId, shipment: s });
      // What a landing cost can be paid from, and bills that could be part of it.
      const { rows: payFrom } = await client.query(
        "SELECT id, code, name, type::text AS type FROM accounts WHERE company_id = $1 AND type IN ('asset','liability') AND archived_at IS NULL AND code NOT IN ('1300','1350','1360','1400') ORDER BY code",
        [req.companyId]
      );
      const { rows: bills } = await client.query(
        `SELECT b.id, b.bill_no, b.issue_date, b.gross_laari, b.currency, b.fc_gross, c.name AS supplier FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1 AND b.shipment_id IS NULL AND b.voided_at IS NULL AND b.created_at > now() - interval '240 days'
          ORDER BY b.created_at DESC LIMIT 60`,
        [req.companyId]
      );
      return { ...summary, payFrom, candidates: bills.map((b) => ({ id: b.id, billNo: b.bill_no, supplier: b.supplier, issueDate: b.issue_date })) };
    });
    res.json(out);
  })
);

router.patch(
  "/:id",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(z.object({ basis: z.enum(["value", "quantity", "cbm"]).optional(), arrivedOn: dateText.nullish(), description: z.string().trim().max(300).optional(), closed: z.boolean().optional() }), req.body);
    const done = await asCompany(req, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE shipments SET basis = COALESCE($3, basis), arrived_on = CASE WHEN $4::boolean THEN $5::date ELSE arrived_on END,
                description = COALESCE($6, description),
                closed_at = CASE WHEN $7::boolean IS NULL THEN closed_at WHEN $7 THEN COALESCE(closed_at, now()) ELSE NULL END
          WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.companyId, b.basis ?? null, b.arrivedOn !== undefined, b.arrivedOn ?? null, b.description ?? null, b.closed ?? null]
      );
      return rowCount;
    });
    if (!done) throw ApiError.notFound("That shipment is not in these books.");
    res.json({ ok: true });
  })
);

router.post(
  "/:id/containers",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(container, req.body);
    const id = await asCompany(req, async (client) => {
      await shipments.shipment(client, { companyId: req.companyId, shipmentId: req.params.id });
      return shipments.addContainer(client, { companyId: req.companyId, shipmentId: req.params.id, ...b });
    });
    res.status(201).json({ id });
  })
);

router.put(
  "/:id/bills/:billId",
  requireCan("record"),
  refused(async (req, res) => {
    const { linked } = parse(z.object({ linked: z.boolean() }), req.body);
    await asCompany(req, (client) =>
      shipments.linkBill(client, { companyId: req.companyId, userId: req.user.id, shipmentId: linked ? req.params.id : null, billId: req.params.billId })
    );
    res.json({ ok: true });
  })
);

router.put(
  "/:id/goods/:lineId",
  requireCan("record"),
  refused(async (req, res) => {
    const { containerId } = parse(z.object({ containerId: z.string().uuid().nullish() }), req.body);
    await asCompany(req, (client) => shipments.placeInContainer(client, { companyId: req.companyId, shipmentId: req.params.id, lineId: req.params.lineId, containerId }));
    res.json({ ok: true });
  })
);

const costBody = z.object({
  kind: z.enum(shipments.KINDS),
  description: z.string().trim().max(200).nullish(),
  amount: num,
  gstAmount: num.nullish(),
  fromAccountId: z.string().uuid(),
  on: dateText,
});
router.post(
  "/:id/costs",
  requireCan("record"),
  refused(async (req, res) => {
    const b = parse(costBody, req.body);
    const r = await asCompany(req, (client) => shipments.payDirect(client, { companyId: req.companyId, userId: req.user.id, shipmentId: req.params.id, ...b }));
    res.status(201).json({ entryNo: String(r.entry.entryNo) });
  })
);

router.post(
  "/:id/allocate",
  requireCan("record"),
  refused(async (req, res) => {
    const { on } = parse(z.object({ on: dateText }), req.body);
    const r = await asCompany(req, (client) => shipments.allocateCosts(client, { companyId: req.companyId, userId: req.user.id, shipmentId: req.params.id, on }));
    const { formatLaari } = require("../ledger/money");
    res.status(201).json({ entryNo: String(r.entry.entryNo), total: formatLaari(r.total), toSold: formatLaari(r.soldShare) });
  })
);

module.exports = router;
