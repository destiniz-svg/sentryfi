/**
 * Stock: what is on hand, what it cost, and what each sale earned.
 *
 * Weighted average cost, for the whole company. What is on hand is the sum of
 * an item's movements, and so is its value; a sale takes out its share of that
 * value (all of it when the last unit goes, so no laari is ever left behind).
 * An item is locked while it moves, so two sales at once cannot both take the
 * last one.
 *
 * Nothing goes below zero. Selling what the books say is not there usually
 * means a delivery was never recorded, and the answer is to record it (or
 * count), not to let the value go strange.
 *
 * ponytail: cost is worked out in the order things are posted. A bill dated
 * before a sale but posted after it does not go back and change that sale's
 * cost; the average simply moves from then on. Recalculating history is a
 * later refinement if an accountant asks for it.
 */
const { postEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");

const ACCOUNTS = {
  stock: ["1350", "Stock on hand", "asset"],
  cogs: ["5050", "Cost of goods sold", "expense"],
  counted: ["5870", "Stock counted short or over", "expense"],
  opening: ["3900", "Opening balances", "equity"],
};

async function account(client, companyId, [code, name, type]) {
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4::account_t) ON CONFLICT (company_id, code) DO NOTHING`,
    [companyId, code, name, type]
  );
  const { rows } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = $2", [companyId, code]);
  return rows[0].id;
}

// Quantities are held to four places, as whole ten-thousandths, so the
// arithmetic is exact.
const SCALE = 10000n;
function toUnits(q) {
  const s = String(q ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(s)) throw new Error("A quantity is a number above zero, with at most four decimal places.");
  const [whole, frac = ""] = s.split(".");
  const units = BigInt(whole) * SCALE + BigInt(frac.padEnd(4, "0"));
  if (units <= 0n) throw new Error("A quantity has to be above zero.");
  return units;
}
/** A NUMERIC from the database, which may be negative, as whole ten-thousandths. */
function fromDb(n) {
  const s = String(n);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const v = BigInt(whole) * SCALE + BigInt((frac + "0000").slice(0, 4));
  return neg ? -v : v;
}
function unitsText(u) {
  const neg = u < 0n;
  const a = neg ? -u : u;
  const frac = (a % SCALE).toString().padStart(4, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / SCALE}${frac ? "." + frac : ""}`;
}

/** An item and what is on hand of it, locked for the rest of the transaction. */
async function holding(client, { companyId, itemId }) {
  const { rows } = await client.query(
    "SELECT id, name, unit, archived_at FROM stock_items WHERE id = $1 AND company_id = $2 FOR UPDATE",
    [itemId, companyId]
  );
  if (!rows.length) throw new Error("That item is not in these books.");
  const { rows: sum } = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(value_laari), 0) AS v FROM stock_moves WHERE company_id = $1 AND item_id = $2",
    [companyId, itemId]
  );
  return { item: rows[0], units: fromDb(sum[0].q), value: BigInt(sum[0].v) };
}

/** The value of taking `units` out of what is held, at its average cost. */
function costOut(held, units) {
  if (units > held.units) {
    throw new Error(
      `Only ${unitsText(held.units)} ${held.item.unit} of ${held.item.name} ${held.units === SCALE ? "is" : "are"} on hand, and this takes out ${unitsText(units)}. ` +
        "Record the bill that brought the rest in, or count it, first."
    );
  }
  if (units === held.units) return held.value;
  return (held.value * units + held.units / 2n) / held.units;
}

async function recordMove(client, m) {
  await client.query(
    `INSERT INTO stock_moves (company_id, item_id, moved_on, kind, quantity, value_laari, sale_net_laari, entry_id, bill_id, invoice_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      m.companyId, m.itemId, m.on, m.kind, unitsText(m.units), m.value.toString(),
      m.saleNet === undefined ? null : m.saleNet.toString(), m.entryId, m.billId || null, m.invoiceId || null, m.note || null, m.userId,
    ]
  );
}

// ------------------------------------------------------------------ bills

/** Says a bill brought in only these items (billSplit.save, stock parts only). */
async function setBillStock(client, { companyId, userId, billId, lines }) {
  return require("./billSplit").save(client, { companyId, userId, billId, lines: lines.map((l) => ({ ...l, kind: "stock" })) });
}

/**
 * Taking a bill's stock back out when the bill is reversed, at exactly what it
 * came in at. Refused when some of it has since been sold, because then the
 * average no longer adds up: count it instead.
 */
async function undoBillStock(client, { companyId, userId, billId, entryId, on }) {
  const { rows } = await client.query(
    "SELECT item_id, SUM(quantity) AS q, SUM(value_laari) AS v FROM stock_moves WHERE company_id = $1 AND bill_id = $2 GROUP BY item_id",
    [companyId, billId]
  );
  for (const r of rows) {
    const units = fromDb(r.q);
    const value = BigInt(r.v);
    if (units <= 0n) continue;
    const held = await holding(client, { companyId, itemId: r.item_id });
    const left = held.value - value;
    if (units > held.units || left < 0n || (units === held.units && left !== 0n)) {
      throw new Error(`Some of the ${held.item.name} on this bill has been sold since. Count it instead of reversing the bill.`);
    }
    await recordMove(client, { companyId, userId, itemId: r.item_id, on, kind: "undone", units: -units, value: -value, entryId, billId, note: "Bill reversed" });
  }
}

// ------------------------------------------------------------------ sales

/**
 * What an invoice's items cost. Returns the extra entry lines (cost of goods
 * sold against stock) and a function that records the movements once the
 * entry exists. Two lines of the same item on one invoice take their cost one
 * after the other.
 */
async function invoiceCost(client, { companyId, userId, invoice, lines }) {
  const sold = lines.filter((l) => l.item_id);
  if (!sold.length) return { entryLines: [], record: async () => {} };
  const stockAcc = await account(client, companyId, ACCOUNTS.stock);
  const cogsAcc = await account(client, companyId, ACCOUNTS.cogs);
  const held = new Map();
  const moves = [];
  const entryLines = [];
  for (const l of sold) {
    if (!held.has(l.item_id)) held.set(l.item_id, await holding(client, { companyId, itemId: l.item_id }));
    const h = held.get(l.item_id);
    const units = fromDb(l.quantity);
    if (units <= 0n) throw new Error(`A line selling ${h.item.name} needs a quantity.`);
    const cost = costOut(h, units);
    h.units -= units;
    h.value -= cost;
    moves.push({ itemId: l.item_id, units: -units, value: -cost, saleNet: BigInt(l.net_laari) });
    if (cost > 0n) {
      const memo = `${unitsText(units)} ${h.item.unit} ${h.item.name}`;
      entryLines.push({ accountId: cogsAcc, debit: cost, projectId: l.project_id, dimensionIds: invoice.dimension_ids, memo });
      entryLines.push({ accountId: stockAcc, credit: cost, memo });
    }
  }
  const record = async (entryId) => {
    for (const m of moves) {
      await recordMove(client, { companyId, userId, ...m, on: invoice.issue_date, kind: "sold", entryId, invoiceId: invoice.id });
    }
  };
  return { entryLines, record };
}

// ------------------------------------------------------------------ counts and opening

/**
 * A count: what is really there. The difference is taken out at average cost,
 * or put in at average cost (or the cost given, when there is none yet), and
 * the value goes to 5870 so shrinkage is seen, not buried.
 */
async function count(client, { companyId, userId, itemId, counted, on, unitCost, note }) {
  await assumeIdentity(client, { companyId, userId });
  const held = await holding(client, { companyId, itemId });
  const target = /^0*(\.0*)?$/.test(String(counted ?? "").trim()) && String(counted ?? "").trim() !== "" ? 0n : toUnits(counted);
  const diff = target - held.units;
  if (diff === 0n) throw new Error(`The books already say ${unitsText(target)} ${held.item.unit}. Nothing to change.`);
  let value;
  if (diff < 0n) value = -costOut(held, -diff);
  else {
    const unit = unitCost !== undefined && unitCost !== null && unitCost !== "" ? toLaari(unitCost) : held.units > 0n ? null : undefined;
    if (unit === undefined) throw new Error(`None was on hand, so say what one ${held.item.unit} cost.`);
    value = unit === null ? (held.value * diff + held.units / 2n) / held.units : (unit * diff + SCALE / 2n) / SCALE;
  }
  if (value === 0n) throw new Error("That difference is worth nothing at this cost, so there is nothing to record.");
  const stockAcc = await account(client, companyId, ACCOUNTS.stock);
  const countedAcc = await account(client, companyId, ACCOUNTS.counted);
  const memo = `Counted ${unitsText(target)} ${held.item.unit} ${held.item.name}; the books said ${unitsText(held.units)}`;
  const abs = value < 0n ? -value : value;
  const entry = await postEntry(client, {
    companyId, userId, date: on, source: "stock", narrative: memo,
    lines:
      value < 0n
        ? [{ accountId: countedAcc, debit: abs, memo }, { accountId: stockAcc, credit: abs, memo }]
        : [{ accountId: stockAcc, debit: abs, memo }, { accountId: countedAcc, credit: abs, memo }],
  });
  await recordMove(client, { companyId, userId, itemId, on, kind: "counted", units: diff, value, entryId: entry.id, note: note || null });
  return { entry, difference: unitsText(diff), value };
}

/** Stock a company already had before Sentryfi, at what it cost. */
async function opening(client, { companyId, userId, itemId, quantity, unitCost, on }) {
  await assumeIdentity(client, { companyId, userId });
  const held = await holding(client, { companyId, itemId });
  const units = toUnits(quantity);
  const value = (toLaari(unitCost) * units + SCALE / 2n) / SCALE;
  if (value <= 0n) throw new Error("Say what one cost, above zero.");
  const stockAcc = await account(client, companyId, ACCOUNTS.stock);
  const openingAcc = await account(client, companyId, ACCOUNTS.opening);
  const memo = `${unitsText(units)} ${held.item.unit} ${held.item.name} already on hand`;
  const entry = await postEntry(client, {
    companyId, userId, date: on, source: "stock", narrative: memo,
    lines: [{ accountId: stockAcc, debit: value, memo }, { accountId: openingAcc, credit: value, memo }],
  });
  await recordMove(client, { companyId, userId, itemId, on, kind: "opening", units, value, entryId: entry.id });
  return { entry, value };
}

// ------------------------------------------------------------------ reading

/** Every item with what is on hand, its value, its average cost, and what its sales earned over their cost. */
async function list(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT i.id, i.name, i.code, i.unit, i.sale_price_laari, i.archived_at, i.reorder_at,
            COALESCE(SUM(m.quantity), 0) AS on_hand,
            COALESCE(SUM(m.value_laari), 0) AS value,
            COALESCE(SUM(m.sale_net_laari) FILTER (WHERE m.kind = 'sold'), 0) AS sales,
            COALESCE(-SUM(m.value_laari) FILTER (WHERE m.kind = 'sold'), 0) AS cost_of_sales,
            COALESCE(-SUM(m.quantity) FILTER (WHERE m.kind = 'sold'), 0) AS sold
       FROM stock_items i LEFT JOIN stock_moves m ON m.item_id = i.id AND m.company_id = i.company_id
      WHERE i.company_id = $1
      GROUP BY i.id ORDER BY lower(i.name)`,
    [companyId]
  );
  return rows.map((r) => {
    const units = fromDb(r.on_hand);
    const value = BigInt(r.value);
    const sales = BigInt(r.sales);
    const cost = BigInt(r.cost_of_sales);
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      unit: r.unit,
      salePrice: r.sale_price_laari === null ? null : formatLaari(BigInt(r.sale_price_laari)),
      archived: Boolean(r.archived_at),
      onHand: unitsText(units),
      reorderAt: r.reorder_at === null ? null : unitsText(fromDb(r.reorder_at)),
      low: r.reorder_at !== null && !r.archived_at && units <= fromDb(r.reorder_at),
      value: formatLaari(value),
      averageCost: units > 0n ? formatLaari((value * SCALE + units / 2n) / units) : null,
      sold: unitsText(fromDb(r.sold)),
      sales: formatLaari(sales),
      costOfSales: formatLaari(cost),
      margin: formatLaari(sales - cost),
      marginPercent: sales > 0n ? Number(((sales - cost) * 1000n) / sales) / 10 : null,
    };
  });
}

/** One item's movements, newest first. */
async function history(client, { companyId, itemId }) {
  const { rows } = await client.query(
    `SELECT m.moved_on, m.kind, m.quantity, m.value_laari, m.sale_net_laari, m.note, e.entry_no,
            b.bill_no, s.invoice_no
       FROM stock_moves m JOIN journal_entries e ON e.id = m.entry_id
       LEFT JOIN bills b ON b.id = m.bill_id LEFT JOIN sales_invoices s ON s.id = m.invoice_id
      WHERE m.company_id = $1 AND m.item_id = $2
      ORDER BY m.moved_on DESC, m.created_at DESC`,
    [companyId, itemId]
  );
  return rows.map((r) => ({
    on: r.moved_on,
    kind: r.kind,
    quantity: unitsText(fromDb(r.quantity)),
    value: formatLaari(BigInt(r.value_laari)),
    saleNet: r.sale_net_laari === null ? null : formatLaari(BigInt(r.sale_net_laari)),
    note: r.note,
    entryNo: String(r.entry_no),
    document: r.bill_no ? `Bill ${r.bill_no}` : r.invoice_no || null,
  }));
}

module.exports = { ACCOUNTS, account, toUnits, unitsText, fromDb, holding, costOut, setBillStock, undoBillStock, invoiceCost, count, opening, list, history };
