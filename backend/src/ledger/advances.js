/**
 * Money asked for before the tax invoice: retainer invoices (an amount up
 * front) and proforma invoices (the invoice to come), the money that arrives
 * against them, and using it.
 *
 * A request posts nothing. Money received is held for the customer:
 *
 *   bank                   debit   what came in
 *   2350 customer advances credit  what came in, less its GST
 *   2200 GST owed          credit  the GST inside it (time of supply is payment)
 *
 * Used against a tax invoice, which charges GST on all of it, the advance's
 * GST comes back off and the invoice is paid by that much:
 *
 *   2350 customer advances debit   the part used, less its GST
 *   2200 GST owed          debit   its GST
 *   1300 money owed to us  credit  the part used
 *
 * The invoice's payment is a receipt from 2350, so everything that asks
 * "is this invoice paid" (aging, the portal, statements) already knows.
 * Refunded, it goes back out of a bank account with its GST reversed.
 */
const { postEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { splitTax } = require("./bills");
const sales = require("./sales");
const tax = require("./tax");
const { account } = require("./stock");
const { findOrCreate } = require("./counterparties");

const HELD = ["2350", "Customer advances", "liability"];
const GST = ["2200", "{tax} we owe", "liability"];
const AR = ["1300", "Money owed to us", "asset"];
const PREFIX = { retainer: "RT", proforma: "PF" };
const LABEL = { retainer: "Retainer invoice", proforma: "Proforma invoice" };
const F = (l) => formatLaari(BigInt(l));
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

async function gstAccount(client, companyId) {
  const { rows } = await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = '2200'", [companyId]);
  if (rows[0]) return rows[0].id;
  const w = tax.wordsOf(await tax.packFor(client, { companyId }));
  return account(client, companyId, [GST[0], GST[1].replace("{tax}", w.tax), GST[2]]);
}

async function nextNumber(client, { companyId, kind }) {
  return require("./numbering").next(client, { companyId, kind });
}
// ------------------------------------------------------------------ requests

/** A retainer or proforma invoice: lines priced like an invoice's, posting nothing. */
async function create(client, { companyId, userId, kind, counterpartyId, customerName, issueDate, dueDate, gstTreatment, subject, lines, projectId }) {
  await assumeIdentity(client, { companyId, userId });
  if (!PREFIX[kind]) throw new Error("A request is a retainer or a proforma invoice.");
  if (!Array.isArray(lines) || !lines.length) throw new Error("Say what it is for.");
  let partyId = counterpartyId;
  if (!partyId) {
    if (!String(customerName || "").trim()) throw new Error("Which customer?");
    partyId = (await findOrCreate(client, { companyId, userId, name: customerName, kind: "customer" })).party.id;
  } else {
    const { rows } = await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [partyId, companyId]);
    if (!rows.length) throw new Error("That customer is not in these books.");
  }
  const { rows: co } = await client.query("SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
  const treatment = co[0]?.gst_registered ? gstTreatment || "exclusive" : "none_unregistered";
  const on = issueDate || require("./today").today();
  const bp = await tax.rateForDocument(client, { companyId, on, treatment });
  let net = 0n;
  let tx = 0n;
  const kept = lines.map((l) => {
    const description = String(l.description || "").trim();
    if (!description) throw new Error("Each line says what it is for.");
    const quantity = Number(l.quantity ?? 1);
    if (!(quantity > 0)) throw new Error(`How many ${description}?`);
    const price = toLaari(String(l.unitPrice ?? l.amount ?? 0).replace(/,/g, ""));
    const amount = (price * BigInt(Math.round(quantity * 10000)) + 5000n) / 10000n;
    const s = splitTax(amount, treatment, bp);
    net += s.net;
    tx += s.tax;
    return { description, quantity: String(quantity), unit: l.unit ? String(l.unit).trim() : null, unitPrice: F(price), net: F(s.net), tax: F(s.tax), itemId: l.itemId || null };
  });
  if (net + tx <= 0n) throw new Error("It asks for nothing. Put an amount on it.");
  const number = await nextNumber(client, { companyId, kind });
  const { rows } = await client.query(
    `INSERT INTO advance_requests (company_id, kind, number, counterparty_id, issue_date, due_date, gst_treatment, gst_rate_bp, subject, lines, net_laari, tax_laari, gross_laari, project_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::gst_t,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [companyId, kind, number, partyId, on, dueDate || null, treatment, bp, subject ? String(subject).trim() : null, JSON.stringify(kept), net.toString(), tx.toString(), (net + tx).toString(), projectId || null, userId]
  );
  return rows[0];
}

async function request(client, { companyId, id }) {
  const { rows } = await client.query(
    `SELECT r.*, c.name AS customer, s.invoice_no,
            COALESCE((SELECT SUM(a.amount_laari) FROM customer_advances a WHERE a.request_id = r.id), 0) AS paid
       FROM advance_requests r JOIN counterparties c ON c.id = r.counterparty_id LEFT JOIN sales_invoices s ON s.id = r.invoice_id
      WHERE r.id = $1 AND r.company_id = $2`,
    [id, companyId]
  );
  if (!rows.length) throw new Error("That request is not in these books.");
  return rows[0];
}

const standing = (r) =>
  r.cancelled_at ? "cancelled" : r.invoice_id ? "invoiced" : BigInt(r.paid) >= BigInt(r.gross_laari) ? "paid" : BigInt(r.paid) > 0n ? "part paid" : r.accepted_at ? "accepted" : "open";

function showRequest(r) {
  return {
    id: r.id, kind: r.kind, label: LABEL[r.kind], number: r.number, customer: r.customer, counterpartyId: r.counterparty_id,
    issued: iso(r.issue_date), due: iso(r.due_date), subject: r.subject, treatment: r.gst_treatment, ratePercent: r.gst_rate_bp === null ? null : r.gst_rate_bp / 100,
    lines: r.lines, net: F(r.net_laari), tax: F(r.tax_laari), gross: F(r.gross_laari), paid: F(r.paid),
    status: standing(r), acceptedAt: r.accepted_at, acceptedBy: r.accepted_by, invoiceId: r.invoice_id, invoiceNo: r.invoice_no || null,
  };
}

async function list(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT r.*, c.name AS customer, s.invoice_no,
            COALESCE((SELECT SUM(a.amount_laari) FROM customer_advances a WHERE a.request_id = r.id), 0) AS paid
       FROM advance_requests r JOIN counterparties c ON c.id = r.counterparty_id LEFT JOIN sales_invoices s ON s.id = r.invoice_id
      WHERE r.company_id = $1 ORDER BY r.issue_date DESC, r.created_at DESC LIMIT 200`,
    [companyId]
  );
  return rows.map(showRequest);
}

async function cancel(client, { companyId, id, reason }) {
  const r = await request(client, { companyId, id });
  if (r.invoice_id) throw new Error("Its tax invoice is raised; credit that instead.");
  if (BigInt(r.paid) > 0n) throw new Error("Money has come in against it. Refund or use the money first.");
  await client.query("UPDATE advance_requests SET cancelled_at = now(), cancel_reason = $3 WHERE id = $1 AND company_id = $2", [id, companyId, reason || null]);
}

/** The customer's yes, from their link. */
async function accept(client, { companyId, id, name }) {
  const r = await request(client, { companyId, id });
  if (r.cancelled_at) throw new Error("This has been withdrawn.");
  await client.query("UPDATE advance_requests SET accepted_at = COALESCE(accepted_at, now()), accepted_by = COALESCE(accepted_by, $3) WHERE id = $1 AND company_id = $2", [id, companyId, String(name || "").trim().slice(0, 120) || null]);
}

// ------------------------------------------------------------------ money held

/**
 * Money in, ahead of the tax invoice: against a request, or for a customer
 * with none. Its GST is worked out at the rate on the day it arrived, from the
 * request's treatment (or the company's usual one), as a figure that includes it.
 */
async function receive(client, { companyId, userId, requestId, counterpartyId, amount, receivedOn, accountId, reference }) {
  await assumeIdentity(client, { companyId, userId });
  let party = counterpartyId;
  let treatment = null;
  let label = "Advance";
  if (requestId) {
    const r = await request(client, { companyId, id: requestId });
    if (r.cancelled_at) throw new Error("That request has been withdrawn.");
    if (r.invoice_id) throw new Error("Its tax invoice is raised; record the payment against the invoice.");
    party = r.counterparty_id;
    treatment = r.gst_treatment;
    label = `${LABEL[r.kind]} ${r.number}`;
  }
  if (!party) throw new Error("Which customer paid?");
  const { rows: into } = await client.query("SELECT id, name FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'asset' AND (code LIKE '11%' OR code LIKE '12%')", [accountId, companyId]);
  if (!into.length) throw new Error("It lands in a bank or cash account.");
  const gross = toLaari(String(amount).replace(/,/g, ""));
  if (gross <= 0n) throw new Error("How much came in?");
  const { rows: co } = await client.query("SELECT gst_registered FROM companies WHERE id = $1", [companyId]);
  const t = co[0]?.gst_registered ? treatment || "inclusive" : "none_unregistered";
  const on = receivedOn || require("./today").today();
  const bp = await tax.rateForDocument(client, { companyId, on, treatment: t === "exclusive" ? "inclusive" : t });
  // What arrived includes its GST, whatever the request quoted.
  const split = splitTax(gross, t === "exclusive" ? "inclusive" : t, bp);
  const held = await account(client, companyId, HELD);
  const lines = [
    { accountId: into[0].id, debit: gross, counterpartyId: party, memo: `${label}, received` },
    { accountId: held, credit: split.net, counterpartyId: party, memo: `${label}, held for the customer` },
  ];
  if (split.tax > 0n) lines.push({ accountId: await gstAccount(client, companyId), credit: split.tax, memo: `${label}: GST on a payment in advance` });
  const entry = await postEntry(client, { companyId, userId, date: on, source: "payment", narrative: `${label}: money in advance${reference ? `, ${String(reference).trim()}` : ""}`, lines });
  const { rows } = await client.query(
    `INSERT INTO customer_advances (company_id, counterparty_id, request_id, received_on, amount_laari, tax_laari, gst_rate_bp, account_id, reference, entry_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [companyId, party, requestId || null, on, gross.toString(), split.tax.toString(), split.tax > 0n ? bp : null, into[0].id, reference ? String(reference).trim() : null, entry.id, userId]
  );
  return { id: rows[0].id, entryNo: String(entry.entryNo), amount: F(gross), tax: F(split.tax), into: into[0].name };
}

/** Each advance with what is left of it, and its GST left, locked while it is used. */
async function held(client, { companyId, counterpartyId = null, advanceId = null, lock = false }) {
  // Advances are never updated, so there is no row to lock: one advance is used by one transaction at a time.
  if (lock && advanceId) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`advance:${advanceId}`]);
  const { rows } = await client.query(
    `SELECT a.*, c.name AS customer, r.number AS request_no, r.kind AS request_kind,
            COALESCE((SELECT SUM(u.amount_laari) FROM advance_uses u WHERE u.advance_id = a.id), 0) AS used,
            COALESCE((SELECT SUM(u.tax_laari) FROM advance_uses u WHERE u.advance_id = a.id), 0) AS used_tax
       FROM customer_advances a JOIN counterparties c ON c.id = a.counterparty_id LEFT JOIN advance_requests r ON r.id = a.request_id
      WHERE a.company_id = $1 ${counterpartyId ? "AND a.counterparty_id = $2" : ""} ${advanceId ? `AND a.id = $${counterpartyId ? 3 : 2}` : ""}
      ORDER BY a.received_on, a.created_at`,
    [companyId, ...(counterpartyId ? [counterpartyId] : []), ...(advanceId ? [advanceId] : [])]
  );
  return rows.map((a) => ({ ...a, left: BigInt(a.amount_laari) - BigInt(a.used), taxLeft: BigInt(a.tax_laari) - BigInt(a.used_tax) }));
}

/** The GST in part of what is left: in proportion, and all of it with the last of the money. */
const taxShare = (a, part) => (part === a.left ? a.taxLeft : (a.taxLeft * part + a.left / 2n) / a.left);

/** Using an advance against one of the customer's posted invoices. */
async function useAgainst(client, { companyId, userId, advanceId, invoiceId, amount, on }) {
  await assumeIdentity(client, { companyId, userId });
  const [a] = await held(client, { companyId, advanceId, lock: true });
  if (!a) throw new Error("That advance is not in these books.");
  const { rows: inv } = await client.query("SELECT id, invoice_no, counterparty_id, status, voided_at, fc_gross FROM sales_invoices WHERE id = $1 AND company_id = $2", [invoiceId, companyId]);
  const s = inv[0];
  if (!s || s.status !== "posted" || s.voided_at) throw new Error("Use it against an invoice that is in the books.");
  if (s.counterparty_id !== a.counterparty_id) throw new Error("That invoice is another customer's.");
  if (s.fc_gross !== null) throw new Error("That invoice is in another currency; take the advance off in its currency by hand.");
  const owed = await sales.outstanding(client, { companyId, invoiceId });
  const want = amount === undefined || amount === null || amount === "" ? (a.left < owed ? a.left : owed) : toLaari(String(amount).replace(/,/g, ""));
  if (want <= 0n) throw new Error(owed <= 0n ? `${s.invoice_no} is paid already.` : "Nothing is left of this advance.");
  if (want > a.left) throw new Error(`Only ${F(a.left)} is left of this advance.`);
  if (want > owed) throw new Error(`${s.invoice_no} has ${F(owed)} left to pay.`);
  const gst = taxShare(a, want);
  const date = on || require("./today").today();
  const heldAcc = await account(client, companyId, HELD);
  const ar = await account(client, companyId, AR);
  const label = a.request_no ? `${LABEL[a.request_kind]} ${a.request_no}` : "Advance";
  const lines = [
    { accountId: heldAcc, debit: want - gst, counterpartyId: a.counterparty_id, memo: `${label} used for ${s.invoice_no}` },
    { accountId: ar, credit: want, counterpartyId: a.counterparty_id, memo: `${s.invoice_no} paid from ${label.toLowerCase()}` },
  ];
  if (gst > 0n) lines.push({ accountId: await gstAccount(client, companyId), debit: gst, memo: `GST taken on ${label.toLowerCase()}, now on ${s.invoice_no}` });
  const entry = await postEntry(client, { companyId, userId, date, source: "payment", narrative: `${label} used for ${s.invoice_no}`, lines });
  // A receipt from the advances account, so the invoice reads as paid everywhere.
  const { rows: rc } = await client.query(
    `INSERT INTO receipts (company_id, counterparty_id, amount_laari, received_on, account_id, reference, entry_id, received_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [companyId, a.counterparty_id, want.toString(), date, heldAcc, `${label}, paid in advance`, entry.id, userId]
  );
  await client.query("INSERT INTO receipt_allocations (company_id, receipt_id, invoice_id, amount_laari) VALUES ($1,$2,$3,$4)", [companyId, rc[0].id, invoiceId, want.toString()]);
  await client.query(
    `INSERT INTO advance_uses (company_id, advance_id, kind, invoice_id, receipt_id, used_on, amount_laari, tax_laari, entry_id, created_by)
     VALUES ($1,$2,'invoice',$3,$4,$5,$6,$7,$8,$9)`,
    [companyId, advanceId, invoiceId, rc[0].id, date, want.toString(), gst.toString(), entry.id, userId]
  );
  return { entryNo: String(entry.entryNo), amount: F(want), invoiceNo: s.invoice_no };
}

/** Giving what is left of an advance back. */
async function refund(client, { companyId, userId, advanceId, amount, on, fromAccountId }) {
  await assumeIdentity(client, { companyId, userId });
  const [a] = await held(client, { companyId, advanceId, lock: true });
  if (!a) throw new Error("That advance is not in these books.");
  const want = amount ? toLaari(String(amount).replace(/,/g, "")) : a.left;
  if (want <= 0n || want > a.left) throw new Error(`Up to ${F(a.left)} is left to give back.`);
  const { rows: from } = await client.query("SELECT id, name FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'asset' AND (code LIKE '11%' OR code LIKE '12%')", [fromAccountId, companyId]);
  if (!from.length) throw new Error("It goes back out of a bank or cash account.");
  const gst = taxShare(a, want);
  const date = on || require("./today").today();
  const lines = [
    { accountId: await account(client, companyId, HELD), debit: want - gst, counterpartyId: a.counterparty_id, memo: "Advance given back" },
    { accountId: from[0].id, credit: want, counterpartyId: a.counterparty_id, memo: "Advance given back" },
  ];
  if (gst > 0n) lines.push({ accountId: await gstAccount(client, companyId), debit: gst, memo: "GST on an advance given back" });
  const entry = await postEntry(client, { companyId, userId, date, source: "payment", narrative: `Advance given back to ${a.customer}`, lines });
  await client.query(
    `INSERT INTO advance_uses (company_id, advance_id, kind, account_id, used_on, amount_laari, tax_laari, entry_id, created_by)
     VALUES ($1,$2,'refund',$3,$4,$5,$6,$7,$8)`,
    [companyId, advanceId, from[0].id, date, want.toString(), gst.toString(), entry.id, userId]
  );
  return { entryNo: String(entry.entryNo), amount: F(want), from: from[0].name };
}

/** A proforma becomes its tax invoice, posted, and the money paid against it is used on it. */
async function invoiceProforma(client, { companyId, userId, id, issueDate, dueDate }) {
  await assumeIdentity(client, { companyId, userId });
  const r = await request(client, { companyId, id });
  if (r.kind !== "proforma") throw new Error("Only a proforma becomes a tax invoice; use a retainer against one.");
  if (r.cancelled_at) throw new Error("This proforma has been withdrawn.");
  if (r.invoice_id) throw new Error(`Its tax invoice is ${r.invoice_no}.`);
  const { invoice } = await sales.raise(client, {
    companyId, userId, counterpartyId: r.counterparty_id, subject: r.subject || `From proforma ${r.number}`, purchaseOrder: r.number,
    issueDate: issueDate || require("./today").today(), dueDate: dueDate || null, gstTreatment: r.gst_treatment, projectId: r.project_id,
    lines: r.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: String(l.unitPrice).replace(/,/g, ""), uom: l.unit, itemId: l.itemId || undefined })),
  });
  await sales.post(client, { companyId, userId, invoiceId: invoice.id });
  await client.query("UPDATE advance_requests SET invoice_id = $3 WHERE id = $1 AND company_id = $2", [id, companyId, invoice.id]);
  const used = [];
  for (const a of await held(client, { companyId, counterpartyId: r.counterparty_id })) {
    if (a.request_id !== id || a.left <= 0n) continue;
    const owed = await sales.outstanding(client, { companyId, invoiceId: invoice.id });
    if (owed <= 0n) break;
    used.push(await useAgainst(client, { companyId, userId, advanceId: a.id, invoiceId: invoice.id, on: issueDate }));
  }
  const { rows } = await client.query("SELECT invoice_no FROM sales_invoices WHERE id = $1", [invoice.id]);
  return { invoiceId: invoice.id, invoiceNo: rows[0].invoice_no, used: used.reduce((s, u) => s + toLaari(u.amount.replace(/,/g, "")), 0n) };
}

/** Everything held for customers, with each advance's uses. */
async function money(client, { companyId }) {
  const list = await held(client, { companyId });
  const { rows: uses } = await client.query(
    `SELECT u.advance_id, u.kind, u.used_on::text AS on, u.amount_laari, s.invoice_no, a.name AS account
       FROM advance_uses u LEFT JOIN sales_invoices s ON s.id = u.invoice_id LEFT JOIN accounts a ON a.id = u.account_id
      WHERE u.company_id = $1 ORDER BY u.used_on`,
    [companyId]
  );
  return list.map((a) => ({
    id: a.id, customer: a.customer, counterpartyId: a.counterparty_id, receivedOn: iso(a.received_on), amount: F(a.amount_laari), tax: F(a.tax_laari),
    left: F(a.left), request: a.request_no ? `${LABEL[a.request_kind]} ${a.request_no}` : null, reference: a.reference,
    uses: uses.filter((u) => u.advance_id === a.id).map((u) => ({ kind: u.kind, on: u.on, amount: F(u.amount_laari), invoiceNo: u.invoice_no, account: u.account })),
  }));
}

module.exports = { LABEL, create, request, showRequest, list, cancel, accept, receive, held, useAgainst, refund, invoiceProforma, money };
