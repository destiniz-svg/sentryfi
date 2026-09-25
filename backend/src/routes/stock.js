const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { toLaari } = require("../ledger/money");
const stock = require("../ledger/stock");
const gemini = require("../services/geminiService");

/**
 * Items: products and services. A counted product is stock: what is on hand
 * and what it is worth, counts, and stock a company already had. Buying and
 * selling happen on bills and invoices.
 */

const router = express.Router();
router.use(requireAuth, requireCompany);

const money = z.union([z.string().trim(), z.number()]).transform(String);
const qty = z.union([z.string().trim(), z.number()]).transform(String);
const id = z.string().uuid().nullish();
const itemBody = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(160),
  code: z.string().trim().max(40).nullish(),
  unit: z.string().trim().min(1).max(20).default("each"),
  kind: z.enum(["product", "service", "bundle"]).default("product"),
  // A bundle's parts: the items it is made of and how many of each.
  parts: z.array(z.object({ itemId: z.string().uuid(), quantity: qty })).max(30).optional(),
  // A small photograph, made small on the phone before it is sent.
  photo: z.string().max(300000).regex(/^data:image\/(jpeg|png|webp);base64,/, "A photo is a JPEG, PNG or WebP image.").nullish(),
  counted: z.boolean().optional(),
  sells: z.boolean().default(true),
  buys: z.boolean().default(true),
  salePrice: money.nullish(),
  buyPrice: money.nullish(),
  incomeAccountId: id,
  costAccountId: id,
  // Its GST class, as a person says it; null clears it for the model to work out.
  tax: z.enum(["standard", "zero_rated", "exempt"]).nullish(),
});
const laari = (v) => (v === null || v === undefined || v === "" ? null : toLaari(v).toString());

/**
 * What an item will be once this change is made, checked as a whole: a service
 * is never counted, it is sold or bought or both, its accounts are this
 * company's and of the right kind, and a counted product stops being counted
 * only when none is on hand.
 */
async function settle(client, companyId, it, was) {
  if (it.kind === "service") it.counted = false;
  // A bundle is sold, never bought or counted: its parts are.
  if (it.kind === "bundle") Object.assign(it, { counted: false, sells: true, buys: false });
  if (!it.sells && !it.buys) throw ApiError.badRequest("Say whether you sell it, buy it, or both.");
  for (const [key, type, word] of [["income_account_id", "income", "income"], ["cost_account_id", "expense", "costs"]]) {
    if (!it[key]) continue;
    const { rows } = await client.query("SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND type = $3::account_t", [it[key], companyId, type]);
    if (!rows.length) throw ApiError.badRequest(`That is not one of this company's accounts for ${word}.`);
  }
  if (was?.counted && !it.counted) {
    const { rows } = await client.query("SELECT COALESCE(SUM(quantity), 0) AS q FROM stock_moves WHERE company_id = $1 AND item_id = $2", [companyId, was.id]);
    if (Number(rows[0].q) !== 0) throw ApiError.badRequest(`${was.name} still has ${Number(rows[0].q)} ${was.unit} on hand. Sell or count it down to nothing before you stop counting it.`);
  }
  return it;
}

/** A bundle's parts and an item's photo, when sent. Parts are counted or uncounted products, never another bundle. */
async function dress(client, companyId, itemId, kind, b) {
  if (b.photo !== undefined) await client.query("UPDATE stock_items SET photo = $3 WHERE id = $1 AND company_id = $2", [itemId, companyId, b.photo || null]);
  if (kind !== "bundle") return;
  if (b.parts === undefined) return;
  const parts = b.parts.filter((p) => Number(p.quantity) > 0);
  if (!parts.length) throw ApiError.badRequest("A bundle is made of at least one item.");
  const { rows } = await client.query("SELECT id, kind FROM stock_items WHERE company_id = $1 AND id = ANY($2::uuid[])", [companyId, parts.map((p) => p.itemId)]);
  if (rows.length !== new Set(parts.map((p) => p.itemId)).size || rows.some((r) => r.kind === "bundle" || r.id === itemId)) throw ApiError.badRequest("A bundle is made of this company's products, not other bundles.");
  await client.query("DELETE FROM bundle_parts WHERE company_id = $1 AND bundle_id = $2", [companyId, itemId]);
  for (const p of parts) await client.query("INSERT INTO bundle_parts (company_id, bundle_id, item_id, quantity) VALUES ($1,$2,$3,$4)", [companyId, itemId, p.itemId, reorderText(p.quantity)]);
}

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
  "/units",
  requireCan("read"),
  asyncHandler(async (req, res) => res.json({ units: await asCompany(req, (client) => stock.units(client, { companyId: req.companyId })) }))
);

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const out = await asCompany(req, async (client) => {
      // The accounts an item can sell to or be bought on, for the item form.
      const { rows: accounts } = await client.query(
        "SELECT id, code, name, type FROM accounts WHERE company_id = $1 AND type IN ('income','expense') AND archived_at IS NULL ORDER BY code",
        [req.companyId]
      );
      return {
        items: await stock.list(client, { companyId: req.companyId }),
        places: await stock.places(client, { companyId: req.companyId }),
        accounts: { income: accounts.filter((x) => x.type === "income"), cost: accounts.filter((x) => x.type === "expense") },
      };
    });
    res.json(out);
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
      const it = await settle(client, req.companyId, {
        kind: b.kind, counted: b.counted ?? b.kind === "product", sells: b.sells, buys: b.buys,
        income_account_id: b.incomeAccountId || null, cost_account_id: b.costAccountId || null,
      });
      const { rows } = await client.query(
        `INSERT INTO stock_items (company_id, name, code, unit, sale_price_laari, buy_price_laari, kind, counted, sells, buys, income_account_id, cost_account_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, name, code, unit, kind, counted`,
        [req.companyId, b.name, b.code || null, b.unit, laari(b.salePrice), laari(b.buyPrice), it.kind, it.counted, it.sells, it.buys, it.income_account_id, it.cost_account_id, req.user.id]
      );
      await dress(client, req.companyId, rows[0].id, it.kind, b);
      if (b.tax) await client.query("UPDATE stock_items SET tax = $2, tax_by = 'you' WHERE id = $1", [rows[0].id, b.tax]);
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
    const parsed = itemBody.extend({ unit: z.string().trim().min(1).max(20), kind: z.enum(["product", "service", "bundle"]), sells: z.boolean(), buys: z.boolean() }).partial().extend({ archived: z.boolean().optional(), reorderAt: z.union([z.string().trim(), z.number()]).transform(String).nullish() }).safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const b = parsed.data;
    const done = await asCompany(req, async (client) => {
      const { rows: cur } = await client.query("SELECT * FROM stock_items WHERE id = $1 AND company_id = $2 FOR UPDATE", [req.params.id, req.companyId]);
      const was = cur[0];
      if (!was) return null;
      // A field not sent stays as it is.
      const has = (k) => b[k] !== undefined;
      const it = await settle(client, req.companyId, {
        kind: b.kind ?? was.kind,
        // A service turned into a product starts uncounted unless asked.
        counted: has("counted") ? b.counted : was.kind === "service" ? false : was.counted,
        sells: b.sells ?? was.sells,
        buys: b.buys ?? was.buys,
        income_account_id: has("incomeAccountId") ? b.incomeAccountId || null : was.income_account_id,
        cost_account_id: has("costAccountId") ? b.costAccountId || null : was.cost_account_id,
      }, was);
      await client.query(
        `UPDATE stock_items SET name = $3, code = $4, unit = $5, sale_price_laari = $6, buy_price_laari = $7, kind = $8, counted = $9, sells = $10, buys = $11,
           income_account_id = $12, cost_account_id = $13,
           archived_at = CASE WHEN $14::boolean IS NULL THEN archived_at WHEN $14 THEN COALESCE(archived_at, now()) ELSE NULL END,
           reorder_at = $15
         WHERE id = $1 AND company_id = $2`,
        [
          req.params.id, req.companyId, b.name ?? was.name, has("code") ? b.code || null : was.code, b.unit ?? was.unit,
          has("salePrice") ? laari(b.salePrice) : was.sale_price_laari, has("buyPrice") ? laari(b.buyPrice) : was.buy_price_laari,
          it.kind, it.counted, it.sells, it.buys, it.income_account_id, it.cost_account_id,
          b.archived ?? null,
          !it.counted ? null : has("reorderAt") ? (b.reorderAt === null || b.reorderAt === "" ? null : reorderText(b.reorderAt)) : was.reorder_at,
        ]
      );
      await dress(client, req.companyId, req.params.id, it.kind, b);
      if (has("tax")) await client.query("UPDATE stock_items SET tax = $3, tax_by = $4, tax_why = NULL WHERE id = $1 AND company_id = $2", [req.params.id, req.companyId, b.tax || null, b.tax ? "you" : null]);
      return true;
    });
    if (!done) throw ApiError.notFound("That item is not in these books.");
    res.json({ ok: true });
  })
);

// The model works out an item's GST class when nobody has said it. Without a
// model on the server the answer is what is already known.
router.post(
  "/:id/tax",
  requireCan("record"),
  refused(async (req, res) => {
    const out = await asCompany(req, (client) =>
      stock.guessTax(client, { companyId: req.companyId, itemId: req.params.id, ask: gemini.available() ? gemini.itemTax : null })
    );
    if (!out) throw ApiError.notFound("That item is not in these books.");
    res.json(out);
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

const place = z.string().uuid("Which place?").nullish();
const countBody = z.object({ counted: qty, on: dateText, unitCost: money.nullish(), note: z.string().trim().max(300).nullish(), placeId: place });

// Where stock is kept, and moving it between places.
router.post(
  "/places",
  requireCan("record"),
  refused(async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(2, "Give the place a name.").max(80) }).safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    res.status(201).json(await asCompany(req, (client) => stock.addPlace(client, { companyId: req.companyId, userId: req.user.id, name: parsed.data.name })));
  })
);

const transferBody = z.object({ fromPlaceId: place, toPlaceId: place, quantity: qty, on: dateText, note: z.string().trim().max(300).nullish() });
router.post(
  "/:id/transfer",
  requireCan("record"),
  refused(async (req, res) => {
    const parsed = transferBody.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    res.status(201).json(await asCompany(req, (client) => stock.transfer(client, { companyId: req.companyId, userId: req.user.id, itemId: req.params.id, ...parsed.data })));
  })
);
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

const openingBody = z.object({ quantity: qty, unitCost: money, on: dateText, placeId: place });
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
