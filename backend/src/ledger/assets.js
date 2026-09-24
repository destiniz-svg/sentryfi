const crypto = require("crypto");
const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { lockedThrough } = require("./periods");
const { rateOn } = require("./tax");

/**
 * Fixed assets: the register, depreciation, and selling or scrapping one.
 *
 * An asset's value is its cost less what has worn off it, and both are journal
 * lines: the cost on the category's asset account, the wear on that
 * category's "worn to date" account beside it. Nothing here stores a balance.
 *
 * Depreciation is charged a month at a time, from the month the asset was
 * bought (a whole month, the usual simple convention). Each month's charge is
 * worked out as where the asset should be by then less what has already been
 * charged, so a month that could not be charged (the books were closed) is
 * caught up in the next open month, and the last month lands exactly on the
 * residual value with no rounding left over.
 */

// Where each kind of asset sits. The worn account is a contra asset: it holds
// a credit balance that reduces the asset on the balance sheet.
const CATEGORIES = {
  equipment: { code: "1510", name: "Equipment and machinery", worn: "1515", years: 5 },
  vehicles: { code: "1520", name: "Vehicles and boats", worn: "1525", years: 5 },
  furniture: { code: "1530", name: "Furniture and computers", worn: "1535", years: 3 },
  buildings: { code: "1540", name: "Buildings and fit-out", worn: "1545", years: 20 },
};
const DEPRECIATION = ["5800", "Depreciation", "expense"];
const GAIN = ["4900", "Gain on selling assets", "income"];
const LOSS = ["5810", "Loss on selling assets", "expense"];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

async function ensureAccount(client, { companyId, code, name, type }) {
  // DO NOTHING, not DO UPDATE: the app may add to a chart, never rewrite it.
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4::account_t)
     ON CONFLICT (company_id, code) DO NOTHING`,
    [companyId, code, name, type]
  );
  const { rows } = await client.query("SELECT id, code, name FROM accounts WHERE company_id = $1 AND code = $2", [companyId, code]);
  return rows[0];
}

async function categoryAccounts(client, { companyId, category }) {
  const c = CATEGORIES[category];
  if (!c) throw new Error("What kind of asset is it?");
  const asset = await ensureAccount(client, { companyId, code: c.code, name: c.name, type: "asset" });
  const worn = await ensureAccount(client, { companyId, code: c.worn, name: `${c.name}: worn to date`, type: "asset" });
  return { asset, worn };
}

/** "2026-03-15" → "2026-03-31" */
function monthEnd(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The month ends from `from` through `to`, inclusive. */
function monthEnds(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const stop = monthEnd(to);
  for (;;) {
    const d = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (d > stop) break;
    out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * How much should have worn off an asset after k months in use. Laari, BigInt.
 * Pure: the whole method is here and tested on its own.
 */
function wornAfter(asset, k) {
  const cost = BigInt(asset.cost_laari);
  const residual = BigInt(asset.residual_laari || 0);
  const depreciable = cost - residual;
  if (k <= 0) return 0n;
  if (asset.method === "reducing_balance") {
    // The year's rate on what was left at the start of each year in use,
    // spread evenly over its twelve months: 25% a year writes off 25% of the
    // opening value in the first year, not 22.4% as a monthly twelfth would.
    const bp = BigInt(asset.rate_bp);
    let nbv = cost;
    const years = Math.floor(k / 12);
    for (let y = 0; y < years; y++) {
      nbv -= (nbv * bp) / 10000n;
      if (nbv <= residual) return depreciable;
    }
    const part = (nbv * bp * BigInt(k % 12)) / 120000n;
    const worn = cost - nbv + part;
    return worn >= depreciable ? depreciable : worn;
  }
  const life = BigInt(asset.life_months);
  const kk = BigInt(k);
  return kk >= life ? depreciable : (depreciable * kk) / life;
}

/** Months in use by the end of `month`, counting the month it was bought. */
function monthsInUse(acquiredOn, month) {
  const [ay, am] = acquiredOn.split("-").map(Number);
  const [y, m] = month.split("-").map(Number);
  return (y - ay) * 12 + (m - am) + 1;
}

async function register(client, { companyId, userId, name, category, cost, residual, acquiredOn, lifeYears, method, ratePct, fromAccountId }) {
  const clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("What is the asset? Give it a name you would recognise.");
  if (!isoDate.test(String(acquiredOn || ""))) throw new Error("When was it bought?");
  const costL = toLaari(cost);
  if (costL <= 0n) throw new Error("What did it cost?");
  const residualL = residual ? toLaari(residual) : 0n;
  if (residualL >= costL) throw new Error("What it will be worth at the end has to be less than what it cost.");
  const m = method === "reducing_balance" ? "reducing_balance" : "straight_line";
  const years = Number(lifeYears || CATEGORIES[category]?.years);
  if (!(years > 0 && years <= 100)) throw new Error("How many years will it be used for?");
  const rateBp = m === "reducing_balance" ? Math.round(Number(ratePct) * 100) : null;
  if (m === "reducing_balance" && !(rateBp > 0 && rateBp <= 10000)) throw new Error("What share of its value wears off each year?");
  if (!fromAccountId) throw new Error("How was it paid for?");

  const { asset, worn } = await categoryAccounts(client, { companyId, category });
  const { rows: from } = await client.query("SELECT id, code, name, type::text AS type FROM accounts WHERE company_id = $1 AND id = $2", [companyId, fromAccountId]);
  if (!from[0]) throw new Error("That account is not in these books.");
  if (from[0].id === asset.id) throw new Error("It cannot be paid for from its own asset account.");

  const id = crypto.randomUUID();
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: acquiredOn,
    source: "asset",
    sourceId: id,
    narrative: `Asset: ${clean}`,
    lines: [
      { accountId: asset.id, debit: costL, memo: clean },
      { accountId: from[0].id, credit: costL, memo: clean },
    ],
  });
  await client.query(
    `INSERT INTO fixed_assets (id, company_id, name, category, asset_account_id, worn_account_id, cost_laari, residual_laari,
                               acquired_on, life_months, method, rate_bp, entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, companyId, clean, category, asset.id, worn.id, costL.toString(), residualL.toString(), acquiredOn, Math.round(years * 12), m, rateBp, entry.id, userId]
  );
  return { id, entryNo: entry.entryNo, paidFrom: from[0].name };
}

/**
 * Charge depreciation for every asset in use through the end of a month.
 * Months already charged are skipped; months inside closed books are left for
 * the first open month to catch up.
 */
async function depreciate(client, { companyId, userId, through, dryRun = false }) {
  if (!isoDate.test(String(through || ""))) throw new Error("Through which month?");
  const last = monthEnd(through);
  const locked = await lockedThrough(client, { companyId });

  const { rows: assets } = await client.query(
    `SELECT a.*, a.acquired_on::text AS acquired_on, a.disposed_on::text AS disposed_on,
            COALESCE((SELECT SUM(amount_laari) FROM asset_depreciation d WHERE d.asset_id = a.id), 0)::text AS charged,
            (SELECT max(month)::text FROM asset_depreciation d WHERE d.asset_id = a.id) AS charged_through
       FROM fixed_assets a WHERE a.company_id = $1 ORDER BY a.acquired_on, a.name`,
    [companyId]
  );

  const byMonth = new Map();
  for (const a of assets) {
    let charged = BigInt(a.charged);
    const start = a.charged_through && a.charged_through >= a.acquired_on ? nextMonth(a.charged_through) : a.acquired_on;
    // A sold asset is charged up to the month before it went.
    const stop = a.disposed_on ? prevMonthEnd(a.disposed_on) : last;
    const end = stop < last ? stop : last;
    if (start > end) continue;
    for (const month of monthEnds(start, end)) {
      if (locked && month <= locked) continue;
      const due = wornAfter(a, monthsInUse(a.acquired_on, month)) - charged;
      if (due <= 0n) continue;
      charged += due;
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push({ asset: a, amount: due });
    }
  }

  if (dryRun) {
    const pending = [...byMonth.keys()].sort().map((month) => ({ month, total: byMonth.get(month).reduce((s, i) => s + i.amount, 0n) }));
    return { pending, total: pending.reduce((s, p) => s + p.total, 0n) };
  }

  const dep = await ensureAccount(client, { companyId, code: DEPRECIATION[0], name: DEPRECIATION[1], type: DEPRECIATION[2] });
  const posted = [];
  for (const month of [...byMonth.keys()].sort()) {
    const items = byMonth.get(month);
    const lines = [];
    for (const { asset, amount } of items) {
      lines.push({ accountId: dep.id, debit: amount, memo: asset.name });
      lines.push({ accountId: asset.worn_account_id, credit: amount, memo: asset.name });
    }
    const entry = await postEntry(client, {
      companyId,
      userId,
      date: month,
      source: "depreciation",
      narrative: `Depreciation for ${new Date(month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`,
      lines,
    });
    for (const { asset, amount } of items) {
      await client.query(
        "INSERT INTO asset_depreciation (company_id, asset_id, month, amount_laari, entry_id) VALUES ($1,$2,$3,$4,$5)",
        [companyId, asset.id, month, amount.toString(), entry.id]
      );
    }
    posted.push({ month, entryNo: entry.entryNo, total: items.reduce((s, i) => s + i.amount, 0n) });
  }
  return { posted, total: posted.reduce((s, p) => s + p.total, 0n) };
}

function nextMonth(monthEndIso) {
  const [y, m] = monthEndIso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}
function prevMonthEnd(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

/**
 * Selling or scrapping one. It is charged through the month before, then its
 * cost and what wore off come out of the books, what it fetched goes where the
 * money went, and the difference is a gain or a loss, said as one.
 */
async function dispose(client, { companyId, userId, assetId, on, proceeds, toAccountId }) {
  if (!isoDate.test(String(on || ""))) throw new Error("When did it go?");
  const { rows } = await client.query("SELECT *, acquired_on::text AS acquired_on FROM fixed_assets WHERE company_id = $1 AND id = $2", [companyId, assetId]);
  const a = rows[0];
  if (!a) throw new Error("That asset is not in these books.");
  if (a.disposed_on) throw new Error("It has already been sold or scrapped.");
  if (on < a.acquired_on) throw new Error("It cannot go before it was bought.");
  const got = proceeds ? toLaari(proceeds) : 0n;
  if (got > 0n && !toAccountId) throw new Error("Where did the money go?");

  await depreciate(client, { companyId, userId, through: prevMonthEnd(on) });
  // Everything charged, and what was charged for months before it went. Months
  // already charged after it went (depreciation run ahead) come back off.
  const { rows: w } = await client.query(
    "SELECT COALESCE(SUM(amount_laari),0)::text AS worn, COALESCE(SUM(amount_laari) FILTER (WHERE month <= $2::date),0)::text AS before FROM asset_depreciation WHERE asset_id = $1",
    [assetId, prevMonthEnd(on)]
  );
  const cost = BigInt(a.cost_laari);
  const worn = BigInt(w[0].worn);
  const wornBefore = BigInt(w[0].before);
  const ahead = worn - wornBefore;

  // A registered company charges GST on what it sells, used equipment too:
  // what it fetched is taken as the money received, GST included.
  const { rows: co } = await client.query("SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
  let gst = 0n;
  if (got > 0n && co[0]?.gst_registered) {
    const { bp } = await rateOn(client, { companyId, on });
    gst = (got * BigInt(bp) + BigInt(10000 + bp) / 2n) / BigInt(10000 + bp);
  }
  const left = cost - wornBefore;
  const gain = got - gst - left;

  const lines = [{ accountId: a.asset_account_id, credit: cost, memo: a.name }];
  if (worn > 0n) lines.push({ accountId: a.worn_account_id, debit: worn, memo: a.name });
  if (ahead > 0n) {
    const dep = await ensureAccount(client, { companyId, code: DEPRECIATION[0], name: DEPRECIATION[1], type: DEPRECIATION[2] });
    lines.push({ accountId: dep.id, credit: ahead, memo: `${a.name}: charged for after it went, taken back` });
  }
  if (got > 0n) lines.push({ accountId: toAccountId, debit: got, memo: a.name });
  if (gst > 0n) {
    const out = await ensureAccount(client, { companyId, code: "2200", name: "GST we owe", type: "liability" });
    lines.push({ accountId: out.id, credit: gst, memo: `GST on selling ${a.name}` });
  }
  if (gain > 0n) {
    const g = await ensureAccount(client, { companyId, code: GAIN[0], name: GAIN[1], type: GAIN[2] });
    lines.push({ accountId: g.id, credit: gain, memo: a.name });
  } else if (gain < 0n) {
    const l = await ensureAccount(client, { companyId, code: LOSS[0], name: LOSS[1], type: LOSS[2] });
    lines.push({ accountId: l.id, debit: -gain, memo: a.name });
  }
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: on,
    source: "asset_disposal",
    sourceId: assetId,
    narrative: got > 0n ? `Sold: ${a.name}` : `Scrapped: ${a.name}`,
    lines,
  });
  await client.query(
    "UPDATE fixed_assets SET disposed_on = $1, proceeds_laari = $2, disposal_entry_id = $3 WHERE company_id = $4 AND id = $5",
    [on, got.toString(), entry.id, companyId, assetId]
  );
  return { entryNo: entry.entryNo, bookValue: left, proceeds: got, gain };
}

/** The register, with what each is worth in the books now. */
async function list(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT a.id, a.name, a.category, a.cost_laari::text AS cost, a.residual_laari::text AS residual,
            a.acquired_on::text AS acquired_on, a.life_months, a.method, a.rate_bp,
            a.disposed_on::text AS disposed_on, a.proceeds_laari::text AS proceeds,
            COALESCE(SUM(d.amount_laari), 0)::text AS worn,
            max(d.month)::text AS charged_through
       FROM fixed_assets a LEFT JOIN asset_depreciation d ON d.asset_id = a.id
      WHERE a.company_id = $1
      GROUP BY a.id ORDER BY a.disposed_on NULLS FIRST, a.acquired_on DESC, a.name`,
    [companyId]
  );
  return rows.map((r) => {
    const cost = BigInt(r.cost);
    const worn = BigInt(r.worn);
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      categoryName: CATEGORIES[r.category]?.name || r.category,
      acquiredOn: r.acquired_on,
      lifeYears: r.life_months / 12,
      method: r.method,
      ratePct: r.rate_bp ? r.rate_bp / 100 : null,
      cost: formatLaari(cost),
      residual: formatLaari(BigInt(r.residual)),
      worn: formatLaari(worn),
      bookValue: formatLaari(r.disposed_on ? 0n : cost - worn),
      chargedThrough: r.charged_through,
      disposedOn: r.disposed_on,
      proceeds: r.proceeds === null ? null : formatLaari(BigInt(r.proceeds)),
    };
  });
}

module.exports = { CATEGORIES, categoryAccounts, register, depreciate, dispose, list, wornAfter, monthsInUse, monthEnds, monthEnd };
