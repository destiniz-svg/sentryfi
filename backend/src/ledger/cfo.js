/**
 * The CFO: watches the books and says what matters, every morning.
 *
 * Everything here is read from the ledger and the documents behind it; every
 * figure says where it came from (entries, invoices, bills), and every market
 * note says its source and date. It advises; it never posts.
 *
 *   figures   cash now, expected in and committed out over 30 days, and the
 *             cash that leaves, each with what makes it up
 *   profile   what the business sells and to whom, its suppliers, its cost
 *             structure, margins, seasons and financing, over the last year
 *   noticed   anomalies raised the week they happen
 *   market    what a change in a rate the company records does to its own
 *             figures (outside prices come when their sources are chosen)
 *   brief     the morning's page: changed, to do, noticed, market, learned
 *
 * An optional written summary comes from the Claude API when a key is set,
 * given only these facts, and marked as written by it.
 */
const { formatLaari } = require("./money");

const f = formatLaari;
const DAY = 86400000;
const plus = (iso, days) => new Date(Date.parse(iso + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
/** Today where the company is (the Maldives, UTC+5). */
const todayHere = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const big = (v) => BigInt(v ?? 0);

async function one(client, sql, params) {
  return (await client.query(sql, params)).rows[0];
}

// ------------------------------------------------------------------ the four figures

async function figures(client, { companyId, today }) {
  const until = plus(today, 30);
  const cash = await one(
    client,
    `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.company_id = $1 AND a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%') AND e.entry_date <= $2`,
    [companyId, today]
  );

  const { rows: invoices } = await client.query(
    `SELECT s.id, s.invoice_no, c.name, COALESCE(s.due_date, s.issue_date + 30)::text AS due,
            s.gross_laari - COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = s.id), 0)
                          - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = s.id), 0) AS owed
       FROM sales_invoices s JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND s.fc_gross IS NULL AND COALESCE(s.due_date, s.issue_date + 30) <= $2`,
    [companyId, until]
  );
  const inParts = invoices.filter((i) => big(i.owed) > 0n).map((i) => ({ kind: "invoice", id: i.id, label: `${i.invoice_no} from ${i.name}`, due: i.due, amount: big(i.owed) }));
  const recurring = require("./recurring");
  const { rows: schedules } = await client.query(
    `SELECT id, name, lines, every, anchor_day, next_on::text AS next_on, ends_on::text AS ends_on FROM recurring_invoices
      WHERE company_id = $1 AND paused_at IS NULL AND next_on <= $2`,
    [companyId, until]
  );
  for (const s of schedules) {
    const each = s.lines.reduce((a, l) => a + (big(Math.round(Number(l.unitPrice) * 100)) * big(Math.round(Number(l.quantity) * 10000)) + 5000n) / 10000n, 0n);
    for (let d = s.next_on, i = 0; d <= until && (!s.ends_on || d <= s.ends_on) && i < 6; d = recurring.nextDate(d, s.every, s.anchor_day), i++) {
      inParts.push({ kind: "schedule", id: s.id, label: `${s.name} (repeat billing, before GST)`, due: d, amount: each });
    }
  }

  const { rows: bills } = await client.query(
    `SELECT b.id, b.bill_no, c.name, COALESCE(b.due_date, b.issue_date + 30)::text AS due,
            b.gross_laari - COALESCE((SELECT SUM(p.amount_laari) FROM payment_items p WHERE p.bill_id = b.id), 0) AS owed
       FROM bills b JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND b.fc_gross IS NULL AND COALESCE(b.due_date, b.issue_date + 30) <= $2`,
    [companyId, until]
  );
  const outParts = bills.filter((b) => big(b.owed) > 0n).map((b) => ({ kind: "bill", id: b.id, label: `${b.name}${b.bill_no ? ` ${b.bill_no}` : ""}`, due: b.due, amount: big(b.owed) }));
  const claims = require("./claims");
  const { rows: cl } = await client.query("SELECT id FROM expense_claims WHERE company_id = $1 AND approved_at IS NOT NULL AND rejected_at IS NULL", [companyId]);
  for (const r of cl) {
    const c = claims.show(await claims.load(client, { companyId, claimId: r.id }));
    const owed = big(c.owed.replace(/[,.]/g, ""));
    if (owed > 0n) outParts.push({ kind: "claim", id: c.id, label: `${c.number}, owed to ${c.claimant}`, due: today, amount: owed });
  }
  const orders = require("./orders");
  const { rows: po } = await client.query(
    "SELECT id FROM orders WHERE company_id = $1 AND kind = 'purchase' AND cancelled_at IS NULL AND closed_at IS NULL AND (NOT needs_approval OR approved_at IS NOT NULL)",
    [companyId]
  );
  for (const r of po) {
    const s = await orders.load(client, { companyId, orderId: r.id });
    const open = s.lines.reduce((a, l) => a + (l.units > l.billedUnits ? (l.price * (l.units - l.billedUnits) + 5000n) / 10000n : 0n), 0n);
    if (open > 0n) outParts.push({ kind: "order", id: s.order.id, label: `${s.order.number} to ${s.order.party} (ordered, not yet billed)`, due: s.order.expected_on ? String(s.order.expected_on).slice(0, 10) : null, amount: open });
  }
  for (const l of await require("./loans").list(client, { companyId })) {
    if (l.lent || !l.next || l.next.due > until) continue;
    outParts.push({ kind: "loan", id: l.id, label: `${l.name} instalment`, due: l.next.due, amount: big(l.next.payment.replace(/[,.]/g, "")) });
  }

  const sum = (parts) => parts.reduce((a, p) => a + p.amount, 0n);
  const show = (parts) => parts.sort((a, b) => (b.amount > a.amount ? 1 : -1)).map((p) => ({ ...p, amount: f(p.amount) }));
  const cashNow = big(cash.b);
  const expectedIn = sum(inParts);
  const committedOut = sum(outParts);
  return {
    asOf: today,
    until,
    cash: f(cashNow),
    expectedIn: f(expectedIn),
    committedOut: f(committedOut),
    forecast: f(cashNow + expectedIn - committedOut),
    short: cashNow + expectedIn - committedOut < 0n,
    inParts: show(inParts),
    outParts: show(outParts),
    raw: { cash: cashNow, expectedIn, committedOut },
  };
}

// ------------------------------------------------------------------ the profile

async function profile(client, { companyId, today }) {
  const from = plus(today, -365);
  const byType = async (type) =>
    (
      await client.query(
        `SELECT a.id, a.code, a.name, SUM(${type === "income" ? "l.credit_laari - l.debit_laari" : "l.debit_laari - l.credit_laari"}) AS v
           FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
          WHERE a.company_id = $1 AND a.type = $2 AND e.entry_date BETWEEN $3 AND $4
          GROUP BY a.id HAVING SUM(l.debit_laari + l.credit_laari) > 0 ORDER BY 4 DESC`,
        [companyId, type, from, today]
      )
    ).rows.map((r) => ({ id: r.id, code: r.code, name: r.name, value: big(r.v) }));
  const income = await byType("income");
  const costs = await byType("expense");
  const revenue = income.reduce((a, r) => a + r.value, 0n);
  const spent = costs.reduce((a, r) => a + r.value, 0n);
  const cogs = costs.find((c) => c.code === "5050")?.value || 0n;
  const pct = (a, b) => (b > 0n ? Number((a * 1000n) / b) / 10 : null);

  const top = async (sql) => (await client.query(sql, [companyId, from, today])).rows.map((r) => ({ name: r.name, value: big(r.v) }));
  const customers = await top(
    `SELECT c.name, SUM(s.net_laari) AS v FROM sales_invoices s JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND s.issue_date BETWEEN $2 AND $3 GROUP BY c.name ORDER BY 2 DESC LIMIT 5`
  );
  const suppliers = await top(
    `SELECT c.name, SUM(b.net_laari) AS v FROM bills b JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND b.issue_date BETWEEN $2 AND $3 GROUP BY c.name ORDER BY 2 DESC LIMIT 5`
  );
  const { rows: months } = await client.query(
    `SELECT to_char(e.entry_date, 'YYYY-MM') AS m, SUM(l.credit_laari - l.debit_laari) AS v
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.company_id = $1 AND a.type = 'income' AND e.entry_date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1`,
    [companyId, from, today]
  );
  const loansList = (await require("./loans").list(client, { companyId })).filter((l) => !l.lent);
  const borrowed = loansList.reduce((a, l) => a + big(l.owed.replace(/[,.]/g, "")), 0n);
  const interest = costs.filter((c) => /^583/.test(c.code)).reduce((a, c) => a + c.value, 0n);
  const { rows: notes } = await client.query("SELECT topic, note, written_at FROM cfo_notes WHERE company_id = $1 ORDER BY topic", [companyId]);
  const monthsOfBooks = (await one(client, "SELECT count(DISTINCT to_char(entry_date, 'YYYY-MM'))::int AS n FROM journal_entries WHERE company_id = $1", [companyId])).n;

  // Suppliers as a share of everything billed (bills carry stock and assets too, not only costs).
  const billed = big((await one(client, "SELECT COALESCE(SUM(net_laari), 0) AS v FROM bills WHERE company_id = $1 AND status = 'posted' AND voided_at IS NULL AND issue_date BETWEEN $2 AND $3", [companyId, from, today])).v);
  const monthly = months.map((m) => ({ month: m.m, revenue: big(m.v) }));
  const sorted = [...monthly].filter((m) => m.revenue > 0n).sort((a, b) => (b.revenue > a.revenue ? 1 : -1));
  return {
    from,
    to: today,
    monthsOfBooks,
    revenue: f(revenue),
    costs: f(spent),
    profit: f(revenue - spent),
    // Only where goods sold are a real part of the business: for a firm that sells its work, it says nothing.
    grossMarginPercent: cogs > 0n && cogs * 20n >= revenue ? pct(revenue - cogs, revenue) : null,
    sells: income.slice(0, 5).map((r) => ({ name: r.name, value: f(r.value), share: pct(r.value, revenue) })),
    customers: customers.map((c) => ({ name: c.name, value: f(c.value), share: pct(c.value, revenue) })),
    suppliers: suppliers.map((s) => ({ name: s.name, value: f(s.value), share: pct(s.value, billed) })),
    costStructure: costs.slice(0, 8).map((c) => ({ accountId: c.id, name: c.name, value: f(c.value), share: pct(c.value, spent) })),
    busiest: sorted[0] ? { month: sorted[0].month, revenue: f(sorted[0].revenue) } : null,
    quietest: sorted.length > 1 ? { month: sorted[sorted.length - 1].month, revenue: f(sorted[sorted.length - 1].revenue) } : null,
    monthly: monthly.map((m) => ({ month: m.month, revenue: f(m.revenue) })),
    financing: { loans: loansList.length, owed: f(borrowed), interestLastYear: f(interest), interestShareOfRevenue: pct(interest, revenue) },
    notes: notes.map((n) => ({ topic: n.topic, note: n.note, writtenAt: n.written_at })),
    raw: { revenue, spent, customers, costs, interest },
  };
}

// ------------------------------------------------------------------ what it noticed

async function noticed(client, { companyId, today }) {
  const out = [];
  const weekStart = plus(today, -6);
  const before = plus(today, -90);

  // A kind of cost running at twice its usual week.
  const { rows: spend } = await client.query(
    `SELECT a.id, a.name,
            SUM(CASE WHEN e.entry_date >= $2 THEN l.debit_laari - l.credit_laari ELSE 0 END) AS week,
            SUM(CASE WHEN e.entry_date < $2 THEN l.debit_laari - l.credit_laari ELSE 0 END) AS prior
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.company_id = $1 AND a.type = 'expense' AND e.entry_date BETWEEN $3 AND $4 AND e.reverses_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_id = e.id)
      GROUP BY a.id`,
    [companyId, weekStart, before, today]
  );
  for (const r of spend) {
    const week = big(r.week);
    const usual = big(r.prior) / 12n; // twelve weeks before this one
    if (week >= 100000n && usual > 0n && week >= usual * 2n) {
      const { rows: e } = await client.query(
        `SELECT DISTINCT e.entry_no FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE l.account_id = $1 AND e.entry_date >= $2 ORDER BY 1 DESC LIMIT 12`,
        [r.id, weekStart]
      );
      out.push({
        kind: "spend", title: `${r.name}: MVR ${f(week)} this week`,
        detail: `About ${Number((week * 10n) / usual) / 10} times a usual week (MVR ${f(usual)} over the twelve before). Worth a look before month end.`,
        entries: e.map((x) => String(x.entry_no)), accountId: r.id,
      });
    }
  }

  // A bill far above what that supplier usually charges.
  const { rows: bills } = await client.query(
    `SELECT b.id, b.bill_no, b.gross_laari, c.name,
            (SELECT AVG(p.gross_laari) FROM bills p WHERE p.company_id = b.company_id AND p.counterparty_id = b.counterparty_id AND p.id <> b.id AND p.status = 'posted' AND p.issue_date < b.issue_date) AS usual,
            (SELECT count(*) FROM bills p WHERE p.company_id = b.company_id AND p.counterparty_id = b.counterparty_id AND p.id <> b.id AND p.status = 'posted' AND p.issue_date < b.issue_date) AS n
       FROM bills b JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.company_id = $1 AND b.status = 'posted' AND b.issue_date >= $2`,
    [companyId, weekStart]
  );
  for (const b of bills) {
    const usual = b.usual === null ? 0n : big(Math.round(Number(b.usual)));
    if (Number(b.n) >= 3 && usual > 0n && big(b.gross_laari) >= usual * 2n) {
      out.push({
        kind: "bill", title: `${b.name}${b.bill_no ? ` ${b.bill_no}` : ""}: MVR ${f(big(b.gross_laari))}`,
        detail: `Their bills are usually about MVR ${f(usual)}. Check the quantity and the price before paying it.`, billId: b.id,
      });
    }
  }

  // Customers who owe from more than sixty days ago.
  const { rows: late } = await client.query(
    `SELECT c.name, count(*)::int AS n, SUM(x.owed) AS owed FROM (
       SELECT s.counterparty_id,
              s.gross_laari - COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = s.id), 0)
                            - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = s.id), 0) AS owed
         FROM sales_invoices s
        WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND s.fc_gross IS NULL AND COALESCE(s.due_date, s.issue_date + 30) < $2
     ) x JOIN counterparties c ON c.id = x.counterparty_id WHERE x.owed > 0 GROUP BY c.name ORDER BY 3 DESC LIMIT 3`,
    [companyId, plus(today, -60)]
  );
  for (const l of late) {
    out.push({ kind: "late", title: `${l.name} owes MVR ${f(big(l.owed))} from over sixty days ago`, detail: `${l.n} ${l.n === 1 ? "invoice" : "invoices"}. The longer it waits, the less likely it is paid; a call this week is worth more than a letter next month.`, customer: l.name });
  }
  return out;
}

// ------------------------------------------------------------------ the market, in this company's figures

/**
 * A rate the company records (from bills in another currency, or entered on
 * Bank) that has moved over the last week, applied to what the company owes
 * or is owed in that currency. Sourced and dated.
 */
async function market(client, { companyId, today }) {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (currency) currency, rate, on_date::text AS on, source FROM exchange_rates
      WHERE company_id = $1 AND on_date <= $2 ORDER BY currency, on_date DESC, created_at DESC`,
    [companyId, today]
  );
  const notes = [];
  for (const r of rows) {
    const cur = r.currency.trim();
    const before = await one(
      client,
      `SELECT rate, on_date::text AS on FROM exchange_rates WHERE company_id = $1 AND currency = $2 AND on_date <= $3 ORDER BY on_date DESC, created_at DESC LIMIT 1`,
      [companyId, cur, plus(r.on, -7)]
    );
    const exposure = await one(
      client,
      `SELECT COALESCE(SUM(b.fc_gross), 0) AS owe FROM bills b WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND trim(b.currency) = $2 AND b.fc_gross IS NOT NULL`,
      [companyId, cur]
    );
    const owe = big(exposure.owe);
    if (!before || Number(before.rate) === Number(r.rate)) {
      notes.push({ currency: cur, rate: String(Number(r.rate)), on: r.on, source: r.source || "recorded in Sentryfi", moved: false, text: `${cur} stands at ${Number(r.rate)} (${r.on}).` });
      continue;
    }
    const delta = Number(r.rate) - Number(before.rate);
    const effect = big(Math.round((Number(owe) / 100) * delta * 100));
    notes.push({
      currency: cur, rate: String(Number(r.rate)), on: r.on, was: String(Number(before.rate)), wasOn: before.on, source: r.source || "recorded in Sentryfi", moved: true,
      text:
        `${cur} moved from ${Number(before.rate)} (${before.on}) to ${Number(r.rate)} (${r.on}).` +
        (owe > 0n ? ` On the ${cur} ${f(owe)} of bills in ${cur}, that is about MVR ${f(effect < 0n ? -effect : effect)} ${effect > 0n ? "more" : "less"} to pay in rufiyaa.` : ""),
    });
  }
  return notes;
}

// ------------------------------------------------------------------ the brief

async function changedSince(client, { companyId, today }) {
  const y = plus(today, -1);
  const money = await one(
    client,
    `SELECT COALESCE(SUM(l.debit_laari), 0) AS came, COALESCE(SUM(l.credit_laari), 0) AS went FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.company_id = $1 AND a.type = 'asset' AND (a.code LIKE '11%' OR a.code LIKE '12%') AND e.entry_date = $2
        AND NOT EXISTS (SELECT 1 FROM journal_lines o JOIN accounts oa ON oa.id = o.account_id WHERE o.entry_id = e.id AND o.id <> l.id AND (oa.code LIKE '11%' OR oa.code LIKE '12%'))`,
    [companyId, y]
  );
  const inv = await one(client, "SELECT count(*)::int AS n, COALESCE(SUM(gross_laari), 0) AS v FROM sales_invoices WHERE company_id = $1 AND status = 'posted' AND issue_date = $2", [companyId, y]);
  const bl = await one(client, "SELECT count(*)::int AS n, COALESCE(SUM(gross_laari), 0) AS v FROM bills WHERE company_id = $1 AND voided_at IS NULL AND created_at::date = $2", [companyId, y]);
  const lines = [];
  if (big(money.came) > 0n) lines.push(`MVR ${f(big(money.came))} came in to the bank and tins.`);
  if (big(money.went) > 0n) lines.push(`MVR ${f(big(money.went))} went out.`);
  if (inv.n) lines.push(`${inv.n} ${inv.n === 1 ? "invoice" : "invoices"} went out, MVR ${f(big(inv.v))}.`);
  if (bl.n) lines.push(`${bl.n} ${bl.n === 1 ? "bill was" : "bills were"} recorded, MVR ${f(big(bl.v))}.`);
  return { on: y, lines: lines.length ? lines : ["Nothing moved in the books yesterday."] };
}

async function toDo(client, { companyId, today }, figs) {
  const out = [];
  const payNow = figs.outParts.filter((p) => p.kind === "bill" && p.due <= plus(today, 7));
  if (payNow.length) {
    const total = payNow.reduce((a, p) => a + big(p.amount.replace(/[,.]/g, "")), 0n);
    out.push({ text: `Pay ${payNow.length} ${payNow.length === 1 ? "bill" : "bills"} due this week, MVR ${f(total)}.`, href: "/payments" });
  }
  const chase = figs.inParts.filter((p) => p.kind === "invoice" && p.due < today).slice(0, 3);
  for (const c of chase) out.push({ text: `Chase ${c.label}: MVR ${c.amount}, due ${c.due}.`, href: "/invoices" });
  const waiting = await one(
    client,
    `SELECT (SELECT count(*) FROM orders WHERE company_id = $1 AND kind = 'purchase' AND needs_approval AND approved_at IS NULL AND cancelled_at IS NULL)
          + (SELECT count(*) FROM expense_claims WHERE company_id = $1 AND submitted_at IS NOT NULL AND approved_at IS NULL AND rejected_at IS NULL) AS n`,
    [companyId]
  );
  if (Number(waiting.n) > 0) out.push({ text: `${waiting.n} ${Number(waiting.n) === 1 ? "thing waits" : "things wait"} for approval.`, href: "/approvals" });
  if (figs.short) out.push({ text: `Over the next 30 days more goes out than is in hand and coming in: MVR ${figs.forecast}. Decide now what waits.`, href: "/cfo" });
  return out.length ? out : [{ text: "Nothing needs doing today. A good day to chase what is owed before it is late.", href: "/invoices" }];
}

/** One thing learned about the business, a different one each day. */
function lesson(p, today) {
  const facts = [];
  const r = p.raw;
  if (r.costs[0] && r.spent > 0n) facts.push(`${r.costs[0].name} is your biggest cost: ${Math.round(Number((r.costs[0].value * 1000n) / r.spent) / 10)}% of everything spent in the last year.`);
  if (r.customers[0] && r.revenue > 0n) {
    const share = Math.round(Number((r.customers[0].value * 1000n) / r.revenue) / 10);
    facts.push(share >= 40 ? `${r.customers[0].name} brings ${share}% of your revenue. If they paid late or left, you would feel it at once; a second customer that size is worth chasing.` : `Your largest customer, ${r.customers[0].name}, is ${share}% of revenue: no single customer holds you.`);
  }
  if (p.busiest && p.quietest) facts.push(`Your busiest month in the last year was ${p.busiest.month} (MVR ${p.busiest.revenue}), your quietest ${p.quietest.month} (MVR ${p.quietest.revenue}). Plan cash for the quiet one.`);
  if (p.grossMarginPercent !== null) facts.push(`What you sell earns ${p.grossMarginPercent}% over what it cost you.`);
  if (r.interest > 0n && r.revenue > 0n) facts.push(`Borrowing cost you MVR ${f(r.interest)} in the last year, ${Math.round(Number((r.interest * 1000n) / r.revenue) / 10)}% of revenue.`);
  if (!facts.length) return "The more months of books there are, the more this can tell you. Every bill and invoice teaches it something.";
  const day = Math.floor(Date.parse(today + "T00:00:00Z") / DAY);
  return facts[day % facts.length];
}

/** An optional written summary from Claude, given only the facts above. */
async function writeUp(facts) {
  // Read straight from the environment: the rest of the CFO needs no server settings.
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CFO_MODEL || "claude-haiku-4-5-20251001";
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: model,
        max_tokens: 400,
        system:
          "You are the finance adviser inside a small company's books. Using only the facts given (never invent a figure, name or date), " +
          'write JSON {"summary": "two plain sentences on where the business stands this morning", "advice": ["one or two specific actions, each naming a figure from the facts"]}. ' +
          "Plain English, no jargon, no hedging words, no exclamation marks. If the facts are thin, say so in the summary.",
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      }),
    });
    if (!r.ok) throw new Error(`Claude answered ${r.status}`);
    const text = (await r.json()).content?.[0]?.text || "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { summary: String(parsed.summary || ""), advice: (parsed.advice || []).map(String).slice(0, 3), by: model };
  } catch (err) {
    console.error(JSON.stringify({ at: "cfo-writeup", error: err.message }));
    return null;
  }
}

/** Today's brief: made once a day, then read by everyone. `fresh` makes it again. */
async function brief(client, { companyId, today = todayHere(), fresh = false }) {
  if (!fresh) {
    const kept = await one(client, "SELECT body FROM cfo_briefs WHERE company_id = $1 AND for_date = $2", [companyId, today]);
    if (kept) return kept.body;
  }
  const figs = await figures(client, { companyId, today });
  const p = await profile(client, { companyId, today });
  const seen = await noticed(client, { companyId, today });
  const mk = await market(client, { companyId, today });
  const changed = await changedSince(client, { companyId, today });
  const todo = await toDo(client, { companyId, today }, figs);
  const moved = mk.filter((m) => m.moved);
  const body = {
    forDate: today,
    headline: `Cash MVR ${figs.cash}. Over the next 30 days MVR ${figs.expectedIn} is due in and MVR ${figs.committedOut} is due out, which leaves MVR ${figs.forecast}.`,
    short: figs.short,
    figures: { cash: figs.cash, expectedIn: figs.expectedIn, committedOut: figs.committedOut, forecast: figs.forecast },
    changed,
    todo,
    noticed: seen.slice(0, 3),
    market: moved[0] || null,
    marketQuiet: moved.length
      ? null
      : mk.length
        ? `The rates you record have not moved this week: ${mk.map((m) => m.text.replace(/.$/, "")).join("; ")}.`
        : "No market note yet: Sentryfi reads the rates you record, and outside prices (fuel, freight, MMA rates) come when their sources are chosen.",
    learned: lesson(p, today),
  };
  body.written = await writeUp({
    today, cash: figs.cash, expectedIn30: figs.expectedIn, committedOut30: figs.committedOut, forecast30: figs.forecast,
    changedYesterday: changed.lines, toDo: todo.map((t) => t.text), noticed: seen.map((s) => `${s.title}. ${s.detail}`),
    market: moved.map((m) => m.text), learned: body.learned,
  });
  await client.query(
    `INSERT INTO cfo_briefs (company_id, for_date, body) VALUES ($1,$2,$3)
     ON CONFLICT (company_id, for_date) DO UPDATE SET body = EXCLUDED.body, created_at = now()`,
    [companyId, today, JSON.stringify(body)]
  );
  return body;
}

/** The brief as a few plain lines, for an email or for reading aloud. */
function asText(b) {
  return [
    b.headline,
    ...(b.written?.summary ? [b.written.summary] : []),
    "Yesterday: " + b.changed.lines.join(" "),
    "Today: " + b.todo.map((t) => t.text).join(" "),
    ...(b.noticed.length ? ["Noticed: " + b.noticed.map((n) => `${n.title}. ${n.detail}`).join(" ")] : []),
    b.market ? `The market: ${b.market.text} (${b.market.source}, ${b.market.on})` : b.marketQuiet,
    "Learned: " + b.learned,
  ];
}

module.exports = { todayHere, figures, profile, noticed, market, brief, asText, lesson, plus };
