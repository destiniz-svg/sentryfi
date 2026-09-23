/**
 * Analytics: the questions a founder asks, answered from the ledger, each
 * figure open to the entries behind it (entries() below takes the same
 * filters, so what opens always adds up to what was clicked).
 *
 * One period drives the page; the one before it, of the same length, is what
 * every change is measured against. Nothing here is stored.
 */
const { formatLaari } = require("./money");
const { profitBy } = require("./statements");
const { aged } = require("./sales");
const { unpaid } = require("./payments");
const loans = require("./loans");
const orders = require("./orders");

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const f = formatLaari;
const pct = (now, before) => (before > 0n ? Math.round(Number(((now - before) * 1000n) / before)) / 10 : null);

/** The period just before this one, as long as it. */
function previous(from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  return { from: iso(new Date(Date.parse(from) - days * DAY)), to: iso(new Date(Date.parse(from) - DAY)) };
}

async function totals(client, companyId, from, to) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN a.type = 'income' THEN l.credit_laari - l.debit_laari END), 0)::text AS income,
            COALESCE(SUM(CASE WHEN a.type = 'expense' THEN l.debit_laari - l.credit_laari END), 0)::text AS costs
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE l.company_id = $1 AND e.entry_date BETWEEN $2::date AND $3::date AND a.type IN ('income', 'expense')`,
    [companyId, from, to]
  );
  return { income: BigInt(rows[0].income), costs: BigInt(rows[0].costs) };
}

async function overview(client, { companyId, from, to }) {
  const prev = previous(from, to);
  const [now, before] = [await totals(client, companyId, from, to), await totals(client, companyId, prev.from, prev.to)];
  const profit = now.income - now.costs;
  const profitBefore = before.income - before.costs;

  const { rows: cashRows } = await client.query(
    `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0)::text AS now,
            COALESCE(SUM(l.debit_laari - l.credit_laari) FILTER (WHERE e.entry_date < $2::date), 0)::text AS before
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE l.company_id = $1 AND a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%')`,
    [companyId, from]
  );
  const owedNow = await aged(client, { companyId });
  const owedTotal = owedNow.invoices.reduce((a, i) => a + BigInt(i.outstandingLaari), 0n);
  const overdue = owedNow.invoices.filter((i) => i.daysOver > 0).reduce((a, i) => a + BigInt(i.outstandingLaari), 0n);

  // Twelve months, to navigate by. Months before the books began are marked.
  const { rows: months } = await client.query(
    `WITH months AS (
       SELECT generate_series(date_trunc('month', $2::date) - INTERVAL '11 months', date_trunc('month', $2::date), INTERVAL '1 month') AS m
     ), began AS (
       SELECT date_trunc('month', MIN(entry_date)) AS m FROM journal_entries WHERE company_id = $1
     ), sums AS (
       SELECT date_trunc('month', e.entry_date) AS m,
              SUM(CASE WHEN a.type = 'income' THEN l.credit_laari - l.debit_laari ELSE 0 END) AS income,
              SUM(CASE WHEN a.type = 'expense' THEN l.debit_laari - l.credit_laari ELSE 0 END) AS costs
         FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
        WHERE l.company_id = $1 AND a.type IN ('income', 'expense')
          AND e.entry_date >= date_trunc('month', $2::date) - INTERVAL '11 months'
          AND e.entry_date < date_trunc('month', $2::date) + INTERVAL '1 month'
        GROUP BY 1
     )
     SELECT to_char(months.m, 'YYYY-MM') AS ym, to_char(months.m, 'Mon') AS label,
            COALESCE(sums.income, 0)::text AS income, COALESCE(sums.costs, 0)::text AS costs,
            (began.m IS NULL OR months.m < began.m) AS before_books
       FROM months CROSS JOIN began LEFT JOIN sums ON sums.m = months.m ORDER BY months.m`,
    [companyId, to]
  );

  // Where the money came from, and where it went.
  const { rows: incomeBy } = await client.query(
    `SELECT c.id, COALESCE(c.name, 'Not named') AS name, SUM(l.credit_laari - l.debit_laari)::text AS amount
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
       LEFT JOIN counterparties c ON c.id = l.counterparty_id
      WHERE l.company_id = $1 AND a.type = 'income' AND e.entry_date BETWEEN $2::date AND $3::date
      GROUP BY c.id, c.name HAVING SUM(l.credit_laari - l.debit_laari) <> 0 ORDER BY 3::bigint DESC`,
    [companyId, from, to]
  );
  const { rows: costsBy } = await client.query(
    `SELECT a.id, a.name, SUM(l.debit_laari - l.credit_laari)::text AS amount
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE l.company_id = $1 AND a.type = 'expense' AND e.entry_date BETWEEN $2::date AND $3::date
      GROUP BY a.id, a.name HAVING SUM(l.debit_laari - l.credit_laari) <> 0 ORDER BY 3::bigint DESC`,
    [companyId, from, to]
  );
  const { rows: costsBefore } = await client.query(
    `SELECT a.id, SUM(l.debit_laari - l.credit_laari)::text AS amount
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE l.company_id = $1 AND a.type = 'expense' AND e.entry_date BETWEEN $2::date AND $3::date GROUP BY a.id`,
    [companyId, prev.from, prev.to]
  );
  const wasCost = Object.fromEntries(costsBefore.map((r) => [r.id, BigInt(r.amount)]));

  // Which site made money: by project, branch and machine.
  const sites = {};
  for (const kind of ["project", "branch", "machine"]) {
    sites[kind] = (await profitBy(client, { companyId, from, to, kind }))
      .filter((r) => r.id && (r.income !== 0n || r.costs !== 0n))
      .map((r) => ({ id: r.id, name: r.name, income: f(r.income), costs: f(r.costs), profit: f(r.profit), margin: r.income > 0n ? Math.round(Number((r.profit * 1000n) / r.income)) / 10 : null, raw: { income: Number(r.income), costs: Number(r.costs) } }));
  }

  // Who pays late: from every receipt against an invoice, weighted by amount.
  const { rows: paid } = await client.query(
    `SELECT s.counterparty_id AS id, c.name,
            SUM(a.amount_laari)::text AS paid,
            SUM(a.amount_laari * (r.received_on - s.issue_date))::text AS weighted_days,
            SUM(a.amount_laari * GREATEST(r.received_on - COALESCE(s.due_date, s.issue_date + 30), 0))::text AS weighted_late,
            SUM(CASE WHEN r.received_on <= COALESCE(s.due_date, s.issue_date + 30) THEN a.amount_laari ELSE 0 END)::text AS on_time
       FROM receipt_allocations a
       JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
       JOIN sales_invoices s ON s.id = a.invoice_id
       LEFT JOIN counterparties c ON c.id = s.counterparty_id
      WHERE a.company_id = $1
      GROUP BY s.counterparty_id, c.name`,
    [companyId]
  );
  const payers = new Map();
  for (const p of paid) {
    const amt = BigInt(p.paid);
    if (amt <= 0n) continue;
    payers.set(p.id, {
      id: p.id, name: p.name || "Not named",
      daysToPay: Number(BigInt(p.weighted_days) / amt),
      daysLate: Number(BigInt(p.weighted_late) / amt),
      onTimePct: Number((BigInt(p.on_time) * 100n) / amt),
      owed: 0n, overdue: 0n, oldest: 0, invoices: [],
    });
  }
  for (const inv of owedNow.invoices || []) {
    const id = inv.customerId;
    if (!payers.has(id)) payers.set(id, { id, name: inv.customer || "Not named", daysToPay: null, daysLate: null, onTimePct: null, owed: 0n, overdue: 0n, oldest: 0, invoices: [] });
    const p = payers.get(id);
    const left = BigInt(inv.outstandingLaari);
    p.owed += left;
    if (inv.daysOver > 0) {
      p.overdue += left;
      p.oldest = Math.max(p.oldest, inv.daysOver);
      p.invoices.push({ id: inv.id, number: inv.invoiceNo, daysOver: inv.daysOver });
    }
  }
  const payerList = [...payers.values()]
    .sort((a, b) => (b.overdue > a.overdue ? 1 : b.overdue < a.overdue ? -1 : (b.daysLate || 0) - (a.daysLate || 0)))
    .map((p) => ({ ...p, owed: f(p.owed), overdue: f(p.overdue), invoices: p.invoices.slice(0, 3) }));

  // This month, before it ends: spent so far, the pace, and what is still due.
  const today = new Date();
  const monthStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const monthEnd = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));
  const lastStart = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const lastEnd = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)));
  const soFar = (await totals(client, companyId, monthStart, iso(today))).costs;
  const lastMonth = (await totals(client, companyId, lastStart, lastEnd)).costs;
  const day = today.getUTCDate();
  const days = Number(monthEnd.slice(8, 10));
  const pace = (soFar * BigInt(days)) / BigInt(Math.max(day, 1));
  const stillDue = [];
  for (const b of await unpaid(client, { companyId })) {
    if (b.kind !== "bill" || !b.due || b.due > monthEnd) continue;
    stillDue.push({ kind: "bill", id: b.id, what: `${b.payee}${b.reference ? ` · ${b.reference}` : ""}`, on: b.due, amount: b.owed, late: b.due < iso(today) });
  }
  for (const l of await loans.list(client, { companyId })) {
    if (l.next && l.next.due <= monthEnd) stillDue.push({ kind: "loan", id: l.id, what: `${l.name} instalment`, on: l.next.due, amount: l.next.payment, late: l.next.late });
  }
  stillDue.sort((a, b) => a.on.localeCompare(b.on));
  const dueTotal = stillDue.reduce((a, d) => a + BigInt(String(d.amount).replace(/[,.]/g, "")), 0n);

  // Committed, not yet spent: approved purchase orders and subcontracts not billed.
  const committed = [];
  const { rows: pos } = await client.query(
    "SELECT id FROM orders WHERE company_id = $1 AND kind = 'purchase' AND cancelled_at IS NULL AND closed_at IS NULL AND (NOT needs_approval OR approved_at IS NOT NULL)",
    [companyId]
  );
  for (const { id } of pos) {
    const s = await orders.load(client, { companyId, orderId: id });
    let open = 0n;
    for (const l of s.lines) if (l.units > l.billedUnits) open += orders.times(l.price, l.units - l.billedUnits);
    if (open > 0n) committed.push({ kind: "order", id, what: `${s.order.number} · ${s.order.party || "supplier"}`, project: s.order.project || null, open });
  }
  const { rows: subs } = await client.query(
    `SELECT c.id, c.description, p.name AS project, cp.name AS supplier, c.amount_laari,
            COALESCE((SELECT SUM(b.net_laari) FROM bills b WHERE b.commitment_id = c.id AND b.status = 'posted'), 0) AS billed
       FROM project_commitments c JOIN projects p ON p.id = c.project_id LEFT JOIN counterparties cp ON cp.id = c.counterparty_id
      WHERE c.company_id = $1 AND c.closed_at IS NULL`,
    [companyId]
  );
  for (const s of subs) {
    const open = BigInt(s.amount_laari) - BigInt(s.billed);
    if (open > 0n) committed.push({ kind: "subcontract", id: s.id, what: `${s.description}${s.supplier ? ` · ${s.supplier}` : ""}`, project: s.project, open });
  }
  committed.sort((a, b) => (b.open > a.open ? 1 : -1));

  const kpi = (n, b) => ({ now: f(n), before: f(b), change: pct(n, b), raw: Number(n) });
  return {
    period: { from, to }, previous: prev,
    kpis: {
      income: kpi(now.income, before.income),
      costs: kpi(now.costs, before.costs),
      profit: { ...kpi(profit, profitBefore), change: profitBefore !== 0n ? Math.round(Number(((profit - profitBefore) * 1000n) / (profitBefore < 0n ? -profitBefore : profitBefore))) / 10 : null },
      margin: { now: now.income > 0n ? Math.round(Number((profit * 1000n) / now.income)) / 10 : null, before: before.income > 0n ? Math.round(Number((profitBefore * 1000n) / before.income)) / 10 : null },
      cash: kpi(BigInt(cashRows[0].now), BigInt(cashRows[0].before)),
      owed: { now: f(owedTotal), overdue: f(overdue), raw: Number(owedTotal), overdueRaw: Number(overdue) },
    },
    months: months.map((m) => ({ ym: m.ym, label: m.label, income: Number(m.income), costs: Number(m.costs), beforeBooks: m.before_books })),
    incomeBy: incomeBy.map((r) => ({ id: r.id, name: r.name, amount: f(BigInt(r.amount)), raw: Number(r.amount) })),
    costsBy: costsBy.map((r) => ({ id: r.id, name: r.name, amount: f(BigInt(r.amount)), raw: Number(r.amount), change: pct(BigInt(r.amount), wasCost[r.id] || 0n) })),
    sites,
    payers: payerList,
    month: {
      from: monthStart, to: monthEnd, day, days,
      soFar: f(soFar), pace: f(pace), lastMonth: f(lastMonth), dueTotal: f(dueTotal),
      raw: { soFar: Number(soFar), pace: Number(pace), lastMonth: Number(lastMonth), due: Number(dueTotal) },
      stillDue,
    },
    committed: { total: f(committed.reduce((a, c) => a + c.open, 0n)), rows: committed.map((c) => ({ ...c, open: f(c.open) })) },
  };
}

/**
 * The entries behind a figure: the same filters the figure was made with, so
 * the list adds up to it. type is income, expense or cash.
 */
async function entries(client, { companyId, from, to, type, accountId, counterpartyId, projectId, dimensionId }) {
  const sign = type === "income" ? "l.credit_laari - l.debit_laari" : "l.debit_laari - l.credit_laari";
  const where = [
    "l.company_id = $1",
    type === "cash" ? "a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%')" : `a.type = '${type === "income" ? "income" : "expense"}'`,
  ];
  const args = [companyId];
  const add = (sql, v) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (from) add("e.entry_date >= ?::date", from);
  if (to) add("e.entry_date <= ?::date", to);
  if (accountId) add("l.account_id = ?", accountId);
  if (counterpartyId === "none") where.push("l.counterparty_id IS NULL");
  else if (counterpartyId) add("l.counterparty_id = ?", counterpartyId);
  if (projectId) add("l.project_id = ?", projectId);
  if (dimensionId) add("? = ANY(l.dimension_ids)", dimensionId);
  const { rows } = await client.query(
    `SELECT e.id, e.entry_no, e.entry_date::text AS on, e.narrative, SUM(${sign})::text AS amount,
            string_agg(DISTINCT a.name, ', ') AS accounts
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE ${where.join(" AND ")}
      GROUP BY e.id, e.entry_no, e.entry_date, e.narrative
     HAVING SUM(${sign}) <> 0
      ORDER BY e.entry_date DESC, e.entry_no DESC`,
    args
  );
  const total = rows.reduce((a, r) => a + BigInt(r.amount), 0n);
  return {
    total: f(total),
    count: rows.length,
    entries: rows.slice(0, 400).map((r) => ({ id: r.id, entryNo: String(r.entry_no), on: r.on, narrative: r.narrative, accounts: r.accounts, amount: f(BigInt(r.amount)) })),
  };
}

module.exports = { overview, entries, previous };
