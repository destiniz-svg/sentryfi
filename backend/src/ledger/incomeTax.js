/**
 * The year as the income tax return reads it.
 *
 * The profit and loss, regrouped: every income and expense account onto a
 * return line, by what the account is unless a person has said otherwise.
 * Depreciation is added back, because the tax allows capital allowances
 * instead of the books' depreciation; a sale's gain or loss on an asset is
 * set apart for the same reason. What it gives is a starting point for the
 * accountant, said as an estimate: the lines, the allowances and the rate
 * are theirs to confirm (docs/domain/to-confirm.md).
 */
const { formatLaari } = require("./money");
const { profitAndLoss } = require("./statements");

// In the order the return reads. `back` lines are in the books' profit but not the tax's.
const LINES = {
  revenue: { label: "Revenue", side: "income" },
  other_income: { label: "Other income", side: "income" },
  cost_of_sales: { label: "Cost of sales", side: "expense" },
  employment: { label: "Salaries, wages and staff costs", side: "expense" },
  rent: { label: "Rent", side: "expense" },
  interest: { label: "Interest", side: "expense" },
  other_expenses: { label: "Other expenses", side: "expense" },
  depreciation: { label: "Depreciation (added back)", side: "expense", back: true },
  asset_sales: { label: "Gains and losses on selling assets (set apart)", side: "both", back: true },
  not_deductible: { label: "Not deductible (added back)", side: "expense", back: true },
};

/** Where an account goes when nobody has said: by its code and name. */
function defaultLine(account) {
  const { code, name, type } = account;
  const n = String(name).toLowerCase();
  if (code === "4900" || code === "5810") return "asset_sales";
  if (type === "income") return /^4[0-4]/.test(code) ? "revenue" : "other_income";
  if (code === "5800" || /depreciat/.test(n)) return "depreciation";
  if (code === "5050" || code === "5100" || /cost of (goods|sales)|materials/.test(n)) return "cost_of_sales";
  if (/salar|wage|staff|payroll|pension|allowance/.test(n)) return "employment";
  if (/\brent\b|lease/.test(n)) return "rent";
  if (/^583/.test(code) || /interest/.test(n)) return "interest";
  if (/fine|penalt/.test(n)) return "not_deductible";
  return "other_expenses";
}

/**
 * One year, from 1 January to 31 December (or to today in the year still
 * running). ratePct is the rate the estimate uses; it is shown as such.
 */
async function year(client, { companyId, year: y, ratePct = 15 }) {
  const from = `${y}-01-01`;
  const to = `${y}-12-31`;
  const pl = await profitAndLoss(client, { companyId, from, to });
  const { rows: chosen } = await client.query("SELECT code, tax_line FROM accounts WHERE company_id = $1 AND tax_line IS NOT NULL", [companyId]);
  const said = new Map(chosen.map((r) => [r.code, r.tax_line]));

  const lines = Object.fromEntries(Object.keys(LINES).map((k) => [k, { key: k, ...LINES[k], amount: 0n, accounts: [] }]));
  const place = (acc, type, amount) => {
    const key = said.get(acc.code) && LINES[said.get(acc.code)] ? said.get(acc.code) : defaultLine({ ...acc, type });
    // Income is positive, costs are positive; a line that holds both nets them.
    const signed = type === "income" ? amount : LINES[key].side === "both" ? -amount : amount;
    lines[key].amount += signed;
    lines[key].accounts.push({ code: acc.code, name: acc.name, amount: formatLaari(amount), chosen: said.has(acc.code) });
  };
  for (const a of pl.income) place(a, "income", a.amount);
  for (const a of [...pl.costOfSales, ...pl.expenses]) place(a, "expense", a.amount);

  const income = lines.revenue.amount + lines.other_income.amount;
  const deductible = ["cost_of_sales", "employment", "rent", "interest", "other_expenses"].reduce((s, k) => s + lines[k].amount, 0n);
  const taxable = income - deductible;
  const estimate = taxable > 0n ? (taxable * BigInt(Math.round(ratePct * 100)) + 5000n) / 10000n : 0n;

  return {
    year: y,
    from,
    to,
    bookProfit: formatLaari(pl.profit),
    lines: Object.values(lines)
      .filter((l) => l.accounts.length)
      .map((l) => ({ key: l.key, label: l.label, back: Boolean(l.back), amount: formatLaari(l.amount), accounts: l.accounts })),
    choices: Object.entries(LINES).map(([key, l]) => ({ key, label: l.label })),
    taxableProfit: formatLaari(taxable),
    ratePct,
    estimate: formatLaari(estimate),
  };
}

/** Put an account on a return line, or back on its default (line null). */
async function setLine(client, { companyId, code, line }) {
  if (line && !LINES[line]) throw new Error("That is not a line on the return.");
  const { rowCount } = await client.query("UPDATE accounts SET tax_line = $3 WHERE company_id = $1 AND code = $2", [companyId, code, line || null]);
  if (!rowCount) throw new Error("That account is not in these books.");
}

module.exports = { year, setLine, defaultLine, LINES };
