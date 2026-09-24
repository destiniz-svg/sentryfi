/**
 * Emails to customers that go by themselves, each at most once:
 *
 *   - the month's statement, early in each month (the 1st to the 5th, so a
 *     day the server was down is caught up), to every customer who owes
 *     something and has an email address;
 *   - a reminder when an invoice is late, on each of the company's reminder
 *     days after its due date (3, 14 and 30 unless changed). A reminder day
 *     missed is not sent late; only the latest one reached goes.
 *
 * Both are off until the company turns them on. Each carries a private link
 * to the customer's page. This file works out what is due, inside the walls;
 * routes/customerMail.js makes the links and sends.
 */
const { formatLaari } = require("./money");
const { today: localToday } = require("./today");

async function settings(client, { companyId }) {
  const { rows } = await client.query("SELECT monthly_statements, reminders, reminder_days FROM customer_mail_settings WHERE company_id = $1", [companyId]);
  const r = rows[0] || { monthly_statements: false, reminders: false, reminder_days: [3, 14, 30] };
  return { monthlyStatements: r.monthly_statements, reminders: r.reminders, reminderDays: r.reminder_days };
}

async function save(client, { companyId, userId, monthlyStatements, reminders, reminderDays }) {
  const days = [...new Set((reminderDays || [3, 14, 30]).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 180))].sort((a, b) => a - b);
  if (!days.length) throw new Error("Give at least one day, from 1 to 180 days after the due date.");
  if (days.length > 6) throw new Error("Six reminders at most.");
  await client.query(
    `INSERT INTO customer_mail_settings (company_id, monthly_statements, reminders, reminder_days, updated_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (company_id) DO UPDATE SET monthly_statements = $2, reminders = $3, reminder_days = $4, updated_by = $5, updated_at = now()`,
    [companyId, Boolean(monthlyStatements), Boolean(reminders), days, userId]
  );
  return settings(client, { companyId });
}

/** Every posted invoice with something still to pay, in the company's own currency. */
async function open(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT s.id, s.invoice_no, s.counterparty_id, s.due_date::text AS due, c.name, c.email,
            s.gross_laari - COALESCE((SELECT SUM(x.amount_laari) FROM receipt_allocations x JOIN receipts r ON r.id = x.receipt_id AND r.voided_at IS NULL WHERE x.invoice_id = s.id), 0)
                         - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = s.id), 0) AS owed
       FROM sales_invoices s JOIN counterparties c ON c.id = s.counterparty_id
      WHERE s.company_id = $1 AND s.status = 'posted' AND s.voided_at IS NULL`,
    [companyId]
  );
  return rows.filter((r) => BigInt(r.owed) > 0n);
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** What should go today, less what has gone already. */
async function due(client, { companyId, on = localToday() }) {
  const s = await settings(client, { companyId });
  const { rows: sent } = await client.query("SELECT key FROM customer_mail_log WHERE company_id = $1", [companyId]);
  const done = new Set(sent.map((r) => r.key));
  const invoices = await open(client, { companyId });
  const out = { statements: [], reminders: [] };
  const day = Number(on.slice(8, 10));
  if (s.monthlyStatements && day <= 5) {
    const month = on.slice(0, 7);
    const byParty = new Map();
    for (const i of invoices) {
      const p = byParty.get(i.counterparty_id) || { counterpartyId: i.counterparty_id, name: i.name, email: i.email, owed: 0n, invoices: 0 };
      p.owed += BigInt(i.owed);
      p.invoices += 1;
      byParty.set(i.counterparty_id, p);
    }
    for (const p of byParty.values()) {
      const key = `statement:${p.counterpartyId}:${month}`;
      if (p.email && !done.has(key)) out.statements.push({ ...p, key, owed: formatLaari(p.owed), month });
    }
  }
  if (s.reminders) {
    for (const i of invoices) {
      if (!i.due || !i.email) continue;
      const late = daysBetween(i.due, on);
      const step = [...s.reminderDays].reverse().find((d) => late >= d);
      if (!step) continue;
      const key = `reminder:${i.id}:${step}`;
      if (!done.has(key)) out.reminders.push({ key, invoiceId: i.id, number: i.invoice_no, counterpartyId: i.counterparty_id, name: i.name, email: i.email, owed: formatLaari(BigInt(i.owed)), due: i.due, daysLate: late });
    }
  }
  return out;
}

async function logSent(client, { companyId, key, kind, counterpartyId, invoiceId, to }) {
  await client.query(
    "INSERT INTO customer_mail_log (company_id, key, kind, counterparty_id, invoice_id, sent_to) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (company_id, key) DO NOTHING",
    [companyId, key, kind, counterpartyId || null, invoiceId || null, to]
  );
}

async function recent(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT l.kind, l.sent_to, l.sent_at, c.name AS customer, s.invoice_no
       FROM customer_mail_log l LEFT JOIN counterparties c ON c.id = l.counterparty_id LEFT JOIN sales_invoices s ON s.id = l.invoice_id
      WHERE l.company_id = $1 ORDER BY l.sent_at DESC LIMIT 20`,
    [companyId]
  );
  return rows.map((r) => ({ kind: r.kind, to: r.sent_to, at: r.sent_at, customer: r.customer, invoiceNo: r.invoice_no }));
}

module.exports = { settings, save, due, logSent, recent };
