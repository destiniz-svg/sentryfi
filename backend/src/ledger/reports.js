/**
 * The everyday reports: who bought, what sold, who we bought from, where the
 * money went, and what came in and went out, over any dates. Each is one
 * query over what is in the books (posted, not voided), returned as columns
 * and rows so one screen draws them all and one button downloads them.
 */
const { formatLaari } = require("./money");

const f = (v) => formatLaari(BigInt(v || 0));
const money = (key, label) => ({ key, label, money: true });

const REPORTS = {
  "sales-by-customer": {
    title: "Sales by customer",
    about: "What each customer was invoiced, less what was credited back.",
    columns: [{ key: "name", label: "Customer" }, { key: "count", label: "Invoices", num: true }, money("net", "Before tax"), money("tax", "Tax"), money("credited", "Credited"), money("total", "Total")],
    sql: `SELECT COALESCE(c.name, 'No customer') AS name, count(s.id)::int AS count,
                 SUM(s.net_laari) AS net, SUM(s.tax_laari) AS tax,
                 COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.company_id = $1 AND n.counterparty_id IS NOT DISTINCT FROM s.counterparty_id AND n.issue_date BETWEEN $2 AND $3), 0) AS credited,
                 SUM(s.gross_laari) - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.company_id = $1 AND n.counterparty_id IS NOT DISTINCT FROM s.counterparty_id AND n.issue_date BETWEEN $2 AND $3), 0) AS total
            FROM sales_invoices s LEFT JOIN counterparties c ON c.id = s.counterparty_id
           WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND NOT s.opening AND s.issue_date BETWEEN $2 AND $3
           GROUP BY s.counterparty_id, c.name ORDER BY total DESC`,
    totals: ["count", "net", "tax", "credited", "total"],
  },
  "sales-by-item": {
    title: "Sales by item",
    about: "What was sold, how many, and what it earned before tax.",
    columns: [{ key: "name", label: "Item or line" }, { key: "quantity", label: "Quantity", num: true }, { key: "unit", label: "Unit" }, money("net", "Before tax")],
    sql: `SELECT COALESCE(i.name, NULLIF(btrim(l.description), ''), 'Other') AS name, trim(to_char(SUM(l.quantity), 'FM999999990.####'), '.') AS quantity,
                 MAX(COALESCE(l.uom, i.unit)) AS unit, SUM(l.net_laari) AS net
            FROM sales_invoice_lines l JOIN sales_invoices s ON s.id = l.invoice_id
            LEFT JOIN stock_items i ON i.id = l.item_id
           WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL AND NOT s.opening AND s.issue_date BETWEEN $2 AND $3
           GROUP BY COALESCE(i.name, NULLIF(btrim(l.description), ''), 'Other') ORDER BY net DESC`,
    totals: ["net"],
  },
  "purchases-by-supplier": {
    title: "Purchases by supplier",
    about: "What each supplier billed, by the bill's date.",
    columns: [{ key: "name", label: "Supplier" }, { key: "count", label: "Bills", num: true }, money("net", "Before tax"), money("tax", "Tax"), money("total", "Total")],
    sql: `SELECT COALESCE(c.name, 'No supplier') AS name, count(b.id)::int AS count, SUM(b.net_laari) AS net, SUM(b.tax_laari) AS tax, SUM(b.gross_laari) AS total
            FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
           WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND NOT b.opening AND COALESCE(b.issue_date, b.received_at::date) BETWEEN $2 AND $3
           GROUP BY b.counterparty_id, c.name ORDER BY total DESC`,
    totals: ["count", "net", "tax", "total"],
  },
  "expenses-by-account": {
    title: "Expenses by account",
    about: "Where the money went, by the account each cost was put on.",
    columns: [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, money("amount", "Spent")],
    sql: `SELECT a.code, a.name, SUM(l.debit_laari - l.credit_laari) AS amount
            FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
           WHERE l.company_id = $1 AND a.type = 'expense' AND e.entry_date BETWEEN $2 AND $3
           GROUP BY a.code, a.name HAVING SUM(l.debit_laari - l.credit_laari) <> 0 ORDER BY amount DESC`,
    totals: ["amount"],
  },
  "payments-received": {
    title: "Payments received",
    about: "Every payment that came in, and where it landed.",
    columns: [{ key: "on", label: "Date", date: true }, { key: "name", label: "From" }, { key: "account", label: "Into" }, { key: "reference", label: "Reference" }, money("amount", "Amount")],
    sql: `SELECT r.received_on::text AS on, COALESCE(c.name, 'Not named') AS name, a.name AS account, COALESCE(r.reference, '') AS reference, r.amount_laari AS amount
            FROM receipts r LEFT JOIN counterparties c ON c.id = r.counterparty_id JOIN accounts a ON a.id = r.account_id
           WHERE r.company_id = $1 AND r.voided_at IS NULL AND r.received_on BETWEEN $2 AND $3
           ORDER BY r.received_on DESC, r.amount_laari DESC`,
    totals: ["amount"],
  },
  "payments-made": {
    title: "Payments made",
    about: "Every bill and claim paid, from which account.",
    columns: [{ key: "on", label: "Date", date: true }, { key: "name", label: "To" }, { key: "what", label: "For" }, { key: "account", label: "From" }, money("amount", "Amount")],
    sql: `SELECT r.paid_on::text AS on, COALESCE(c.name, u.name, 'Not named') AS name,
                 COALESCE('Bill ' || b.bill_no, 'Claim ' || x.number, CASE WHEN pi.bill_id IS NOT NULL THEN 'Bill' ELSE 'Claim' END) AS what,
                 a.name AS account, pi.amount_laari AS amount
            FROM payment_items pi JOIN payment_runs r ON r.id = pi.run_id AND r.reversed_at IS NULL
            JOIN accounts a ON a.id = r.from_account_id
            LEFT JOIN bills b ON b.id = pi.bill_id LEFT JOIN counterparties c ON c.id = b.counterparty_id
            LEFT JOIN expense_claims x ON x.id = pi.claim_id LEFT JOIN users u ON u.id = x.claimant_id
           WHERE pi.company_id = $1 AND r.paid_on BETWEEN $2 AND $3
           ORDER BY r.paid_on DESC, pi.amount_laari DESC`,
    totals: ["amount"],
  },
};

async function run(client, { companyId, key, from, to }) {
  const r = REPORTS[key];
  if (!r) return null;
  const { rows } = await client.query(r.sql, [companyId, from, to]);
  const moneyKeys = r.columns.filter((c) => c.money).map((c) => c.key);
  const totals = {};
  for (const k of r.totals) totals[k] = moneyKeys.includes(k) ? f(rows.reduce((a, x) => a + BigInt(x[k] || 0), 0n)) : rows.reduce((a, x) => a + Number(x[k] || 0), 0);
  return {
    key,
    title: r.title,
    about: r.about,
    from,
    to,
    columns: r.columns,
    rows: rows.map((x) => Object.fromEntries(r.columns.map((c) => [c.key, c.money ? f(x[c.key]) : x[c.key] ?? ""]))),
    totals,
  };
}

const list = () => Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, about: r.about }));

module.exports = { run, list, REPORTS };
