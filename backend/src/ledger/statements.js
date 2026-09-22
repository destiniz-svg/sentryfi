const { formatLaari } = require("./money");

/**
 * The statements: trial balance, profit and loss, balance sheet.
 *
 * From journal lines and nothing else. There is no ledger balance table, no
 * cached total, no "current year" column somebody keeps up to date: each of
 * these is a sum over the journal for the dates asked, so asking for last
 * March gives last March's answer and can never disagree with the entries.
 *
 * That is also what makes them worth an accountant's time. The three checks
 * are properties of the journal, not of this code: every entry balances, so a
 * trial balance always foots; and assets less liabilities is always equity
 * plus what has been earned. If either is ever out, an entry got in that the
 * database should have refused, and this is where it would show.
 */

const TYPES = ["asset", "liability", "equity", "income", "expense"];

/**
 * Debit and credit totals per account, for entries dated in the window.
 * `from` is optional; without it the window starts at the beginning of time.
 */
async function totals(client, { companyId, asAt, from = null }) {
  const { rows } = await client.query(
    `SELECT a.id, a.code, a.name, a.type::text AS type,
            COALESCE(SUM(l.debit_laari), 0)  AS debit,
            COALESCE(SUM(l.credit_laari), 0) AS credit
       FROM accounts a
       LEFT JOIN (
              SELECT jl.account_id, jl.debit_laari, jl.credit_laari
                FROM journal_lines jl
                JOIN journal_entries e ON e.id = jl.entry_id
               WHERE jl.company_id = $1 AND e.entry_date <= $2::date
                 AND ($3::date IS NULL OR e.entry_date >= $3::date)
            ) l ON l.account_id = a.id
      WHERE a.company_id = $1
      GROUP BY a.id
      ORDER BY a.code`,
    [companyId, asAt, from]
  );
  return rows.map((r) => ({ ...r, debit: BigInt(r.debit), credit: BigInt(r.credit) }));
}

const net = (r) => r.debit - r.credit;

/**
 * Every account with a balance on the date, on the side it is on. The two
 * columns must add to the same figure, and the difference is reported rather
 * than assumed to be zero.
 */
async function trialBalance(client, { companyId, asAt }) {
  const all = await totals(client, { companyId, asAt });
  const rows = all
    .filter((r) => net(r) !== 0n)
    .map((r) => ({
      code: r.code,
      name: r.name,
      type: r.type,
      debit: net(r) > 0n ? net(r) : 0n,
      credit: net(r) < 0n ? -net(r) : 0n,
    }));
  const debit = rows.reduce((s, r) => s + r.debit, 0n);
  const credit = rows.reduce((s, r) => s + r.credit, 0n);
  return { asAt, rows, debit, credit, difference: debit - credit };
}

/** What was earned and spent between two dates, and what was left. */
async function profitAndLoss(client, { companyId, from, to }) {
  const all = await totals(client, { companyId, asAt: to, from });
  const income = all
    .filter((r) => r.type === "income" && net(r) !== 0n)
    .map((r) => ({ code: r.code, name: r.name, amount: -net(r) }));
  const expenses = all
    .filter((r) => r.type === "expense" && net(r) !== 0n)
    .map((r) => ({ code: r.code, name: r.name, amount: net(r) }));
  const totalIncome = income.reduce((s, r) => s + r.amount, 0n);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0n);
  return { from, to, income, expenses, totalIncome, totalExpenses, profit: totalIncome - totalExpenses };
}

/**
 * What the business holds, owes and is worth, on a date.
 *
 * Profit is not stored anywhere, so the earnings to date are worked out from
 * the income and expense accounts and shown in equity as two lines: what was
 * earned before this year began (retained earnings) and this year's profit.
 * No year-end entry sweeps one into the other (see ledger/yearEnd.js).
 */
async function balanceSheet(client, { companyId, asAt }) {
  const all = await totals(client, { companyId, asAt });
  const side = (type, sign) =>
    all
      .filter((r) => r.type === type && net(r) !== 0n)
      .map((r) => ({ code: r.code, name: r.name, amount: sign * net(r) }));

  const assets = side("asset", 1n);
  const liabilities = side("liability", -1n);
  const equity = side("equity", -1n);
  const earned = all
    .filter((r) => r.type === "income" || r.type === "expense")
    .reduce((s, r) => s - net(r), 0n);
  const yearStart = `${String(asAt).slice(0, 4)}-01-01`;
  const thisYear = (await totals(client, { companyId, asAt, from: yearStart }))
    .filter((r) => r.type === "income" || r.type === "expense")
    .reduce((s, r) => s - net(r), 0n);

  const sum = (list) => list.reduce((s, r) => s + r.amount, 0n);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + earned;
  return {
    asAt,
    assets,
    liabilities,
    equity,
    earned,
    earnedBefore: earned - thisYear,
    earnedThisYear: thisYear,
    totalAssets,
    totalLiabilities,
    totalEquity,
    // Reported, not assumed: assets less what is owed is what the owners have.
    difference: totalAssets - (totalLiabilities + totalEquity),
  };
}

/** Strings for the wire. BigInt is exact in the ledger and has no JSON form. */
const money = (v) => formatLaari(v);
const amounts = (rows) => rows.map((r) => ({ ...r, amount: money(r.amount) }));

const wire = {
  trialBalance: (t) => ({
    asAt: t.asAt,
    rows: t.rows.map((r) => ({ ...r, debit: r.debit ? money(r.debit) : null, credit: r.credit ? money(r.credit) : null })),
    debit: money(t.debit),
    credit: money(t.credit),
    difference: money(t.difference),
    balances: t.difference === 0n,
  }),
  profitAndLoss: (p) => ({
    from: p.from,
    to: p.to,
    income: amounts(p.income),
    expenses: amounts(p.expenses),
    totalIncome: money(p.totalIncome),
    totalExpenses: money(p.totalExpenses),
    profit: money(p.profit),
    loss: p.profit < 0n,
  }),
  balanceSheet: (b) => ({
    asAt: b.asAt,
    assets: amounts(b.assets),
    liabilities: amounts(b.liabilities),
    equity: amounts(b.equity),
    earned: money(b.earned),
    earnedBefore: money(b.earnedBefore),
    earnedThisYear: money(b.earnedThisYear),
    totalAssets: money(b.totalAssets),
    totalLiabilities: money(b.totalLiabilities),
    totalEquity: money(b.totalEquity),
    difference: money(b.difference),
    balances: b.difference === 0n,
  }),
};

module.exports = { TYPES, totals, trialBalance, profitAndLoss, balanceSheet, wire };
