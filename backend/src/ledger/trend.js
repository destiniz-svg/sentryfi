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

module.exports = { cashTrend };
