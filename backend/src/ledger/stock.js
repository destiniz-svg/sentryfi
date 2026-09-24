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
 * Cost is worked out in the order things are posted. A bill dated before
 * sales already costed re-costs them (recost below): one correction, dated
 * the day it is found, so closed months are never reopened.
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

const MAIN = "main";
const placeKey = (id) => id || MAIN;

/**
 * How many of an item are at each place: its movements there, plus what was
 * moved in, less what was moved out. Keyed by place id, "main" for the main store.
 */
async function atPlaces(client, { companyId, itemId }) {
  const { rows } = await client.query(
    `SELECT place, SUM(q) AS q FROM (
       SELECT place_id AS place, quantity AS q FROM stock_moves WHERE company_id = $1 AND item_id = $2
       UNION ALL SELECT to_place_id, quantity FROM stock_transfers WHERE company_id = $1 AND item_id = $2
       UNION ALL SELECT from_place_id, -quantity FROM stock_transfers WHERE company_id = $1 AND item_id = $2
     ) x GROUP BY place`,
    [companyId, itemId]
  );
  return new Map(rows.map((r) => [placeKey(r.place), fromDb(r.q)]));
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
    `INSERT INTO stock_moves (company_id, item_id, moved_on, kind, quantity, value_laari, sale_net_laari, entry_id, bill_id, invoice_id, note, created_by, place_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      m.companyId, m.itemId, m.on, m.kind, unitsText(m.units), m.value.toString(),
      m.saleNet === undefined ? null : m.saleNet.toString(), m.entryId, m.billId || null, m.invoiceId || null, m.note || null, m.userId, m.placeId || null,
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
  const places = new Map();
  const moves = [];
  const entryLines = [];
  for (const l of sold) {
    if (!held.has(l.item_id)) held.set(l.item_id, await holding(client, { companyId, itemId: l.item_id }));
    if (!places.has(l.item_id)) places.set(l.item_id, await atPlaces(client, { companyId, itemId: l.item_id }));
    const h = held.get(l.item_id);
    const units = fromDb(l.quantity);
    if (units <= 0n) throw new Error(`A line selling ${h.item.name} needs a quantity.`);
    const cost = costOut(h, units);
    h.units -= units;
    h.value -= cost;
    // Where it leaves from: the main store first, then the place holding most.
    // The cost is shared by units, the last part taking what rounding leaves.
    const at = places.get(l.item_id);
    const order = [...at.entries()].filter(([, q]) => q > 0n).sort(([a, qa], [b, qb]) => (a === MAIN ? -1 : b === MAIN ? 1 : qb > qa ? 1 : qb < qa ? -1 : 0));
    let left = units;
    let costLeft = cost;
    const parts = [];
    for (const [place, q] of order) {
      if (left <= 0n) break;
      const take = q < left ? q : left;
      parts.push([place, take]);
      left -= take;
    }
    if (left > 0n) parts.push([MAIN, left]); // held overall but not placed: from the main store
    parts.forEach(([place, take], i) => {
      const partCost = i === parts.length - 1 ? costLeft : (cost * take) / units;
      costLeft -= partCost;
      at.set(place, (at.get(place) || 0n) - take);
      moves.push({ itemId: l.item_id, units: -take, value: -partCost, saleNet: (BigInt(l.net_laari) * take) / units, placeId: place === MAIN ? null : place });
    });
    // what rounding leaves of the sale's net goes to the last part
    const netParts = moves.slice(-parts.length).reduce((a, m) => a + m.saleNet, 0n);
    moves[moves.length - 1].saleNet += BigInt(l.net_laari) - netParts;
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

/** What of each item an invoice sold that has not already come back. */
async function returnable(client, { companyId, invoiceId }) {
  const { rows } = await client.query(
    `SELECT m.item_id, i.name, i.unit, -SUM(m.quantity) AS q, -SUM(m.value_laari) AS v, SUM(m.sale_net_laari) AS net
       FROM stock_moves m JOIN stock_items i ON i.id = m.item_id
      WHERE m.company_id = $1 AND m.invoice_id = $2 AND m.kind IN ('sold','returned')
      GROUP BY m.item_id, i.name, i.unit ORDER BY i.name`,
    [companyId, invoiceId]
  );
  return rows.map((r) => ({ itemId: r.item_id, name: r.name, unit: r.unit, units: fromDb(r.q), value: BigInt(r.v), net: BigInt(r.net || 0) })).filter((r) => r.units > 0n);
}

/**
 * ponytail: a sale re-costed later (recost) still returns at its first cost;
 * the difference is small and the next count settles it.
 *
 * Goods coming back on a credit note go back into stock at exactly what they
 * left at on that invoice (its share of it, for part), so the average is as if
 * they never went. Their share of the sale comes off the item's sales too.
 */
async function returnCost(client, { companyId, userId, invoice, returned = [] }) {
  const back = returned.filter((r) => r && r.quantity !== undefined && String(r.quantity).trim() !== "" && Number(r.quantity) !== 0);
  if (!back.length) return { entryLines: [], record: async () => {} };
  const sold = new Map((await returnable(client, { companyId, invoiceId: invoice.id })).map((r) => [r.itemId, r]));
  const stockAcc = await account(client, companyId, ACCOUNTS.stock);
  const cogsAcc = await account(client, companyId, ACCOUNTS.cogs);
  const moves = [];
  const entryLines = [];
  for (const r of back) {
    const s = sold.get(r.itemId);
    if (!s) throw new Error(`${invoice.invoice_no} sold none of that item, or it has all come back already.`);
    const units = toUnits(r.quantity);
    if (units > s.units) throw new Error(`${invoice.invoice_no} sold ${unitsText(s.units)} ${s.unit} of ${s.name} still out; ${unitsText(units)} cannot come back.`);
    await holding(client, { companyId, itemId: r.itemId }); // lock it
    const share = (x) => (units === s.units ? x : (x * units + s.units / 2n) / s.units);
    const value = share(s.value);
    const net = share(s.net);
    s.units -= units;
    s.value -= value;
    s.net -= net;
    moves.push({ itemId: r.itemId, units, value, saleNet: -net });
    if (value > 0n) {
      const memo = `${unitsText(units)} ${s.unit} ${s.name} back`;
      entryLines.push({ accountId: stockAcc, debit: value, memo });
      entryLines.push({ accountId: cogsAcc, credit: value, projectId: invoice.project_id, dimensionIds: invoice.dimension_ids, memo });
    }
  }
  const record = async (entryId, on, note) => {
    for (const m of moves) await recordMove(client, { companyId, userId, ...m, on, kind: "returned", entryId, invoiceId: invoice.id, note });
  };
  return { entryLines, record };
}

/**
 * An item's history replayed in date order, as if everything had been posted
 * on its own date: goods in at what they cost, goods out at the average then.
 * The difference from what the books hold is posted between stock and cost of
 * sales today. Earlier corrections are left out of the replay and counted in
 * what is held, so running it twice changes nothing.
 */
async function recost(client, { companyId, userId, itemId, since, why }) {
  const { rows: later } = await client.query(
    "SELECT 1 FROM stock_moves WHERE company_id = $1 AND item_id = $2 AND kind = 'sold' AND moved_on > $3 LIMIT 1",
    [companyId, itemId, since]
  );
  if (!later.length) return null;
  const held = await holding(client, { companyId, itemId });
  const { rows } = await client.query(
    "SELECT kind, quantity, value_laari FROM stock_moves WHERE company_id = $1 AND item_id = $2 AND kind <> 'recosted' ORDER BY moved_on, created_at",
    [companyId, itemId]
  );
  let units = 0n;
  let value = 0n;
  for (const m of rows) {
    const q = fromDb(m.quantity);
    if (q < 0n && (m.kind === "sold" || m.kind === "counted")) {
      if (-q > units) return null; // the dates do not replay cleanly; leave it as posted
      value -= costOut({ units, value, item: held.item }, -q);
    } else value += BigInt(m.value_laari);
    units += q;
  }
  const change = value - held.value;
  if (change === 0n) return null;
  const stockAcc = await account(client, companyId, ACCOUNTS.stock);
  const cogsAcc = await account(client, companyId, ACCOUNTS.cogs);
  const size = change < 0n ? -change : change;
  const memo = `${held.item.name} re-costed after ${why}`;
  const entry = await postEntry(client, {
    companyId, userId, date: new Date(), source: "adjustment", narrative: memo,
    lines: change < 0n
      ? [{ accountId: cogsAcc, debit: size, memo }, { accountId: stockAcc, credit: size, memo }]
      : [{ accountId: stockAcc, debit: size, memo }, { accountId: cogsAcc, credit: size, memo }],
  });
  await recordMove(client, { companyId, userId, itemId, on: new Date(), kind: "recosted", units: 0n, value: change, entryId: entry.id, note: memo });
  return { change, entry };
}

// ------------------------------------------------------------------ counts and opening

/**
 * A count: what is really there. The difference is taken out at average cost,
 * or put in at average cost (or the cost given, when there is none yet), and
 * the value goes to 5870 so shrinkage is seen, not buried.
 */
async function count(client, { companyId, userId, itemId, counted, on, unitCost, note, placeId }) {
  await assumeIdentity(client, { companyId, userId });
  const held = await holding(client, { companyId, itemId });
  if (placeId) await place(client, { companyId, placeId });
  // Counted at one place, against what the books say is there.
  const there = (await atPlaces(client, { companyId, itemId })).get(placeKey(placeId)) || 0n;
  const target = /^0*(\.0*)?$/.test(String(counted ?? "").trim()) && String(counted ?? "").trim() !== "" ? 0n : toUnits(counted);
  const diff = target - there;
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
  const memo = `Counted ${unitsText(target)} ${held.item.unit} ${held.item.name}; the books said ${unitsText(there)}`;
  const abs = value < 0n ? -value : value;
  const entry = await postEntry(client, {
    companyId, userId, date: on, source: "stock", narrative: memo,
    lines:
      value < 0n
        ? [{ accountId: countedAcc, debit: abs, memo }, { accountId: stockAcc, credit: abs, memo }]
        : [{ accountId: stockAcc, debit: abs, memo }, { accountId: countedAcc, credit: abs, memo }],
  });
  await recordMove(client, { companyId, userId, itemId, on, kind: "counted", units: diff, value, entryId: entry.id, note: note || null, placeId: placeId || null });
  return { entry, difference: unitsText(diff), value };
}

/** Stock a company already had before Sentryfi, at what it cost. */
async function opening(client, { companyId, userId, itemId, quantity, unitCost, on, placeId }) {
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
  await recordMove(client, { companyId, userId, itemId, on, kind: "opening", units, value, entryId: entry.id, placeId: placeId || null });
  return { entry, value };
}

// ------------------------------------------------------------------ places

async function place(client, { companyId, placeId }) {
  const { rows } = await client.query("SELECT id, name FROM stock_places WHERE id = $1 AND company_id = $2 AND archived_at IS NULL", [placeId, companyId]);
  if (!rows[0]) throw new Error("That place is not in these books.");
  return rows[0];
}

/** The places stock is kept, the main store first. */
async function places(client, { companyId }) {
  const { rows } = await client.query("SELECT id, name FROM stock_places WHERE company_id = $1 AND archived_at IS NULL ORDER BY lower(name)", [companyId]);
  return [{ id: null, name: "Main store" }, ...rows];
}

async function addPlace(client, { companyId, userId, name }) {
  const clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("Give the place a name, like the yard or a site store.");
  if (/^main( store)?$/i.test(clean)) throw new Error("The main store is already there.");
  const { rows: dup } = await client.query("SELECT 1 FROM stock_places WHERE company_id = $1 AND lower(name) = lower($2)", [companyId, clean]);
  if (dup.length) throw new Error(`There is already a place called ${clean}.`);
  const { rows } = await client.query("INSERT INTO stock_places (company_id, name, created_by) VALUES ($1,$2,$3) RETURNING id, name", [companyId, clean, userId]);
  return rows[0];
}

/** Stock taken from one place to another: where it is changes, what it is worth does not. */
async function transfer(client, { companyId, userId, itemId, fromPlaceId, toPlaceId, quantity, on, note }) {
  await assumeIdentity(client, { companyId, userId });
  if ((fromPlaceId || null) === (toPlaceId || null)) throw new Error("It is already there.");
  const held = await holding(client, { companyId, itemId });
  const from = fromPlaceId ? await place(client, { companyId, placeId: fromPlaceId }) : { name: "Main store" };
  const to = toPlaceId ? await place(client, { companyId, placeId: toPlaceId }) : { name: "Main store" };
  const units = toUnits(quantity);
  if (units <= 0n) throw new Error("How many are moving?");
  const there = (await atPlaces(client, { companyId, itemId })).get(placeKey(fromPlaceId)) || 0n;
  if (units > there) throw new Error(`Only ${unitsText(there)} ${held.item.unit} of ${held.item.name} ${there === SCALE ? "is" : "are"} at ${from.name}.`);
  await client.query(
    "INSERT INTO stock_transfers (company_id, item_id, from_place_id, to_place_id, quantity, moved_on, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [companyId, itemId, fromPlaceId || null, toPlaceId || null, unitsText(units), on, note ? String(note).trim() : null, userId]
  );
  return { moved: unitsText(units), from: from.name, to: to.name };
}

// ------------------------------------------------------------------ reading

/** Every item with what is on hand, its value, its average cost, and what its sales earned over their cost. */
async function list(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT i.id, i.name, i.code, i.unit, i.sale_price_laari, i.archived_at, i.reorder_at,
            COALESCE(SUM(m.quantity), 0) AS on_hand,
            COALESCE(SUM(m.value_laari), 0) AS value,
            COALESCE(SUM(m.sale_net_laari) FILTER (WHERE m.kind IN ('sold','returned')), 0) AS sales,
            COALESCE(-SUM(m.value_laari) FILTER (WHERE m.kind IN ('sold','returned','recosted')), 0) AS cost_of_sales,
            COALESCE(-SUM(m.quantity) FILTER (WHERE m.kind IN ('sold','returned')), 0) AS sold
       FROM stock_items i LEFT JOIN stock_moves m ON m.item_id = i.id AND m.company_id = i.company_id
      WHERE i.company_id = $1
      GROUP BY i.id ORDER BY lower(i.name)`,
    [companyId]
  );
  const kept = await places(client, { companyId });
  const byPlace = new Map();
  if (kept.length > 1) {
    const { rows: at } = await client.query(
      `SELECT item, place, SUM(q) AS q FROM (
         SELECT item_id AS item, place_id AS place, quantity AS q FROM stock_moves WHERE company_id = $1
         UNION ALL SELECT item_id, to_place_id, quantity FROM stock_transfers WHERE company_id = $1
         UNION ALL SELECT item_id, from_place_id, -quantity FROM stock_transfers WHERE company_id = $1
       ) x GROUP BY item, place`,
      [companyId]
    );
    for (const r of at) {
      if (!byPlace.has(r.item)) byPlace.set(r.item, new Map());
      byPlace.get(r.item).set(placeKey(r.place), fromDb(r.q));
    }
  }
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
      places: kept.length > 1 ? kept.map((p) => ({ id: p.id, name: p.name, onHand: unitsText(byPlace.get(r.id)?.get(placeKey(p.id)) || 0n) })).filter((p) => p.onHand !== "0") : null,
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
  const { rows: moved } = await client.query(
    `SELECT t.moved_on, t.quantity, t.note, COALESCE(f.name, 'Main store') AS from_name, COALESCE(p.name, 'Main store') AS to_name
       FROM stock_transfers t LEFT JOIN stock_places f ON f.id = t.from_place_id LEFT JOIN stock_places p ON p.id = t.to_place_id
      WHERE t.company_id = $1 AND t.item_id = $2`,
    [companyId, itemId]
  );
  const moves = moved.map((t) => ({
    on: t.moved_on, kind: "moved", quantity: unitsText(fromDb(t.quantity)), value: "0.00", saleNet: null,
    note: `From ${t.from_name} to ${t.to_name}${t.note ? `: ${t.note}` : ""}`, entryNo: null, document: null,
  }));
  return [...moves, ...rows.map((r) => ({
    on: r.moved_on,
    kind: r.kind,
    quantity: unitsText(fromDb(r.quantity)),
    value: formatLaari(BigInt(r.value_laari)),
    saleNet: r.sale_net_laari === null ? null : formatLaari(BigInt(r.sale_net_laari)),
    note: r.note,
    entryNo: String(r.entry_no),
    document: r.bill_no ? `Bill ${r.bill_no}` : r.invoice_no || null,
  }))].sort((a, b) => String(b.on) < String(a.on) ? -1 : String(b.on) > String(a.on) ? 1 : 0);
}

module.exports = { ACCOUNTS, account, toUnits, unitsText, fromDb, holding, costOut, setBillStock, undoBillStock, invoiceCost, returnable, returnCost, recost, count, opening, list, history, atPlaces, places, addPlace, transfer };
