/**
 * The adviser: for each charge on a bill, is it stock, a cost, or something
 * the business will use for years? It answers from, in order:
 *
 *   1. what a person said the last time this supplier charged for this
 *   2. what was said about this charge from any supplier
 *   3. an item in stock whose name the charge carries
 *   4. the words on the charge (fuel, freight, labour, a generator...)
 *
 * Only the first is sure enough to go in without asking; everything else is
 * put to a person, who is told why it was suggested. What they decide is
 * remembered, so the question is asked once, not every month.
 */
const { CATEGORIES } = require("./assets");

/**
 * A charge's description reduced to the words that say what it is. Plain
 * numbers go (quantities, dates, reference numbers); a size stays, because
 * 10mm bar and 16mm bar are different things.
 */
function keyOf(description) {
  return String(description || "")
    .toLowerCase()
    .replace(/[^a-z0-9ހ-޿\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !STOP.has(w))
    .slice(0, 8)
    .join(" ");
}
// Units, filler, and months: "cleaning, June" and "cleaning, July" are the same charge.
const MONTHS = ["jan","january","feb","february","mar","march","apr","april","may","jun","june","jul","july","aug","august","sep","sept","september","oct","october","nov","november","dec","december"];
const STOP = new Set([...MONTHS, "kg", "pcs", "pc", "nos", "no", "ltr", "ltrs", "the", "and", "for", "of", "with", "per", "each", "qty", "unit", "units", "mvr", "usd", "rf", "x"]);

// Words that say what a charge is, and the starting chart's account for it.
const COST_WORDS = [
  [/\b(diesel|petrol|fuel|lubricant|oil|engine oil|hydraulic)\b/, "5400", "fuel"],
  [/\b(freight|shipping|transport|delivery|dhoni|boat hire|cargo|trucking|lorry|landing)\b/, "5500", "freight or delivery"],
  [/\b(labour|labor|wages|manpower|workers?|overtime)\b/, "5200", "labour"],
  [/\b(subcontract\w*|installation|contract work)\b/, "5300", "work done by others"],
  [/\b(rent|electricity|water|internet|phone|stationery|cleaning|security|repairs?|maintenance|service charge)\b/, "5600", "a running cost"],
  [/\b(cement|sand|aggregate|steel|rebar|blocks?|timber|plywood|paint|tiles?|pipes?|cable|wire|nails|screws)\b/, "5100", "materials"],
];
const ASSET_WORDS = [
  [/\b(generator|excavator|compressor|mixer|welding machine|machine|pump|crane|scaffold\w*|forklift)\b/, "equipment"],
  [/\b(boat|dhoni|launch|speedboat|outboard|engine|vehicle|truck|lorry|pickup|car|motorcycle|scooter)\b/, "vehicles"],
  [/\b(laptop|computer|printer|desk|chair|furniture|air ?con\w*|aircon|fridge|tv)\b/, "furniture"],
];
// Something that lasts is usually worth putting on the register only above
// this; below it, it is simply a cost of the month.
const ASSET_FLOOR = 1500000n; // MVR 15,000.00

// Words that say a charge was part of landing goods from abroad.
const LANDING_WORDS = /\b(customs|clearance|clearing|port|duty|form set|freight|shipping|demurrage|delivery order|handling|container|wharf|cnf|transport)\b/;

async function advise(client, { companyId, counterpartyId, lines, shipmentId }) {
  // Which shipment a landing cost belongs to: the bill's own, or the only one
  // open. With several open and none named, it has to be asked.
  const { rows: openShipments } = await client.query("SELECT id, reference FROM shipments WHERE company_id = $1 AND closed_at IS NULL ORDER BY created_at DESC", [companyId]);
  const knownShipment = shipmentId || (openShipments.length === 1 ? openShipments[0].id : null);
  const likelyShipment = knownShipment || openShipments[0]?.id || null;
  const shipmentRef = (id) => openShipments.find((x) => x.id === id)?.reference || "the shipment";

  const { rows: items } = await client.query(
    "SELECT id, name, unit, counted, cost_account_id FROM stock_items WHERE company_id = $1 AND archived_at IS NULL AND buys",
    [companyId]
  );
  const { rows: accounts } = await client.query("SELECT id, code, name FROM accounts WHERE company_id = $1 AND type = 'expense'", [companyId]);
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
  const general = byCode["5100"] || accounts[0];

  const out = [];
  for (const line of lines) {
    const key = keyOf(line.description);
    const quantity = line.quantity ? String(line.quantity) : "";
    const amount = BigInt(line.amountLaari ?? 0);
    const base = { description: line.description || "", quantity, amountLaari: amount };

    // 1 and 2: what a person said before.
    const { rows: rules } = await client.query(
      `SELECT r.*, (r.counterparty_id = $3::uuid) IS TRUE AS same_supplier, c.name AS supplier
         FROM charge_rules r JOIN counterparties c ON c.id = r.counterparty_id
        WHERE r.company_id = $1 AND r.match_key = $2
        ORDER BY (r.counterparty_id = $3::uuid) IS TRUE DESC, r.times DESC, r.last_used_at DESC LIMIT 1`,
      [companyId, key, counterpartyId || null]
    );
    const rule = rules[0];
    if (rule && rule.kind === "landed" && likelyShipment) {
      out.push({
        ...base, kind: "landed", shipmentId: likelyShipment,
        sure: Boolean(rule.same_supplier) && Boolean(knownShipment),
        because: `You said ${rule.supplier}'s ${rule.times === 1 ? "charge" : "charges"} for this went on landing a shipment; this one is put on ${shipmentRef(likelyShipment)}.`,
      });
      continue;
    }
    if (rule && rule.kind !== "landed" && (rule.kind !== "stock" || rule.item_id)) {
      const needsCount = rule.kind === "stock" && !quantity;
      out.push({
        ...base,
        kind: rule.kind,
        itemId: rule.item_id,
        accountId: rule.account_id,
        category: rule.asset_category,
        lifeYears: rule.asset_life_years === null ? null : Number(rule.asset_life_years),
        sure: Boolean(rule.same_supplier) && !needsCount,
        because: rule.same_supplier
          ? `You said so ${rule.times === 1 ? "last time" : `the last ${rule.times} times`} ${rule.supplier} charged for this.${needsCount ? " How many this time?" : ""}`
          : `You said so when ${rule.supplier} charged for this.`,
      });
      continue;
    }

    // 3: an item bought before whose name the charge carries: stock when it is
    // counted, otherwise a cost on the item's own kind of cost.
    const words = new Set(key.split(" "));
    const item = items.find((i) => {
      const k = keyOf(i.name).split(" ").filter((w) => w.length > 2);
      return k.length && k.every((w) => words.has(w));
    });
    if (item && item.counted) {
      out.push({ ...base, kind: "stock", itemId: item.id, sure: false, because: `It reads like ${item.name}, which you keep in stock.` });
      continue;
    }
    if (item && item.cost_account_id) {
      const acc = accounts.find((a) => a.id === item.cost_account_id);
      out.push({ ...base, kind: "cost", accountId: item.cost_account_id, sure: false, because: `It reads like ${item.name}, which goes to ${acc ? acc.name : "its own kind of cost"}.` });
      continue;
    }

    // 4: the words on it.
    const text = ` ${key} `;
    if (likelyShipment && LANDING_WORDS.test(text)) {
      out.push({ ...base, kind: "landed", shipmentId: likelyShipment, sure: false, because: `It reads like a cost of landing goods, so it goes into what ${shipmentRef(likelyShipment)} cost.` });
      continue;
    }
    const asset = ASSET_WORDS.find(([re]) => re.test(text));
    if (asset && amount >= ASSET_FLOOR) {
      const cat = CATEGORIES[asset[1]];
      out.push({
        ...base, kind: "asset", category: asset[1], lifeYears: cat.years, sure: false,
        because: `At this price it is usually used for years, so it goes on the register (${cat.name.toLowerCase()}) and its cost is spread over them.`,
      });
      continue;
    }
    const cost = COST_WORDS.find(([re]) => re.test(text));
    const account = (cost && byCode[cost[1]]) || general;
    out.push({
      ...base, kind: "cost", accountId: account?.id || null, sure: false,
      because: cost ? `It reads like ${cost[2]}.` : "Nothing like it has been decided before.",
    });
  }
  return out;
}

/** Remembers what a person decided for each charge on a bill from this supplier. */
async function learn(client, { companyId, counterpartyId, decisions }) {
  if (!counterpartyId) return;
  for (const d of decisions) {
    const key = keyOf(d.description);
    await client.query(
      `INSERT INTO charge_rules (company_id, counterparty_id, match_key, kind, item_id, account_id, asset_category, asset_life_years)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (company_id, counterparty_id, match_key) DO UPDATE SET
         times = CASE WHEN charge_rules.kind = EXCLUDED.kind
                       AND charge_rules.item_id IS NOT DISTINCT FROM EXCLUDED.item_id
                       AND charge_rules.account_id IS NOT DISTINCT FROM EXCLUDED.account_id
                       AND charge_rules.asset_category IS NOT DISTINCT FROM EXCLUDED.asset_category
                      THEN charge_rules.times + 1 ELSE 1 END,
         kind = EXCLUDED.kind, item_id = EXCLUDED.item_id, account_id = EXCLUDED.account_id,
         asset_category = EXCLUDED.asset_category, asset_life_years = EXCLUDED.asset_life_years, last_used_at = now()`,
      [companyId, counterpartyId, key, d.kind, d.itemId || null, d.accountId || null, d.category || null, d.lifeYears ?? null]
    );
  }
}

/**
 * The lines to advise on for a bill: those read off the paper, scaled so they
 * add up to the bill's net as printed (a bill that includes GST, or has a
 * discount, still splits exactly), or else the whole bill as one line.
 */
function linesFor(bill, printedNet) {
  const read = Array.isArray(bill.read_lines) ? bill.read_lines.filter((l) => Number(l.amount) > 0) : [];
  if (!read.length) return [{ description: "", quantity: "", amountLaari: printedNet }];
  const cents = read.map((l) => BigInt(Math.round(Number(l.amount) * 100)));
  const total = cents.reduce((a, b) => a + b, 0n);
  let left = printedNet;
  return read.map((l, i) => {
    const amountLaari = i === read.length - 1 ? left : (printedNet * cents[i] + total / 2n) / total;
    left -= amountLaari;
    return { description: String(l.description || "").slice(0, 300), quantity: l.quantity ? String(l.quantity) : "", amountLaari };
  });
}

/**
 * A bill nobody has said anything about goes in on the adviser's word when it
 * is sure of every line: this supplier, these charges, decided before. When
 * it is unsure of any, nothing is applied and the bill goes in as it always
 * has, as one general cost, for a person to split later if it matters.
 */
async function applyIfSure(client, { companyId, userId, billId }) {
  const billSplit = require("./billSplit");
  const { formatLaari } = require("./money");
  const { rows } = await client.query("SELECT * FROM bills WHERE id = $1 AND company_id = $2", [billId, companyId]);
  const bill = rows[0];
  if (!bill || bill.status === "posted" || !bill.counterparty_id || bill.gst_treatment === "unknown") return false;
  const { parts } = await billSplit.load(client, { companyId, bill });
  if (parts.length) return false;
  const advice = await advise(client, { companyId, counterpartyId: bill.counterparty_id, shipmentId: bill.shipment_id, lines: linesFor(bill, billSplit.printedNetOf(bill)) });
  if (!advice.length || !advice.every((a) => a.sure)) return false;
  const lines = advice.map((a) => ({ ...a, amount: formatLaari(a.amountLaari).replace(/,/g, "") }));
  await billSplit.save(client, { companyId, userId, billId, lines });
  await learn(client, { companyId, counterpartyId: bill.counterparty_id, decisions: lines });
  return true;
}

module.exports = { keyOf, advise, learn, linesFor, applyIfSure, ASSET_FLOOR };
