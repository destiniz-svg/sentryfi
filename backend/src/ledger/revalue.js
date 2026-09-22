const { postEntry } = require("./post");
const fx = require("./fx");
const { lockedThrough } = require("./periods");

/**
 * Month-end revaluation: money held or owed in another currency, restated at
 * that month's rate.
 *
 * A dollar account, dollars a customer owes, dollars owed to a supplier: each
 * is carried in rufiyaa at the rates of the day each line happened. At a month
 * end the rate has moved, so what they are worth in rufiyaa has too. The
 * difference goes to exchange gains or losses (IAS 21: monetary items at the
 * closing rate). Only what is held or owed moves; income, costs and the GST
 * owed stay at the rates they happened at.
 *
 * Running it again for the same month finds nothing to move.
 */

const GAIN = ["4920", "Exchange gains", "income"];
const LOSS = ["5850", "Exchange losses", "expense"];

const monthEnd = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Every account holding another currency on a date: what it holds in that currency, and what it is carried at. */
async function exposures(client, { companyId, on }) {
  const base = await fx.baseCurrency(client, { companyId });
  const { rows } = await client.query(
    `WITH lines AS (
       SELECT jl.account_id, jl.currency,
              SUM(CASE WHEN jl.debit_laari > 0 THEN jl.amount_fc ELSE -jl.amount_fc END) AS fc,
              SUM(jl.debit_laari - jl.credit_laari) AS carried
         FROM journal_lines jl JOIN journal_entries e ON e.id = jl.entry_id
        WHERE jl.company_id = $1 AND e.entry_date <= $2::date AND jl.currency IS NOT NULL AND jl.currency <> $3
        GROUP BY jl.account_id, jl.currency
     ), moved AS (
       SELECT rv.account_id, rv.currency, SUM(rv.amount_laari) AS moved
         FROM revaluations rv
        WHERE rv.company_id = $1 AND rv.on_date <= $2::date
          AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_id = rv.entry_id)
        GROUP BY rv.account_id, rv.currency
     )
     SELECT a.id, a.code, a.name, l.currency, l.fc::text AS fc, (l.carried + COALESCE(m.moved, 0))::text AS carried
       FROM lines l
       JOIN accounts a ON a.id = l.account_id AND a.type IN ('asset', 'liability')
       LEFT JOIN moved m ON m.account_id = l.account_id AND m.currency = l.currency
      ORDER BY a.code, l.currency`,
    [companyId, on, base]
  );
  return rows.map((r) => ({ ...r, currency: r.currency.trim(), fc: BigInt(r.fc), carried: BigInt(r.carried) }));
}

/** What a revaluation through a month end would move, at the rates given or recorded. */
async function preview(client, { companyId, through, rates = {} }) {
  const on = monthEnd(through);
  const found = await exposures(client, { companyId, on });
  const currencies = [...new Set(found.map((f) => f.currency))];
  const rateOf = {};
  for (const c of currencies) rateOf[c] = rates[c] || (await fx.rateOn(client, { companyId, currency: c, on }))?.rate || null;
  const items = found.map((f) => {
    const rate = rateOf[f.currency];
    const worth = rate ? fx.toBase(f.fc, rate) : null;
    return { ...f, rate, worth, move: worth === null ? null : worth - f.carried };
  });
  return { on, items, missing: currencies.filter((c) => !rateOf[c]) };
}

async function revalue(client, { companyId, userId, through, rates = {} }) {
  const on = monthEnd(through);
  const locked = await lockedThrough(client, { companyId });
  if (locked && on <= locked) throw new Error("That month is closed. Revalue before closing it.");
  for (const [c, r] of Object.entries(rates)) {
    if (r) await fx.recordRate(client, { companyId, userId, currency: c, on, rate: String(r), source: "Month-end revaluation" });
  }
  const p = await preview(client, { companyId, through: on, rates });
  if (p.missing.length) throw new Error(`What was the rate on ${on} for ${p.missing.join(" and ")}?`);

  const moving = p.items.filter((i) => i.move !== 0n);
  const net = moving.reduce((s, i) => s + i.move, 0n);
  // Moves that cancel still post: both accounts are restated, and their lines balance each other.
  if (!moving.length) return { on, entryNo: null, net: 0n, items: p.items };

  // Each account moves by its own amount (debit-positive, so an asset worth
  // more and a debt that grew both read right). What they net to is a gain
  // when positive and a loss when negative.
  const lines = moving.map((i) => {
    const memo = `${i.currency} ${i.rate}`;
    return i.move > 0n ? { accountId: i.id, debit: i.move, memo } : { accountId: i.id, credit: -i.move, memo };
  });
  const ensure = async ([code, name, type]) => {
    await client.query(
      `INSERT INTO accounts (company_id, code, name, type) VALUES ($1,$2,$3,$4::account_t) ON CONFLICT (company_id, code) DO NOTHING`,
      [companyId, code, name, type]
    );
    return (await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = $2", [companyId, code])).rows[0].id;
  };
  if (net > 0n) lines.push({ accountId: await ensure(GAIN), credit: net, memo: "Revaluation" });
  if (net < 0n) lines.push({ accountId: await ensure(LOSS), debit: -net, memo: "Revaluation" });
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: on,
    source: "revaluation",
    narrative: `Foreign money restated at ${on} rates: ${[...new Set(moving.map((i) => `${i.currency} ${i.rate}`))].join(", ")}`,
    lines,
  });
  for (const i of moving) {
    await client.query(
      `INSERT INTO revaluations (company_id, account_id, currency, on_date, rate, amount_laari, entry_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, i.id, i.currency, on, String(i.rate), i.move.toString(), entry.id]
    );
  }
  return { on, entryNo: entry.entryNo, net, items: p.items };
}

module.exports = { exposures, preview, revalue };
