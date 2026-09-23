/**
 * Every question a CFO asks of the books, answered from them.
 *
 * Each check says its area, what it found, a verdict (good, watch, act), what
 * that means in plain words, and the figures it rests on, so it can be
 * checked. Where the books hold too little to say, the check is left out
 * rather than guessed.
 */
const { formatLaari } = require("./money");

const f = formatLaari;
const big = (v) => BigInt(v ?? 0);
const DAY = 86400000;
const plus = (iso, days) => new Date(Date.parse(iso + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
const ratio = (a, b) => (b > 0n ? Number((a * 100n) / b) / 100 : null);
const pct = (a, b) => (b > 0n ? Number((a * 1000n) / b) / 10 : null);
// Past a year the count of days says nothing more.
const days = (n) => (n > 365 ? "Over a year" : `${n} days`);
const signed = (n) => `${n > 0 ? "+" : ""}${n}%`;
const unformat = (s) => big(String(s).replace(/[,.]/g, ""));
const one = async (client, sql, params) => (await client.query(sql, params)).rows[0];

/** What accounts matching `where` hold at the end of `today`, debit side positive. */
async function balance(client, companyId, where, today) {
  const r = await one(
    client,
    `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.company_id = $1 AND e.entry_date <= $2 AND (${where})`,
    [companyId, today]
  );
  return big(r.b);
}

/** Income or costs between two dates, optionally narrowed to some accounts. */
async function flow(client, companyId, type, from, to, codes = "true") {
  const side = type === "income" ? "l.credit_laari - l.debit_laari" : "l.debit_laari - l.credit_laari";
  const r = await one(
    client,
    `SELECT COALESCE(SUM(${side}), 0) AS v FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.company_id = $1 AND a.type = $2 AND e.entry_date BETWEEN $3 AND $4 AND (${codes})`,
    [companyId, type, from, to]
  );
  return big(r.v);
}

async function health(client, { companyId, today }) {
  const checks = [];
  const add = (c) => checks.push(c);
  const last90 = [plus(today, -89), today];
  const prior90 = [plus(today, -179), plus(today, -90)];
  const yearAgo90 = [plus(today, -454), plus(today, -365)];
  const lastYear = [plus(today, -364), today];

  const cash = await balance(client, companyId, "a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%')", today);
  const owedToUs = await balance(client, companyId, "a.code IN ('1300','1310')", today);
  const stockValue = await balance(client, companyId, "a.code = '1350'", today);
  const gstBack = await balance(client, companyId, "a.code = '1400'", today);
  const owedByUs = -(await balance(client, companyId, "a.code IN ('2100','2200','2400')", today));
  const revenue = await flow(client, companyId, "income", ...last90);
  const revenueBefore = await flow(client, companyId, "income", ...prior90);
  const revenueYearAgo = await flow(client, companyId, "income", ...yearAgo90);
  const costs = await flow(client, companyId, "expense", ...last90);
  const costsBefore = await flow(client, companyId, "expense", ...prior90);
  const cogs = await flow(client, companyId, "expense", ...last90, "a.code = '5050'");
  const cogsBefore = await flow(client, companyId, "expense", ...prior90, "a.code = '5050'");
  const depreciation = await flow(client, companyId, "expense", ...last90, "a.code = '5800'");
  const bought = big(
    (await one(client, "SELECT COALESCE(SUM(gross_laari), 0) AS v FROM bills WHERE company_id = $1 AND status = 'posted' AND voided_at IS NULL AND issue_date BETWEEN $2 AND $3", [companyId, ...last90])).v
  );

  // ---- Cash: how many months it would carry the business.
  const monthly = (costs - depreciation) / 3n;
  if (monthly > 0n) {
    const runway = Number((cash * 10n) / monthly) / 10;
    add({
      area: "Cash", name: "Runway", value: `${runway} months`,
      verdict: runway < 2 ? "act" : runway < 4 ? "watch" : "good",
      explain: `Cash of MVR ${f(cash)} would pay about ${runway} months of costs at the last three months' pace (MVR ${f(monthly)} a month, depreciation left out because it is not cash). Under two months leaves no room for a customer who pays late.`,
      basis: { cash: f(cash), costsPerMonth: f(monthly) },
    });
  }

  // ---- Liquidity: what is owed in the next year against what will turn into cash.
  const loans = (await require("./loans").list(client, { companyId })).filter((l) => !l.lent && l.next);
  const loanYear = loans.reduce(
    (a, l) => a + l.schedule.filter((r) => r.due >= l.next.due && r.due <= plus(today, 365)).reduce((s, r) => s + unformat(r.payment), 0n),
    0n
  );
  const shortAssets = cash + owedToUs + stockValue + gstBack;
  const shortDebts = owedByUs + loanYear;
  if (shortDebts > 0n) {
    const current = ratio(shortAssets, shortDebts);
    add({
      area: "Liquidity", name: "Current ratio", value: String(current),
      verdict: current < 1 ? "act" : current < 1.5 ? "watch" : "good",
      explain: `For every MVR 1 owed in the next year (suppliers, GST, staff and loan repayments: MVR ${f(shortDebts)}) there is MVR ${current} in cash, money owed to you, stock and GST to claim back (MVR ${f(shortAssets)}). Below 1, bills can outrun the money coming in.`,
      basis: { comingIn: f(shortAssets), goingOut: f(shortDebts), loanRepaymentsNextYear: f(loanYear) },
    });
    if (stockValue > 0n) {
      const quick = ratio(shortAssets - stockValue, shortDebts);
      add({
        area: "Liquidity", name: "Quick ratio", value: String(quick),
        verdict: quick < 0.8 ? "act" : quick < 1 ? "watch" : "good",
        explain: `The same without stock, which takes time to sell: MVR ${quick} for every MVR 1 owed.`,
        basis: { withoutStock: f(shortAssets - stockValue), goingOut: f(shortDebts) },
      });
    }
  }

  // ---- Working capital: how long money is tied up.
  const dso = revenue > 0n ? Number((owedToUs * 90n) / revenue) : null;
  const dpo = bought > 0n ? Number((owedByUs * 90n) / bought) : null;
  const dio = cogs > 0n && stockValue > 0n ? Number((stockValue * 90n) / cogs) : null;
  if (dso !== null)
    add({
      area: "Working capital", name: "Days to get paid", value: days(dso),
      verdict: dso > 60 ? "act" : dso > 45 ? "watch" : "good",
      explain: `Customers take about ${dso} days to pay: MVR ${f(owedToUs)} owed against MVR ${f(revenue)} earned in 90 days. Past 60, chase sooner or ask for deposits.`,
      basis: { owedToUs: f(owedToUs), earned90: f(revenue) },
    });
  if (dpo !== null)
    add({
      area: "Working capital", name: "Days taken to pay", value: days(dpo),
      verdict: dpo > 75 ? "watch" : "good",
      explain: `You take about ${dpo} days to pay suppliers. Paying on their terms, not early, keeps cash; far past them costs goodwill and prices.`,
      basis: { owedByUs: f(owedByUs), billed90: f(bought) },
    });
  if (dio !== null)
    add({
      area: "Working capital", name: "Days stock sits", value: days(dio),
      verdict: dio > 120 ? "act" : dio > 75 ? "watch" : "good",
      explain: `Stock of MVR ${f(stockValue)} is ${dio > 365 ? "more than a year" : `about ${dio} days`} of sales at cost, at the pace of the last 90 days (MVR ${f(cogs)}). Money on a shelf is not in the bank.`,
      basis: { stock: f(stockValue), costOfSales90: f(cogs) },
    });
  if (dso !== null && dpo !== null) {
    const cycle = dso + (dio || 0) - dpo;
    add({
      area: "Working capital", name: "Cash cycle", value: cycle < 0 ? `${cycle} days` : days(cycle),
      verdict: cycle > 60 ? "watch" : "good",
      explain:
        cycle > 0
          ? `From paying for what you sell to being paid for it takes ${cycle > 365 ? "more than a year" : `about ${cycle} days`}. That is how long each sale has to be financed.`
          : "Customers pay before you pay suppliers, so they are funding the business.",
      basis: { daysToGetPaid: dso, daysStockSits: dio || 0, daysTakenToPay: dpo },
    });
  }

  // ---- Profit: margin now and before, growth, costs against revenue.
  if (revenue > 0n) {
    const margin = pct(revenue - costs, revenue);
    const before = pct(revenueBefore - costsBefore, revenueBefore);
    add({
      area: "Profit", name: "Profit margin, last 90 days", value: `${margin}%`,
      verdict: margin < 0 ? "act" : before !== null && margin < before - 5 ? "watch" : "good",
      explain: `Of every MVR 100 earned, MVR ${margin} was left after costs${before !== null ? ` (the 90 days before: ${before}%)` : ""}.${margin < 0 ? " The business is spending more than it earns." : ""}`,
      basis: { earned90: f(revenue), costs90: f(costs), earnedBefore: f(revenueBefore), costsBefore: f(costsBefore) },
    });
  }
  // Gross margin only where goods sold are a real part of the business.
  if (cogs > 0n && cogs * 20n >= revenue) {
    const gm = pct(revenue - cogs, revenue);
    const before = cogsBefore > 0n ? pct(revenueBefore - cogsBefore, revenueBefore) : null;
    add({
      area: "Profit", name: "Margin on goods", value: `${gm}%`,
      verdict: before !== null && gm < before - 3 ? "watch" : "good",
      explain: `What sells earns ${gm}% over what it cost${before !== null ? ` (before: ${before}%)` : ""}. A falling margin is usually a cost that rose without a price that followed.`,
      basis: { earned90: f(revenue), costOfSales90: f(cogs) },
    });
  }
  const then = revenueYearAgo > 0n ? revenueYearAgo : revenueBefore;
  if (then > 0n) {
    const growth = pct(revenue - then, then);
    add({
      area: "Profit", name: revenueYearAgo > 0n ? "Revenue against a year ago" : "Revenue against the 90 days before", value: signed(growth),
      verdict: growth < -15 ? "act" : growth < 0 ? "watch" : "good",
      explain: `MVR ${f(revenue)} in the last 90 days against MVR ${f(then)}${revenueYearAgo > 0n ? " in the same 90 days a year ago, which takes the season out of it" : ""}.`,
      basis: { now: f(revenue), then: f(then) },
    });
  }
  if (costsBefore > 0n && revenueBefore > 0n) {
    const costGrowth = pct(costs - costsBefore, costsBefore);
    const revenueGrowth = pct(revenue - revenueBefore, revenueBefore);
    add({
      area: "Profit", name: "Costs against revenue", value: `costs ${signed(costGrowth)}, revenue ${signed(revenueGrowth)}`,
      verdict: costGrowth > revenueGrowth + 10 ? "act" : costGrowth > revenueGrowth ? "watch" : "good",
      explain:
        costGrowth > revenueGrowth
          ? "Costs are growing faster than revenue. Find which kind of cost it is (the profile shows where the money goes) before it eats the margin."
          : "Revenue is keeping ahead of costs.",
      basis: { costs90: f(costs), costsBefore: f(costsBefore) },
    });
  }

  // ---- Risk: one customer, and other currencies.
  const top = await one(
    client,
    `SELECT c.name, SUM(s.net_laari) AS v, SUM(SUM(s.net_laari)) OVER () AS total
       FROM sales_invoices s JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND s.issue_date BETWEEN $2 AND $3
      GROUP BY c.name ORDER BY 2 DESC LIMIT 1`,
    [companyId, ...lastYear]
  );
  if (top && big(top.total) > 0n) {
    const share = pct(big(top.v), big(top.total));
    add({
      area: "Risk", name: "Biggest customer", value: `${share}% of sales`,
      verdict: share > 40 ? "act" : share > 25 ? "watch" : "good",
      explain: `${top.name} was ${share}% of the last year's invoicing. ${share > 25 ? "If they paid late or left, you would feel it at once." : "No single customer holds the business."}`,
      basis: { customer: top.name, theirs: f(big(top.v)), all: f(big(top.total)) },
    });
  }
  // What was bought in other currencies over the year: a guide to next year's exposure.
  const { rows: fx } = await client.query(
    `SELECT trim(b.currency) AS cur, SUM(b.fc_gross) AS v, SUM(b.gross_laari) AS mvr
       FROM bills b WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND b.fc_gross IS NOT NULL AND b.issue_date BETWEEN $2 AND $3
      GROUP BY b.currency`,
    [companyId, ...lastYear]
  );
  for (const r of fx) {
    const mvr = big(r.mvr);
    add({
      area: "Risk", name: `Bought in ${r.cur}, last year`, value: `${r.cur} ${f(big(r.v))}`,
      verdict: "watch",
      explain: `MVR ${f(mvr)} at the rates on the bills. If you buy as much again, every 1% the rate moves is about MVR ${f(mvr / 100n)} more or less. Record rates as they change, and pay when the rate suits.`,
      basis: { currency: r.cur, amount: f(big(r.v)), inRufiyaa: f(mvr) },
    });
  }

  // ---- Debt: can profit carry the repayments.
  if (loanYear > 0n) {
    const profitYear = (await flow(client, companyId, "income", ...lastYear)) - (await flow(client, companyId, "expense", ...lastYear));
    const interest = await flow(client, companyId, "expense", ...lastYear, "a.code LIKE '583%'");
    const addBack = await flow(client, companyId, "expense", ...lastYear, "a.code = '5800'");
    const operating = profitYear + interest + addBack;
    const cover = ratio(operating, loanYear);
    add({
      area: "Debt", name: "Repayments covered by profit", value: `${cover} times`,
      verdict: cover < 1 ? "act" : cover < 1.25 ? "watch" : "good",
      explain: `The last year's profit before interest and depreciation (MVR ${f(operating)}) against the next year's loan repayments (MVR ${f(loanYear)}). Banks look for about 1.25 times; below 1, repayments come out of cash, not profit.`,
      basis: { profitBeforeInterest: f(operating), repaymentsNextYear: f(loanYear), interestLastYear: f(interest) },
    });
  }

  // ---- Tax: GST to keep aside, and when the return is due.
  const co = await one(client, "SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
  if (co?.gst_registered) {
    const r = await require("./gstReturn").build(client, { companyId });
    const owe = r.out.tax - r.inp.tax;
    const late = !r.filed && r.period.daysLeft !== null && r.period.daysLeft < 0;
    add({
      area: "Tax", name: `GST for ${r.period.label}`, value: owe === 0n ? "Nothing to pay" : owe > 0n ? `MVR ${f(owe)} to pay` : `MVR ${f(-owe)} to claim back`,
      verdict: r.filed ? "good" : late || owe > cash ? "act" : r.period.daysLeft !== null && r.period.daysLeft <= 14 ? "watch" : "good",
      explain: r.filed
        ? "Filed."
        : `${owe > 0n ? "Keep this aside: it is MIRA's money, not yours." : owe < 0n ? "It comes back when the return is filed." : "Nothing to pay, but the return still has to be filed."} ${late ? `The return was due ${-r.period.daysLeft} days ago.` : r.period.daysLeft !== null ? `The return is due in ${r.period.daysLeft} days.` : ""}`.trim(),
      basis: { collected: f(r.out.tax), paid: f(r.inp.tax) },
    });
  }

  // ---- Stock that has not sold.
  const { rows: slow } = await client.query(
    `SELECT i.name, SUM(m.value_laari) AS v FROM stock_items i JOIN stock_moves m ON m.item_id = i.id
      WHERE i.company_id = $1 GROUP BY i.id, i.name
     HAVING SUM(m.value_laari) > 0
        AND NOT EXISTS (SELECT 1 FROM stock_moves s WHERE s.item_id = i.id AND s.kind = 'sold' AND s.moved_on >= $2)
        AND min(m.moved_on) < $2`,
    [companyId, last90[0]]
  );
  if (slow.length) {
    const tied = slow.reduce((a, r) => a + big(r.v), 0n);
    add({
      area: "Stock", name: "Not sold in 90 days", value: `MVR ${f(tied)}`,
      verdict: tied * 10n > cash ? "watch" : "good",
      explain: `${slow.length} ${slow.length === 1 ? "item has" : "items have"} not sold in 90 days: ${slow.slice(0, 4).map((r) => r.name).join(", ")}${slow.length > 4 ? " and more" : ""}. Sell at a smaller margin, use it, or stop buying it.`,
      basis: { items: slow.length, value: f(tied) },
    });
  }

  // ---- Projects: overruns and margins heading below zero.
  const projects = await require("./projects").list(client, { companyId });
  if (projects.length) {
    const over = projects.filter((p) => p.overBudget.length);
    const losing = projects.filter((p) => p.forecastMargin?.startsWith("-"));
    add({
      area: "Projects", name: "Against budget", value: over.length ? `${over.length} over budget` : "All within budget",
      verdict: losing.length ? "act" : over.length ? "watch" : "good",
      explain: losing.length
        ? `${losing.map((p) => p.name).join(", ")} ${losing.length === 1 ? "is" : "are"} heading for a loss on the forecast cost.`
        : over.length
          ? `${over.map((p) => `${p.name} (${p.overBudget.join(", ")})`).join("; ")}.`
          : "Spent and committed are within every budget.",
      basis: { projects: projects.length, overBudget: over.length, headingForLoss: losing.length },
    });
  }

  // ---- The books themselves: advice is only as good as they are.
  const bank = await one(client, "SELECT count(*)::int AS n, min(posted_on)::text AS oldest FROM bank_statement_lines WHERE company_id = $1 AND status = 'open'", [companyId]);
  const closed = (await one(client, "SELECT books_locked_through($1)::text AS d", [companyId])).d;
  add({
    area: "The books", name: "Up to date", value: bank.n ? `${bank.n} bank lines to explain` : "Bank explained",
    verdict: bank.n > 50 ? "act" : bank.n ? "watch" : "good",
    explain: `${bank.n ? `${bank.n} bank lines are not explained yet, the oldest from ${bank.oldest}. Every figure here is only as right as the books.` : "Every bank line is explained."} ${closed ? `The books are closed through ${closed}.` : "No month has been closed yet."}`,
    basis: { openBankLines: bank.n, closedThrough: closed },
  });

  const rank = { act: 0, watch: 1, good: 2 };
  return checks.sort((a, b) => rank[a.verdict] - rank[b.verdict]);
}

module.exports = { health };
