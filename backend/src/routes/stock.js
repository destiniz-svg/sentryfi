const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { toLaari } = require("../ledger/money");
const stock = require("../ledger/stock");

/**
 * Stock: the items, what is on hand and what it is worth, counts, and stock a
 * company already had. Buying and selling it happen on bills and invoices.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const money = z.union([z.string().trim(), z.number()]).transform(String);
const qty = z.union([z.string().trim(), z.number()]).transform(String);
const itemBody = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(160),
  code: z.string().trim().max(40).nullish(),
  unit: z.string().trim().min(1).max(20).default("each"),
  salePrice: money.nullish(),
});
/** A reorder level as the database keeps it: a number, zero or above, to four places. */
function reorderText(v) {
  const t = String(v).trim();
  if (!/^\d+(\.\d{1,4})?$/.test(t)) throw ApiError.badRequest("A reorder level is a number, zero or above.");
  return t;
}
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date is YYYY-MM-DD.");

// Anything the ledger refuses is a decision for a person, not a server fault.
const refused = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.code === "23505") throw ApiError.conflict("There is already an item with that name or code.");
      throw ApiError.badRequest(err.message);
    }
  });

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const items = await asCompany(req, (client) => stock.list(client, { companyId: req.companyId }));
    res.json({ items });
  })
);

router.post(
  "/",
  requireCan("record"),
  refused(async (req, res) => {
    const parsed = itemBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const b = parsed.data;
    const item = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO stock_items (company_id, name, code, unit, sale_price_laari, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, code, unit`,
        [req.companyId, b.name, b.code || null, b.unit, b.salePrice ? toLaari(b.salePrice).toString() : null, req.user.id]
      );
      return rows[0];
    });
    res.status(201).json({ item });
  })
);

router.patch(
  "/:id",
  requireCan("record"),
  refused(async (req, res) => {
    // No defaults on a change: a field not sent stays as it is (unit used to fall back to "each").
    const parsed = itemBody.extend({ unit: z.string().trim().min(1).max(20) }).partial().extend({ archived: z.boolean().optional(), reorderAt: z.union([z.string().trim(), z.number()]).transform(String).nullish() }).safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const b = parsed.data;
    const done = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `UPDATE stock_items SET
           name = COALESCE($3, name),
           code = CASE WHEN $4::boolean THEN $5 ELSE code END,
           unit = COALESCE($6, unit),
           sale_price_laari = CASE WHEN $7::boolean THEN $8::bigint ELSE sale_price_laari END,
           archived_at = CASE WHEN $9::boolean IS NULL THEN archived_at WHEN $9 THEN COALESCE(archived_at, now()) ELSE NULL END,
           reorder_at = CASE WHEN $10::boolean THEN $11::numeric ELSE reorder_at END
         WHERE id = $1 AND company_id = $2 RETURNING id`,
        [
          req.params.id, req.companyId, b.name ?? null,
          b.code !== undefined, b.code || null,
          b.unit ?? null,
          b.salePrice !== undefined, b.salePrice ? toLaari(b.salePrice).toString() : null,
          b.archived ?? null,
          b.reorderAt !== undefined, b.reorderAt === null || b.reorderAt === "" || b.reorderAt === undefined ? null : reorderText(b.reorderAt),
        ]
      );
      return rows[0];
    });
    if (!done) throw ApiError.notFound("That item is not in these books.");
    res.json({ ok: true });
  })
);

router.get(
  "/:id/history",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const moves = await asCompany(req, (client) => stock.history(client, { companyId: req.companyId, itemId: req.params.id }));
    res.json({ moves });
  })
);

const countBody = z.object({ counted: qty, on: dateText, unitCost: money.nullish(), note: z.string().trim().max(300).nullish() });
router.post(
  "/:id/count",
  requireCan("record"),
  refused(async (req, res) => {
    const parsed = countBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const r = await asCompany(req, (client) =>
      stock.count(client, { companyId: req.companyId, userId: req.user.id, itemId: req.params.id, ...parsed.data })
    );
    res.status(201).json({ entryNo: String(r.entry.entryNo), difference: r.difference });
  })
);

const openingBody = z.object({ quantity: qty, unitCost: money, on: dateText });
router.post(
  "/:id/opening",
  requireCan("record"),
  refused(async (req, res) => {
    const parsed = openingBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const r = await asCompany(req, (client) =>
      stock.opening(client, { companyId: req.companyId, userId: req.user.id, itemId: req.params.id, ...parsed.data })
    );
    res.status(201).json({ entryNo: String(r.entry.entryNo) });
  })
);

module.exports = router;
