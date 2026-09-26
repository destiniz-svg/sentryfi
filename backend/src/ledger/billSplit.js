/**
 * What a bill was for, part by part: stock (an item and how many), a cost (on
 * a chosen account), or an asset (a kind and how many years it will be used).
 * Amounts are before tax, in the bill's own currency, as printed; together
 * they may not come to more than the bill's net. Whatever they leave uncovered
 * stays a general cost (5100) when the bill is posted.
 *
 * Each part becomes its share of the bill's net in our own currency, and when
 * the parts cover the whole bill the last takes any laari of rounding, so the
 * entry always balances to the bill.
 */
const { toLaari, formatLaari } = require("./money");
const { assumeIdentity } = require("./post");
const stock = require("./stock");
const { CATEGORIES } = require("./assets");
const passOn = require("./passOn");

const printedNetOf = (bill) => BigInt(bill.fc_net ?? bill.net_laari);

/** The saved parts of a bill, in order, with their own-currency values. */
async function load(client, { companyId, bill }) {
  const { rows: s } = await client.query(
    `SELECT l.id, l.container_id, l.position, l.description, l.item_id, l.quantity, l.amount_laari, i.name, i.unit
       FROM bill_stock_lines l JOIN stock_items i ON i.id = l.item_id
      WHERE l.bill_id = $1 AND l.company_id = $2`,
    [bill.id, companyId]
  );
  const { rows: c } = await client.query(
    `SELECT c.position, c.description, c.kind, c.account_id, c.asset_category, c.asset_life_years, c.amount_laari, c.shipment_id, c.for_customer_id, c.markup_bp, a.name AS account_name
       FROM bill_charges c LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.bill_id = $1 AND c.company_id = $2`,
    [bill.id, companyId]
  );
  const parts = [
    ...s.map((r) => ({
      lineId: r.id, containerId: r.container_id, position: r.position, kind: "stock", description: r.description, itemId: r.item_id, name: r.name, unit: r.unit,
      units: stock.fromDb(r.quantity), amount: BigInt(r.amount_laari),
    })),
    ...c.map((r) => ({
      position: r.position, kind: r.kind, description: r.description, accountId: r.account_id, accountName: r.account_name,
      category: r.asset_category, lifeYears: r.asset_life_years === null ? null : Number(r.asset_life_years), shipmentId: r.shipment_id, amount: BigInt(r.amount_laari),
      forCustomerId: r.for_customer_id, markup: r.for_customer_id ? String(r.markup_bp / 100) : "",
    })),
  ].sort((a, b) => a.position - b.position);

  const printed = printedNetOf(bill);
  const net = BigInt(bill.net_laari);
  const covered = parts.reduce((a, p) => a + p.amount, 0n);
  if (covered > printed) throw new Error("What this bill was for comes to more than the bill before tax.");
  for (const p of parts) p.value = printed === 0n ? 0n : (net * p.amount + printed / 2n) / printed;
  if (parts.length && covered === printed) parts[parts.length - 1].value += net - parts.reduce((a, p) => a + p.value, 0n);
  return { parts, rest: net - parts.reduce((a, p) => a + p.value, 0n) };
}

/**
 * Replaces what a bill not yet in the books was for. Every id must be this
 * company's; a cost goes on an expense account; an asset needs a kind.
 */
async function save(client, { companyId, userId, billId, lines }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("SELECT id, status, net_laari, fc_net FROM bills WHERE id = $1 AND company_id = $2", [billId, companyId]);
  const bill = rows[0];
  if (!bill) throw new Error("No such bill in these books.");
  if (bill.status === "posted") throw new Error("This bill is in the books. Reverse it to change what it was for.");

  const prepared = [];
  for (const [i, l] of lines.entries()) prepared.push(await part(client, companyId, l, i));
  async function part(client, companyId, l, i) {
    const amount = toLaari(l.amount);
    if (amount <= 0n) throw new Error("Each part needs what it cost, before tax.");
    const description = String(l.description || "").trim().slice(0, 300);
    if (l.kind === "stock") {
      if (!l.itemId) throw new Error("Which item is it?");
      return { position: i, kind: "stock", description, itemId: l.itemId, units: stock.toUnits(l.quantity), amount };
    }
    if (l.kind === "cost") {
      if (!l.accountId) throw new Error("Which kind of cost is it?");
      // A cost can wait on a customer's next invoice.
      return { position: i, kind: "cost", description, accountId: l.accountId, amount, ...(await passOn.forCustomer(client, { companyId, forCustomerId: l.forCustomerId, markup: l.markup })) };
    }
    if (l.kind === "asset") {
      if (!CATEGORIES[l.category]) throw new Error("What kind of asset is it?");
      const years = l.lifeYears === null || l.lifeYears === undefined || l.lifeYears === "" ? CATEGORIES[l.category].years : Number(l.lifeYears);
      if (!(years > 0 && years <= 100)) throw new Error("How many years will it be used for?");
      return { position: i, kind: "asset", description, category: l.category, lifeYears: years, amount };
    }
    if (l.kind === "landed") {
      if (!l.shipmentId) throw new Error("Which shipment did it help land?");
      return { position: i, kind: "landed", description, shipmentId: l.shipmentId, amount };
    }
    throw new Error("Each part is stock, a cost, an asset, or a cost of landing a shipment.");
  }

  const printed = printedNetOf(bill);
  const covered = prepared.reduce((a, p) => a + p.amount, 0n);
  if (covered > printed) {
    throw new Error(`The parts come to ${formatLaari(covered)}, more than the bill's ${formatLaari(printed)} before tax.`);
  }
  if (prepared.some((p) => p.kind === "asset" && !p.description)) throw new Error("Name the asset, so it can be found on the register.");

  const itemIds = [...new Set(prepared.filter((p) => p.kind === "stock").map((p) => p.itemId))];
  if (itemIds.length) {
    const { rows: found } = await client.query("SELECT id, name, counted, cost_account_id FROM stock_items WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL", [companyId, itemIds]);
    if (found.length !== itemIds.length) throw new Error("One of those items is not in these books.");
    // A service or an uncounted product is a cost, on the item's own kind of cost.
    const byId = new Map(found.map((r) => [r.id, r]));
    prepared.forEach((p, i) => {
      const item = p.kind === "stock" && byId.get(p.itemId);
      if (!item || item.counted) return;
      if (!item.cost_account_id) throw new Error(`${item.name} is not counted as stock. Say which kind of cost it is, on the item or here.`);
      prepared[i] = { position: p.position, kind: "cost", description: p.description || item.name, accountId: item.cost_account_id, amount: p.amount, forCustomerId: null, markupBp: 0 };
    });
  }
  const accountIds = [...new Set(prepared.filter((p) => p.kind === "cost").map((p) => p.accountId))];
  if (accountIds.length) {
    const { rows: found } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND id = ANY($2::uuid[]) AND type = 'expense'", [companyId, accountIds]);
    if (found.length !== accountIds.length) throw new Error("A cost goes on one of this company's expense accounts.");
  }

  const shipmentIds = [...new Set(prepared.filter((p) => p.kind === "landed").map((p) => p.shipmentId))];
  if (shipmentIds.length) {
    const { rows: found } = await client.query("SELECT id FROM shipments WHERE company_id = $1 AND id = ANY($2::uuid[])", [companyId, shipmentIds]);
    if (found.length !== shipmentIds.length) throw new Error("That shipment is not in these books.");
  }

  await client.query("DELETE FROM bill_stock_lines WHERE bill_id = $1 AND company_id = $2", [billId, companyId]);
  await client.query("DELETE FROM bill_charges WHERE bill_id = $1 AND company_id = $2", [billId, companyId]);
  for (const p of prepared) {
    if (p.kind === "stock") {
      await client.query(
        "INSERT INTO bill_stock_lines (company_id, bill_id, item_id, quantity, amount_laari, position, description) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [companyId, billId, p.itemId, stock.unitsText(p.units), p.amount.toString(), p.position, p.description]
      );
    } else {
      await client.query(
        `INSERT INTO bill_charges (company_id, bill_id, kind, description, account_id, asset_category, asset_life_years, amount_laari, position, shipment_id, for_customer_id, markup_bp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [companyId, billId, p.kind, p.description, p.accountId || null, p.category || null, p.lifeYears ?? null, p.amount.toString(), p.position, p.shipmentId || null, p.forCustomerId || null, p.markupBp || 0]
      );
    }
  }
  return { parts: prepared.length, covered, rest: printed - covered };
}

/**
 * The entry lines a bill's parts make, and what to record once the entry
 * exists: stock movements, and assets on the register.
 */
async function entryParts(client, { companyId, userId, bill, expenseAccountId }) {
  const { parts, rest } = await load(client, { companyId, bill });
  const tags = { counterpartyId: bill.counterparty_id, projectId: bill.project_id, dimensionIds: bill.dimension_ids };
  const lines = [];
  const after = [];
  const date = bill.issue_date || bill.received_at;
  for (const p of parts) {
    if (p.kind === "stock") {
      const acc = await stock.account(client, companyId, stock.ACCOUNTS.stock);
      lines.push({ accountId: acc, debit: p.value, ...tags, memo: `${stock.unitsText(p.units)} ${p.unit} ${p.name}` });
      after.push(async (entryId) => {
        await stock.holding(client, { companyId, itemId: p.itemId }); // locks the item while it moves
        await client.query(
          `INSERT INTO stock_moves (company_id, item_id, moved_on, kind, quantity, value_laari, entry_id, bill_id, created_by)
           VALUES ($1,$2,$3,'bought',$4,$5,$6,$7,$8)`,
          [companyId, p.itemId, date, stock.unitsText(p.units), p.value.toString(), entryId, bill.id, userId]
        );
        // Dated before sales already costed: those sales are re-costed.
        await stock.recost(client, { companyId, userId, itemId: p.itemId, since: date, why: `bill ${bill.bill_no || "without a number"}` });
      });
    } else if (p.kind === "cost") {
      lines.push({ accountId: p.accountId, debit: p.value, ...tags, memo: p.description || null });
    } else if (p.kind === "landed") {
      const shipments = require("./shipments");
      const acc = await shipments.account(client, companyId, shipments.WAITING);
      lines.push({ accountId: acc, debit: p.value, ...tags, memo: p.description || "Landing cost" });
      after.push(async (entryId) => {
        await client.query(
          `INSERT INTO shipment_costs (company_id, shipment_id, kind, description, value_laari, entry_id, bill_id, paid_on, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [companyId, p.shipmentId, shipments.kindOf(p.description), p.description, p.value.toString(), entryId, bill.id, date, userId]
        );
      });
    } else {
      const { categoryAccounts } = require("./assets");
      const { asset, worn } = await categoryAccounts(client, { companyId, category: p.category });
      lines.push({ accountId: asset.id, debit: p.value, ...tags, memo: p.description });
      after.push(async (entryId) => {
        await client.query(
          `INSERT INTO fixed_assets (company_id, name, category, asset_account_id, worn_account_id, cost_laari, residual_laari,
                                     acquired_on, life_months, method, entry_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,'straight_line',$9,$10)`,
          [companyId, p.description, p.category, asset.id, worn.id, p.value.toString(), date, Math.round(p.lifeYears * 12), entryId, userId]
        );
      });
    }
  }
  // A bill against a commitment is that commitment's kind of cost.
  if (rest > 0n && bill.commitment_id) {
    const { rows: c } = await client.query("SELECT account_id FROM project_commitments WHERE id = $1 AND company_id = $2", [bill.commitment_id, companyId]);
    if (c[0]) expenseAccountId = c[0].account_id;
  }
  if (rest > 0n) lines.push({ accountId: expenseAccountId, debit: rest, ...tags, memo: bill.bill_no ? `Bill ${bill.bill_no}` : null});
  return { lines, split: parts.length > 0, record: async (entryId) => { for (const f of after) await f(entryId); } };
}

/**
 * A reversed bill takes its assets back off the register, unless one has been
 * depreciated or disposed of since: then it is refused, because the register
 * and the books would stop agreeing.
 */
async function undoAssets(client, { companyId, entryId }) {
  const { rows } = await client.query(
    `SELECT f.id, f.name, f.disposed_on, EXISTS (SELECT 1 FROM asset_depreciation d WHERE d.asset_id = f.id) AS charged
       FROM fixed_assets f WHERE f.company_id = $1 AND f.entry_id = $2`,
    [companyId, entryId]
  );
  for (const a of rows) {
    if (a.charged || a.disposed_on) throw new Error(`${a.name} has been depreciated or disposed of since. Sell or scrap it on the register instead.`);
    await client.query("DELETE FROM fixed_assets WHERE id = $1 AND company_id = $2", [a.id, companyId]);
  }
}

module.exports = { load, save, entryParts, undoAssets, printedNetOf };
