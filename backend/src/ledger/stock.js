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
  used: ["5060", "Materials used on jobs", "expense"],
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
    "SELECT id, name, unit, archived_at, counted FROM stock_items WHERE id = $1 AND company_id = $2 FOR UPDATE",
    [itemId, companyId]
  );
  if (!rows.length) throw new Error("That item is not in these books.");
  const { rows: sum } = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(value_laari), 0) AS v FROM stock_moves WHERE company_id = $1 AND item_id = $2",
    [companyId, itemId]
  );
  return { item: rows[0], units: fromDb(sum[0].q), value: BigInt(sum[0].v) };
}

/** Counts, opening stock and moves are for counted products only. */
function mustCount(held) {
  if (!held.item.counted) throw new Error(`${held.item.name} is not counted, so there is no stock of it to count or move. Turn on counting for it first.`);
}

const MAIN = "main";
// Sent and not yet arrived: held by the company, at no place it can sell from.
const TRANSIT = "transit";
const placeKey = (id) => id || MAIN;

/**
 * Where each unit is: its movements at their place, what was moved out of a
 * place, and what was moved in once it arrived (on the way until then).
 * `only` narrows it to one item ($2).
 */
const WHERE = (only = "") => `
  SELECT m.item_id AS item, m.place_id::text AS place, m.quantity AS q FROM stock_moves m WHERE m.company_id = $1 ${only && "AND m.item_id = $2"}
  UNION ALL SELECT t.item_id, CASE WHEN t.arrives AND a.id IS NULL THEN '${TRANSIT}' ELSE t.to_place_id::text END, t.quantity
    FROM stock_transfers t LEFT JOIN stock_arrivals a ON a.transfer_id = t.id WHERE t.company_id = $1 ${only && "AND t.item_id = $2"}
  UNION ALL SELECT t.item_id, t.from_place_id::text, -t.quantity FROM stock_transfers t WHERE t.company_id = $1 ${only && "AND t.item_id = $2"}`;

/** How many of an item are at each place, keyed by place id: "main" for the main store, "transit" for on the way. */
async function atPlaces(client, { companyId, itemId }) {
  const { rows } = await client.query(`SELECT place, SUM(q) AS q FROM (${WHERE("item")}) x GROUP BY place`, [companyId, itemId]);
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
    "SELECT item_id, place_id, SUM(quantity) AS q, SUM(value_laari) AS v FROM stock_moves WHERE company_id = $1 AND bill_id = $2 GROUP BY item_id, place_id",
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
    await recordMove(client, { companyId, userId, itemId: r.item_id, on, kind: "undone", units: -units, value: -value, entryId, billId, note: "Bill reversed", placeId: r.place_id });
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
  let withItem = lines.filter((l) => l.item_id);
  if (!withItem.length) return { entryLines: [], record: async () => {} };
  // A bundle sells its parts: each leaves stock at its own cost, the bundle's
  // price shared over them by what they cost, so each part's margin reads true.
  const { rows: bundled } = await client.query(
    "SELECT p.bundle_id, p.item_id, p.quantity::text AS quantity FROM bundle_parts p WHERE p.company_id = $1 AND p.bundle_id = ANY($2::uuid[])",
    [companyId, [...new Set(withItem.map((l) => l.item_id))]]
  );
  if (bundled.length) {
    const out = [];
    for (const l of withItem) {
      const parts = bundled.filter((p) => p.bundle_id === l.item_id);
      if (!parts.length) {
        out.push(l);
        continue;
      }
      const sold = fromDb(l.quantity);
      const each = [];
      for (const p of parts) {
        const h = await holding(client, { companyId, itemId: p.item_id });
        const units = (fromDb(p.quantity) * sold) / SCALE;
        const avg = h.units > 0n ? (h.value * SCALE) / h.units : 0n;
        each.push({ p, units, weight: (avg * units) / SCALE });
      }
      const total = each.reduce((a, e) => a + e.weight, 0n);
      let netLeft = BigInt(l.net_laari);
      each.forEach((e, i) => {
        const share = i === each.length - 1 ? netLeft : total > 0n ? (BigInt(l.net_laari) * e.weight) / total : BigInt(l.net_laari) / BigInt(each.length);
        netLeft -= share;
        out.push({ ...l, item_id: e.p.item_id, quantity: unitsText(e.units), net_laari: share.toString() });
      });
    }
    withItem = out;
  }
  // A service or an uncounted product sells by name and price only.
  const { rows: counted } = await client.query(
    "SELECT id FROM stock_items WHERE company_id = $1 AND id = ANY($2::uuid[]) AND counted",
    [companyId, [...new Set(withItem.map((l) => l.item_id))]]
  );
  const countedIds = new Set(counted.map((r) => r.id));
  const sold = withItem.filter((l) => countedIds.has(l.item_id));
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
    const onWay = at.get(TRANSIT) || 0n;
    if (onWay > 0n && units > h.units + units - onWay) {
      throw new Error(`${unitsText(onWay)} ${h.item.unit} of ${h.item.name} ${onWay === SCALE ? "is" : "are"} still on the way. Say they arrived before selling them.`);
    }
    const order = [...at.entries()].filter(([p, q]) => q > 0n && p !== TRANSIT).sort(([a, qa], [b, qb]) => (a === MAIN ? -1 : b === MAIN ? 1 : qb > qa ? 1 : qb < qa ? -1 : 0));
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
    if (q < 0n && (m.kind === "sold" || m.kind === "counted" || m.kind === "issued")) {
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
  mustCount(held);
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
  mustCount(held);
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

const PLACE_KINDS = ["store", "godown", "outlet", "site", "factory", "vehicle"];

/** The places stock is kept, the main store first, with who looks after each. */
async function places(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT p.id, p.name, p.kind, p.in_charge, u.name AS in_charge_name, p.project_id, j.name AS project
       FROM stock_places p LEFT JOIN users u ON u.id = p.in_charge LEFT JOIN projects j ON j.id = p.project_id AND j.company_id = p.company_id
      WHERE p.company_id = $1 AND p.archived_at IS NULL ORDER BY lower(p.name)`,
    [companyId]
  );
  return [
    { id: null, name: "Main store", kind: "store" },
    ...rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, inChargeId: r.in_charge, inCharge: r.in_charge_name, projectId: r.project_id, project: r.project })),
  ];
}

/** A place's name, kind, person in charge and project, checked: the person must be in this company, the project this company's. */
async function placeFields(client, { companyId, placeId, name, kind, inChargeId, projectId }) {
  const clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("Give the place a name, like the yard or a site store.");
  if (/^main( store)?$/i.test(clean)) throw new Error("The main store is already there.");
  const { rows: dup } = await client.query("SELECT 1 FROM stock_places WHERE company_id = $1 AND lower(name) = lower($2) AND id IS DISTINCT FROM $3", [companyId, clean, placeId || null]);
  if (dup.length) throw new Error(`There is already a place called ${clean}.`);
  if (!PLACE_KINDS.includes(kind)) throw new Error("What kind of place is it?");
  if (inChargeId) {
    const { rows } = await client.query("SELECT 1 FROM memberships WHERE user_id = $1 AND company_id = $2", [inChargeId, companyId]);
    if (!rows.length) throw new Error("The person in charge must be someone in this company.");
  }
  if (projectId && kind !== "site") throw new Error("Only a site belongs to a project.");
  if (projectId) {
    const { rows } = await client.query("SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 AND archived_at IS NULL", [projectId, companyId]);
    if (!rows.length) throw new Error("That project is not in these books.");
  }
  return [clean, kind, inChargeId || null, projectId || null];
}

async function addPlace(client, { companyId, userId, name, kind = "store", inChargeId, projectId }) {
  const f = await placeFields(client, { companyId, name, kind, inChargeId, projectId });
  const { rows } = await client.query(
    "INSERT INTO stock_places (company_id, name, kind, in_charge, project_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, kind",
    [companyId, ...f, userId]
  );
  return rows[0];
}

async function updatePlace(client, { companyId, placeId, name, kind, inChargeId, projectId }) {
  await place(client, { companyId, placeId });
  const f = await placeFields(client, { companyId, placeId, name, kind, inChargeId, projectId });
  const { rows } = await client.query(
    "UPDATE stock_places SET name = $3, kind = $4, in_charge = $5, project_id = $6 WHERE id = $1 AND company_id = $2 RETURNING id, name, kind",
    [placeId, companyId, ...f]
  );
  return rows[0];
}

/**
 * Stock taken from one place to another: where it is changes, what it is worth
 * does not. It is on the way until a person says it arrived, unless it is
 * there already (`arrived`), like a move across the yard.
 */
async function transfer(client, { companyId, userId, itemId, fromPlaceId, toPlaceId, quantity, on, note, arrived = false }) {
  await assumeIdentity(client, { companyId, userId });
  if ((fromPlaceId || null) === (toPlaceId || null)) throw new Error("It is already there.");
  const held = await holding(client, { companyId, itemId });
  mustCount(held);
  const from = fromPlaceId ? await place(client, { companyId, placeId: fromPlaceId }) : { name: "Main store" };
  const to = toPlaceId ? await place(client, { companyId, placeId: toPlaceId }) : { name: "Main store" };
  const units = toUnits(quantity);
  if (units <= 0n) throw new Error("How many are moving?");
  const there = (await atPlaces(client, { companyId, itemId })).get(placeKey(fromPlaceId)) || 0n;
  if (units > there) throw new Error(`Only ${unitsText(there)} ${held.item.unit} of ${held.item.name} ${there === SCALE ? "is" : "are"} at ${from.name}.`);
  const { rows } = await client.query(
    "INSERT INTO stock_transfers (company_id, item_id, from_place_id, to_place_id, quantity, moved_on, note, created_by, arrives) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [companyId, itemId, fromPlaceId || null, toPlaceId || null, unitsText(units), on, note ? String(note).trim() : null, userId, !arrived]
  );
  return { id: rows[0].id, moved: unitsText(units), from: from.name, to: to.name, onTheWay: !arrived };
}

/** A quantity that may be nothing at all, as whole ten-thousandths. */
function toUnitsOrNone(q) {
  const s = String(q ?? "").trim();
  return /^0*(\.0*)?$/.test(s) && s !== "" ? 0n : toUnits(s);
}

/**
 * Goods sent that have come: all of them, or fewer with the reason. What came
 * short is written off at the place it was going to, at average cost, to 5870
 * like a count, so a loss on the way is seen and not buried. More than was sent
 * is refused: the extra is counted at the place instead.
 */
async function arrive(client, { companyId, userId, transferId, received, on, reason }) {
  await assumeIdentity(client, { companyId, userId });
  const sql = `SELECT t.id, t.item_id, t.to_place_id, t.quantity, t.moved_on::text AS sent_on, t.arrives, a.id AS arrived
                 FROM stock_transfers t LEFT JOIN stock_arrivals a ON a.transfer_id = t.id
                WHERE t.id = $1 AND t.company_id = $2`;
  const first = (await client.query(sql, [transferId, companyId])).rows[0];
  if (!first) throw new Error("That transfer is not in these books.");
  // A transfer is never changed, so the item is what is locked; read again under the lock so two people cannot both receive it.
  const held = await holding(client, { companyId, itemId: first.item_id });
  const t = (await client.query(sql, [transferId, companyId])).rows[0];
  if (!t.arrives || t.arrived) throw new Error("That has already arrived.");
  const to = t.to_place_id ? await place(client, { companyId, placeId: t.to_place_id }) : { name: "Main store" };
  const sent = fromDb(t.quantity);
  const got = toUnitsOrNone(received);
  const { unit, name } = held.item;
  if (got > sent) throw new Error(`${unitsText(sent)} ${unit} were sent. Count the extra at ${to.name} instead.`);
  if (String(on) < t.sent_on) throw new Error(`It was sent on ${t.sent_on}, so it cannot arrive before then.`);
  const short = sent - got;
  const why = reason ? String(reason).trim() : "";
  if (short > 0n && why.length < 3) throw new Error(`Say why ${unitsText(short)} ${unit} ${short === SCALE ? "is" : "are"} short.`);
  await client.query(
    "INSERT INTO stock_arrivals (company_id, transfer_id, received, arrived_on, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6)",
    [companyId, transferId, unitsText(got), on, why || null, userId]
  );
  if (short > 0n) {
    const value = costOut(held, short);
    // A move needs an entry, as a count does, so a shortfall worth nothing is counted at the place instead.
    if (value === 0n) throw new Error(`What came short is worth nothing at its cost, so count ${name} at ${to.name} instead.`);
    const memo = `${unitsText(short)} ${unit} ${name} short on arrival at ${to.name}: ${why}`;
    const entry = await postEntry(client, {
      companyId, userId, date: on, source: "stock", narrative: memo,
      lines: [{ accountId: await account(client, companyId, ACCOUNTS.counted), debit: value, memo }, { accountId: await account(client, companyId, ACCOUNTS.stock), credit: value, memo }],
    });
    await recordMove(client, { companyId, userId, itemId: t.item_id, on, kind: "counted", units: -short, value: -value, entryId: entry.id, note: `Short on arrival: ${why}`, placeId: t.to_place_id });
  }
  return { received: unitsText(got), short: unitsText(short), to: to.name };
}

/** What is on the way, oldest first, with where it is going and who looks after that place. */
async function onTheWay(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT t.id, t.item_id, i.name AS item, i.unit, t.quantity, t.moved_on::text AS sent_on, t.note,
            COALESCE(f.name, 'Main store') AS from_name, t.to_place_id, COALESCE(p.name, 'Main store') AS to_name,
            p.in_charge, s.name AS sent_by
       FROM stock_transfers t JOIN stock_items i ON i.id = t.item_id
       LEFT JOIN stock_arrivals a ON a.transfer_id = t.id
       LEFT JOIN stock_places f ON f.id = t.from_place_id LEFT JOIN stock_places p ON p.id = t.to_place_id
       LEFT JOIN users s ON s.id = t.created_by
      WHERE t.company_id = $1 AND t.arrives AND a.id IS NULL
      ORDER BY t.moved_on, t.created_at`,
    [companyId]
  );
  return rows.map((r) => ({
    id: r.id, itemId: r.item_id, item: r.item, unit: r.unit, quantity: unitsText(fromDb(r.quantity)), sentOn: r.sent_on, note: r.note,
    from: r.from_name, toPlaceId: r.to_place_id, to: r.to_name, inChargeId: r.in_charge, sentBy: r.sent_by,
  }));
}

/**
 * Stock used on a job: it leaves a place at average cost, and that cost goes
 * to the item's own kind of cost (or materials used) on the project or
 * department it was used on, so the job carries what it used.
 */
async function issue(client, { companyId, userId, itemId, placeId, quantity, on, projectId, dimensionIds = [], note }) {
  await assumeIdentity(client, { companyId, userId });
  const held = await holding(client, { companyId, itemId });
  mustCount(held);
  const from = placeId ? await place(client, { companyId, placeId }) : { name: "Main store" };
  const ids = [...new Set((dimensionIds || []).filter(Boolean))];
  if (!projectId && !ids.length) throw new Error("Say which project or department it was used on.");
  let project = null;
  if (projectId) {
    const { rows } = await client.query("SELECT name FROM projects WHERE id = $1 AND company_id = $2 AND archived_at IS NULL", [projectId, companyId]);
    if (!rows.length) throw new Error("That project is not in these books.");
    project = rows[0].name;
  }
  const { rows: dims } = ids.length
    ? await client.query("SELECT name FROM dimensions WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL", [companyId, ids])
    : { rows: [] };
  if (dims.length !== ids.length) throw new Error("That department is not in these books.");
  const units = toUnits(quantity);
  const there = (await atPlaces(client, { companyId, itemId })).get(placeKey(placeId)) || 0n;
  if (units > there) throw new Error(`Only ${unitsText(there)} ${held.item.unit} of ${held.item.name} ${there === SCALE ? "is" : "are"} at ${from.name}.`);
  const value = costOut(held, units);
  if (value === 0n) throw new Error(`${held.item.name} has no cost yet, so there is nothing to carry to the job. Record the bill that brought it in first.`);
  const { rows: own } = await client.query("SELECT cost_account_id FROM stock_items WHERE id = $1", [itemId]);
  const costAcc = own[0].cost_account_id || (await account(client, companyId, ACCOUNTS.used));
  const on_ = [project, ...dims.map((d) => d.name)].filter(Boolean).join(", ");
  const memo = `${unitsText(units)} ${held.item.unit} ${held.item.name} used on ${on_}`;
  const entry = await postEntry(client, {
    companyId, userId, date: on, source: "stock", narrative: memo,
    lines: [
      { accountId: costAcc, debit: value, projectId: projectId || null, dimensionIds: ids, memo },
      { accountId: await account(client, companyId, ACCOUNTS.stock), credit: value, memo },
    ],
  });
  await recordMove(client, { companyId, userId, itemId, on, kind: "issued", units: -units, value: -value, entryId: entry.id, note: note ? `Used on ${on_}: ${String(note).trim()}` : `Used on ${on_}`, placeId: placeId || null });
  return { entry, value, usedOn: on_ };
}

// ------------------------------------------------------------------ reading

/** Every item: what kind it is, how it is bought and sold, and for a counted product what is on hand, its value, its average cost, and what its sales earned over their cost. */
async function list(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT i.id, i.name, i.code, i.unit, i.sale_price_laari, i.archived_at, i.reorder_at,
            i.kind, i.counted, i.sells, i.buys, i.buy_price_laari, i.income_account_id, i.cost_account_id, i.photo, i.tax, i.tax_by, i.tax_why,
            (SELECT json_agg(json_build_object('itemId', p.item_id, 'quantity', trim(to_char(p.quantity, 'FM999999990.####'), '.'))) FROM bundle_parts p WHERE p.bundle_id = i.id) AS parts,
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
    const { rows: at } = await client.query(`SELECT item, place, SUM(q) AS q FROM (${WHERE()}) x GROUP BY item, place`, [companyId]);
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
      kind: r.kind,
      photo: r.photo || null,
      tax: r.tax,
      taxBy: r.tax_by,
      taxWhy: r.tax_why,
      parts: r.parts || [],
      counted: r.counted,
      sells: r.sells,
      buys: r.buys,
      incomeAccountId: r.income_account_id,
      costAccountId: r.cost_account_id,
      buyPrice: r.buy_price_laari === null ? null : formatLaari(BigInt(r.buy_price_laari)),
      salePrice: r.sale_price_laari === null ? null : formatLaari(BigInt(r.sale_price_laari)),
      archived: Boolean(r.archived_at),
      onHand: unitsText(units),
      reorderAt: r.reorder_at === null ? null : unitsText(fromDb(r.reorder_at)),
      low: r.counted && r.reorder_at !== null && !r.archived_at && units <= fromDb(r.reorder_at),
      value: formatLaari(value),
      averageCost: units > 0n ? formatLaari((value * SCALE + units / 2n) / units) : null,
      sold: unitsText(fromDb(r.sold)),
      sales: formatLaari(sales),
      costOfSales: formatLaari(cost),
      margin: formatLaari(sales - cost),
      marginPercent: sales > 0n ? Number(((sales - cost) * 1000n) / sales) / 10 : null,
      places: kept.length > 1 ? kept.map((p) => ({ id: p.id, name: p.name, onHand: unitsText(byPlace.get(r.id)?.get(placeKey(p.id)) || 0n) })).filter((p) => p.onHand !== "0") : null,
      inTransit: unitsText(byPlace.get(r.id)?.get(TRANSIT) || 0n),
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
    `SELECT t.moved_on, t.quantity, t.note, t.arrives, a.id AS arrival, a.arrived_on::text AS arrived_on, a.received,
            COALESCE(f.name, 'Main store') AS from_name, COALESCE(p.name, 'Main store') AS to_name
       FROM stock_transfers t LEFT JOIN stock_places f ON f.id = t.from_place_id LEFT JOIN stock_places p ON p.id = t.to_place_id
       LEFT JOIN stock_arrivals a ON a.transfer_id = t.id
      WHERE t.company_id = $1 AND t.item_id = $2`,
    [companyId, itemId]
  );
  const moves = moved.map((t) => {
    const sent = fromDb(t.quantity);
    const where = !t.arrives ? "" : !t.arrival ? ", on the way" : fromDb(t.received) === sent ? `, arrived ${t.arrived_on}` : `, ${unitsText(fromDb(t.received))} arrived ${t.arrived_on}`;
    return {
      on: t.moved_on, kind: "moved", quantity: unitsText(sent), value: "0.00", saleNet: null,
      note: `From ${t.from_name} to ${t.to_name}${where}${t.note ? `: ${t.note}` : ""}`, entryNo: null, document: null,
    };
  });
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

/**
 * The units this company writes, most used first: every unit put on an item,
 * an invoice line or an order line is kept this way and offered next time.
 */
async function units(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT u FROM (
       SELECT unit AS u FROM stock_items WHERE company_id = $1
       UNION ALL SELECT uom FROM sales_invoice_lines WHERE company_id = $1
       UNION ALL SELECT unit FROM order_lines WHERE company_id = $1
     ) x WHERE btrim(coalesce(u, '')) <> '' GROUP BY u ORDER BY count(*) DESC, u LIMIT 60`,
    [companyId]
  );
  return rows.map((r) => r.u);
}

/**
 * An item's GST class, worked out by the model when nobody has said. `ask` is
 * the model: given the item and the company's tax pack it answers
 * { tax: 'standard' | 'zero_rated' | 'exempt' | 'unknown', why, confidence }.
 * A person's answer is never overwritten, and a guess is kept only when the
 * model is sure of it; anything else leaves the question for a person.
 */
// ponytail: the model is asked inside the request's transaction; move it out if calls get slow enough to hold connections.
async function guessTax(client, { companyId, itemId, ask }) {
  const { rows } = await client.query(
    "SELECT i.name, i.code, i.unit, i.kind, i.tax, i.tax_by, i.tax_why, c.tax_pack FROM stock_items i JOIN companies c ON c.id = i.company_id WHERE i.id = $1 AND i.company_id = $2",
    [itemId, companyId]
  );
  const it = rows[0];
  if (!it) return null;
  const now = { tax: it.tax, taxBy: it.tax_by, taxWhy: it.tax_why };
  if (it.tax_by === "you" || !ask) return now;
  const a = await ask({ name: it.name, code: it.code, unit: it.unit, kind: it.kind, pack: it.tax_pack || "MV" });
  if (!["standard", "zero_rated", "exempt"].includes(a?.tax) || a.confidence === "low") return { ...now, confidence: a?.confidence || "low" };
  const why = String(a.why || "").slice(0, 300) || null;
  await client.query("UPDATE stock_items SET tax = $3, tax_by = 'ai', tax_why = $4 WHERE id = $1 AND company_id = $2 AND tax_by IS DISTINCT FROM 'you'", [itemId, companyId, a.tax, why]);
  return { tax: a.tax, taxBy: "ai", taxWhy: why, confidence: a.confidence };
}

module.exports = { guessTax, ACCOUNTS, account, toUnits, unitsText, fromDb, holding, costOut, setBillStock, undoBillStock, invoiceCost, returnable, returnCost, recost, count, opening, list, history, atPlaces, places, addPlace, updatePlace, PLACE_KINDS, transfer, arrive, onTheWay, issue, units, place };
