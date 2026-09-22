const assets = require("./assets");
const periods = require("./periods");
const statements = require("./statements");

/**
 * Closing a year.
 *
 * The Maldives tax year is the calendar year, so a year ends on 31 December.
 * Closing one charges the year's depreciation, then closes the books through
 * the year end so nothing can change the figures that were reported.
 *
 * No entry sweeps profit into retained earnings. The balance sheet works that
 * out from the journal as at any date: everything earned before the year
 * began is "retained earnings", this year's is "profit for the year". A
 * closing entry would only restate what the lines already say, and would make
 * the year's own profit and loss read zero. This is how Xero and QuickBooks
 * treat it too.
 */

const yearEndOf = (year) => `${year}-12-31`;

async function status(client, { companyId, year }) {
  const through = yearEndOf(year);
  const locked = await periods.lockedThrough(client, { companyId });
  // One connection runs one query at a time.
  const doubts = await periods.doubtsFor(client, { companyId, through });
  const pending = await assets.depreciate(client, { companyId, through, dryRun: true });
  const pl = await statements.profitAndLoss(client, { companyId, from: `${year}-01-01`, to: through });
  return {
    year,
    through,
    closed: Boolean(locked && locked >= through),
    over: through < new Date().toISOString().slice(0, 10),
    doubts,
    depreciationToCharge: pending.total,
    depreciationMonths: pending.pending.length,
    profit: pl.profit,
  };
}

async function close(client, { companyId, userId, year }) {
  const through = yearEndOf(year);
  const locked = await periods.lockedThrough(client, { companyId });
  if (locked && locked >= through) throw new Error(`${year} is already closed.`);
  const charged = await assets.depreciate(client, { companyId, userId, through });
  const closed = await periods.close(client, { companyId, userId, through });
  return { ...closed, depreciation: charged.total, depreciationEntries: charged.posted.length };
}

module.exports = { status, close };
