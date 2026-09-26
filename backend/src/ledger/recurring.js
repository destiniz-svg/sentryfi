/**
 * Repeat billing: an invoice raised on a schedule — rent, a maintenance
 * contract, equipment on long hire. Each schedule keeps its customer, its
 * lines and how often; when its date comes round the invoice is raised (and
 * put in the books, if it says so), and the date moves on. Months keep their
 * day: a schedule on the 31st bills on the last day of shorter months and
 * comes back to the 31st when it can.
 *
 * A bill repeats the same way (rent, internet): its schedule keeps the
 * supplier and each line's kind of cost, and drafts the bill on its date for
 * a person to check and put in the books. A bill is never posted by itself.
 *
 * Raised by the hourly job (server.js) and whenever someone opens the
 * company's Needs you, so a missed hour never means a missed invoice. A date
 * that is weeks overdue raises each missed invoice in turn, up to a year's.
 */
const { assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { niceDate } = require("./gstReturn");
const sales = require("./sales");
const { today: localToday } = require("./today");
const billSplit = require("./billSplit");
const { splitTax } = require("./bills");
const taxEngine = require("./tax");

const lineTotal = (l) => (toLaari(l.unitPrice) * BigInt(Math.round(Number(l.quantity) * 10000)) + 5000n) / 10000n;

const EVERY = { week: "every week", month: "every month", quarter: "every three months", year: "every year" };

/** The next date after `iso`, keeping the schedule's own day of the month. */
function nextDate(iso, every, day) {
  const [y, m, d] = iso.split("-").map(Number);
  if (every === "week") return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const months = { month: 1, quarter: 3, year: 12 }[every];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}

async function create(client, { companyId, userId, kind = "sale", counterpartyId, name, lines, gstTreatment = "exclusive", every, startsOn, endsOn, postAutomatically = false, projectId }) {
  await assumeIdentity(client, { companyId, userId });
  if (!EVERY[every]) throw new Error("How often: every week, month, three months or year?");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startsOn || ""))) throw new Error("From which date?");
  if (!lines?.length) throw new Error("What is billed each time?");
  const { rows: p } = await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [counterpartyId, companyId]);
  if (!p.length) throw new Error(kind === "bill" ? "That supplier is not in these books." : "That customer is not in these books.");
  if (kind === "bill") {
    postAutomatically = false;
    for (const l of lines) {
      const { rows } = await client.query("SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'expense'", [l.accountId || null, companyId]);
      if (!rows.length) throw new Error("Which kind of cost is each line?");
    }
  }
  if (projectId) {
    const { rows } = await client.query("SELECT 1 FROM projects WHERE id = $1 AND company_id = $2", [projectId, companyId]);
    if (!rows.length) throw new Error("That project is not in these books.");
  }
  const clean = lines.map((l) => {
    if (!String(l.description || "").trim()) throw new Error("Each line says what it is for.");
    const q = Number(l.quantity ?? 1);
    if (!(q > 0)) throw new Error("A line's quantity is above zero.");
    return { description: String(l.description).trim(), quantity: q, uom: l.uom ? String(l.uom).trim().slice(0, 20) : null, unitPrice: formatLaari(toLaari(l.unitPrice)).replace(/,/g, ""), ...(kind === "bill" ? { accountId: l.accountId } : {}) };
  });
  const { rows } = await client.query(
    `INSERT INTO recurring_invoices (company_id, counterparty_id, name, lines, gst_treatment, every, next_on, anchor_day, ends_on, post_automatically, project_id, created_by, kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [companyId, counterpartyId, String(name || "").trim() || clean[0].description, JSON.stringify(clean), gstTreatment, every, startsOn, Number(startsOn.slice(8, 10)), endsOn || null, Boolean(postAutomatically), projectId || null, userId, kind]
  );
  return rows[0].id;
}

/** Raises every invoice whose date has come, and moves each schedule on. */
async function runDue(client, { companyId, userId, today }) {
  await assumeIdentity(client, { companyId, userId });
  const on = today || localToday();
  const { rows } = await client.query(
    `SELECT *, next_on::text AS next_text, ends_on::text AS ends_text FROM recurring_invoices WHERE company_id = $1 AND paused_at IS NULL AND next_on <= $2 AND (ends_on IS NULL OR next_on <= ends_on)
     ORDER BY next_on FOR UPDATE SKIP LOCKED`,
    [companyId, on]
  );
  const raised = [];
  for (const r of rows) {
    // Dates as text from the database: a Date would be local midnight, a day early east of Greenwich.
    let next = r.next_text;
    for (let i = 0; i < 53 && next <= on && (!r.ends_text || next <= r.ends_text); i++) {
      if (r.kind === "bill") {
        const bill = await draftBill(client, { companyId, userId, r, on: next });
        raised.push({ kind: "bill", scheduleId: r.id, billId: bill.id, on: next, posted: false });
        next = nextDate(next, r.every, r.anchor_day);
        continue;
      }
      const { invoice } = await sales.raise(client, {
        companyId, userId, counterpartyId: r.counterparty_id, issueDate: next, gstTreatment: r.gst_treatment, projectId: r.project_id,
        subject: `${r.name}, from ${niceDate(next)}`,
        lines: r.lines,
      });
      await client.query("UPDATE sales_invoices SET recurring_id = $2 WHERE id = $1", [invoice.id, r.id]);
      if (r.post_automatically) await sales.post(client, { companyId, userId, invoiceId: invoice.id });
      raised.push({ kind: "sale", scheduleId: r.id, invoiceId: invoice.id, invoiceNo: invoice.invoice_no, on: next, posted: r.post_automatically });
      next = nextDate(next, r.every, r.anchor_day);
    }
    await client.query("UPDATE recurring_invoices SET next_on = $2, last_run_at = now() WHERE id = $1", [r.id, next]);
  }
  return raised;
}

/** A schedule's bill, drafted and split onto its kinds of cost, for a person to check and post. */
async function draftBill(client, { companyId, userId, r, on }) {
  const net = r.lines.reduce((a, l) => a + lineTotal(l), 0n);
  const rate = await taxEngine.rateForDocument(client, { companyId, on, treatment: r.gst_treatment });
  const split = splitTax(formatLaari(net).replace(/,/g, ""), r.gst_treatment, rate);
  const { rows } = await client.query(
    `INSERT INTO bills (company_id, counterparty_id, issue_date, net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp, project_id, received_by, status, recurring_id, currency)
     VALUES ($1,$2,$3,$4,$5,$6,$7::gst_t,$8,$9,$10,'draft',$11,(SELECT base_currency FROM companies WHERE id = $1)) RETURNING id`,
    [companyId, r.counterparty_id, on, split.net.toString(), split.tax.toString(), split.gross.toString(), r.gst_treatment, rate, r.project_id, userId, r.id]
  );
  await billSplit.save(client, {
    companyId, userId, billId: rows[0].id,
    lines: r.lines.map((l) => ({ kind: "cost", description: `${l.description}, from ${niceDate(on)}`, accountId: l.accountId, amount: formatLaari(lineTotal(l)).replace(/,/g, "") })),
  });
  return rows[0];
}

async function list(client, { companyId, kind = "sale" }) {
  const { rows } = await client.query(
    `SELECT r.*, r.next_on::text AS next_text, r.ends_on::text AS ends_text, c.name AS customer,
            (SELECT count(*)::int FROM sales_invoices s WHERE s.recurring_id = r.id) + (SELECT count(*)::int FROM bills b WHERE b.recurring_id = r.id) AS raised
       FROM recurring_invoices r JOIN counterparties c ON c.id = r.counterparty_id
      WHERE r.company_id = $1 AND r.kind = $2 ORDER BY r.next_on`,
    [companyId, kind]
  );
  return rows.map((r) => {
    const each = r.lines.reduce((a, l) => a + lineTotal(l), 0n);
    return {
      id: r.id, name: r.name, customer: r.customer, every: r.every, everyText: EVERY[r.every], nextOn: r.next_text, endsOn: r.ends_text,
      each: formatLaari(each), postAutomatically: r.post_automatically, paused: Boolean(r.paused_at), raised: r.raised,
      finished: Boolean(r.ends_text && r.next_text > r.ends_text),
    };
  });
}

async function pause(client, { companyId, userId, id, paused }) {
  await assumeIdentity(client, { companyId, userId });
  const { rowCount } = await client.query(`UPDATE recurring_invoices SET paused_at = ${paused ? "now()" : "NULL"} WHERE id = $1 AND company_id = $2`, [id, companyId]);
  if (!rowCount) throw new Error("That schedule is not in these books.");
}

module.exports = { EVERY, nextDate, create, runDue, list, pause };
