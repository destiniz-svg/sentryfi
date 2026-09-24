/**
 * The closing cash balance on each of the last thirty-one days, oldest first,
 * from the balance before the window and each day's movement. Laari, BigInt.
 */
function cashTrend(before, moves, today) {
  const byDay = Object.fromEntries(moves.map((m) => [m.day, BigInt(m.amount)]));
  let run = BigInt(before || 0);
  const out = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    run += byDay[d.toISOString().slice(0, 10)] || 0n;
    out.push(run);
  }
  return out;
}

/**
 * How many months the cash lasts: cash over the average net fall in cash of
 * the whole months given (money in counted against money out, and nothing
 * that is not cash, like depreciation). One decimal. Null when there is
 * nothing to measure by or cash is not falling; then `growing` says which.
 */
function runway(cash, monthlyChange) {
  const c = BigInt(cash || 0);
  if (!monthlyChange.length || c <= 0n) return { months: null, growing: false };
  const avg = monthlyChange.reduce((a, b) => a + BigInt(b), 0n) / BigInt(monthlyChange.length);
  if (avg > 0n) return { months: null, growing: true };
  if (avg === 0n) return { months: null, growing: false };
  return { months: Number((c * 10n) / -avg) / 10, growing: false };
}

/**
 * How cash itself moved in each of the three whole months before today's,
 * counting only months the books covered from their first day: a month the
 * books began partway through would read as a quiet one. Opening balances are
 * where the books started, not a month's movement; history brought in from
 * another system is real movement and counts. Laari as text, oldest first.
 */
async function cashMoves(client, { companyId, today }) {
  const { rows } = await client.query(
    `WITH began AS (
       SELECT MIN(entry_date) AS d FROM journal_entries WHERE company_id = $1 AND source <> 'opening_balance'
     ), months AS (
       SELECT generate_series(date_trunc('month', $2::date) - INTERVAL '3 months',
                              date_trunc('month', $2::date) - INTERVAL '1 month', INTERVAL '1 month')::date AS m
     )
     SELECT months.m::text AS month,
            (SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)
               FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
              WHERE l.company_id = $1 AND a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%')
                AND e.source <> 'opening_balance'
                AND e.entry_date >= months.m AND e.entry_date < months.m + INTERVAL '1 month')::text AS amount
       FROM months, began
      WHERE began.d IS NOT NULL AND months.m >= began.d
      ORDER BY months.m`,
    [companyId, today]
  );
  return rows.map((r) => r.amount);
}

module.exports = { cashTrend, runway, cashMoves };
