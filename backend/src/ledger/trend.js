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
  if (avg >= 0n) return { months: null, growing: true };
  return { months: Number((c * 10n) / -avg) / 10, growing: false };
}

module.exports = { cashTrend, runway };
