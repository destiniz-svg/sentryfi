/**
 * Documents: the facts a document is drawn from, the brand and template it is
 * drawn with, and the copy kept when it is issued.
 *
 * The server says what is on the paper (every figure as the books have it);
 * the app draws it (frontend/src/components/documents). The same drawing is
 * the live preview, the printed page, the PDF and the customer's link.
 */
const crypto = require("crypto");
const { formatLaari } = require("./money");
const { niceDate } = require("./gstReturn");

const KINDS = ["invoice", "quote", "sales_order", "purchase_order", "delivery_note", "goods_received", "credit_note", "receipt", "statement"];
const f = (v) => (v === null || v === undefined ? null : formatLaari(BigInt(v)));

/** The brand kit, with the facts the company already keeps filled in. */
async function brandOf(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT name, registration_no, tin, gst_number, gst_registered, base_currency, payment_details, brand, tax_pack FROM companies WHERE id = $1",
    [companyId]
  );
  const c = rows[0];
  if (!c) throw new Error("That company is not in these books.");
  return {
    ...c.brand,
    name: c.brand.name || c.name,
    legalName: c.name,
    registrationNo: c.registration_no,
    tin: c.tin,
    gstNumber: c.gst_number,
    gstRegistered: c.gst_registered,
    baseCurrency: String(c.base_currency).trim(),
    paymentDetails: c.brand.paymentDetails ?? c.payment_details ?? "",
    // The country's words for the paper: GST and TIN, or VAT and TRN (ledger/tax.js).
    tax: require("./tax").wordsOf(require("./tax").packCalled(c.tax_pack || "MV")),
  };
}

async function templateOf(client, { companyId, kind }) {
  const { rows } = await client.query("SELECT settings FROM document_templates WHERE company_id = $1 AND kind = $2", [companyId, kind]);
  // A kind keeps a library of designs (ready-made, and the company's own copies);
  // what prints is the one in use, resolved by the editor when it saved.
  const settings = rows[0]?.settings || {};
  return settings.resolved || settings;
}

/** An invoice as its paper shows it: every figure from the books, as text. */
async function invoiceData(client, { companyId, id: invoiceId }) {
  const { rows } = await client.query(
    `SELECT s.*, s.issue_date::text AS issued, s.due_date::text AS due,
            c.name AS customer, c.address AS customer_address, c.tin AS customer_tin, c.gst_number AS customer_gst,
            c.email AS customer_email, c.phone AS customer_phone, p.name AS project
       FROM sales_invoices s LEFT JOIN counterparties c ON c.id = s.counterparty_id LEFT JOIN projects p ON p.id = s.project_id
      WHERE s.id = $1 AND s.company_id = $2`,
    [invoiceId, companyId]
  );
  const s = rows[0];
  if (!s) throw new Error("That invoice is not in these books.");
  const { rows: lines } = await client.query(
    `SELECT l.description, l.quantity::text AS quantity, l.uom, l.unit_price_laari, l.net_laari, l.tax_laari, l.fc_net, i.code AS item_code
       FROM sales_invoice_lines l LEFT JOIN stock_items i ON i.id = l.item_id
      WHERE l.invoice_id = $1 ORDER BY l.position`,
    [invoiceId]
  );
  const foreign = s.fc_gross !== null && s.fc_gross !== undefined;
  const cur = String(s.currency || "").trim();
  return {
    kind: "invoice",
    id: s.id,
    number: s.invoice_no,
    status: s.voided_at ? "void" : s.status,
    issued: s.issued,
    due: s.due,
    reference: s.purchase_order,
    subject: s.subject,
    project: s.project,
    to: { name: s.customer, address: s.customer_address, tin: s.customer_tin, gstNumber: s.customer_gst, email: s.customer_email, phone: s.customer_phone },
    currency: foreign ? cur : null,
    fxRate: foreign && s.fx_rate ? String(Number(s.fx_rate)) : null,
    gstTreatment: s.gst_treatment,
    gstRatePercent: s.gst_rate_bp === null ? null : s.gst_rate_bp / 100,
    lines: lines.map((l) => ({
      code: l.item_code || null,
      description: l.description,
      quantity: String(Number(l.quantity)),
      unit: l.uom,
      // In another currency the line is in that currency: what the customer sees.
      // A line raised as an amount alone has no rate to print.
      rate: foreign || BigInt(l.unit_price_laari) === 0n ? null : f(l.unit_price_laari),
      amount: foreign ? f(l.fc_net) : f(l.net_laari),
    })),
    totals: foreign
      ? { net: f(s.fc_net), tax: f(s.fc_tax), gross: f(s.fc_gross), taxInBase: f(s.tax_laari), grossInBase: f(s.gross_laari) }
      : { net: f(s.net_laari), tax: f(s.tax_laari), gross: f(s.gross_laari) },
  };
}

/** A customer or supplier as their paper shows them. */
async function partyOf(client, { companyId, id }) {
  const { rows } = await client.query("SELECT name, address, tin, gst_number, email, phone FROM counterparties WHERE id = $1 AND company_id = $2", [id, companyId]);
  const c = rows[0] || {};
  return { name: c.name, address: c.address, tin: c.tin, gstNumber: c.gst_number, email: c.email, phone: c.phone };
}

const ORDER_KIND = { quote: "quote", sale: "sales_order", purchase: "purchase_order" };
const WATERMARK = { cancelled: "CANCELLED", declined: "DECLINED", expired: "EXPIRED", awaiting_approval: "NOT APPROVED" };

/**
 * A quote, sales order or purchase order. Orders are priced before GST: a
 * GST-registered company's quote or sales order shows the GST the invoice
 * will add at today's rate; a purchase order leaves GST to the supplier.
 */
async function orderData(client, { companyId, id }) {
  const orders = require("./orders");
  const s = await orders.load(client, { companyId, orderId: id });
  const o = s.order;
  const kind = ORDER_KIND[o.kind];
  const brand = await brandOf(client, { companyId });
  const net = s.total;
  let tax = 0n;
  let ratePercent = null;
  const selling = kind !== "purchase_order";
  if (selling && brand.gstRegistered) {
    const bp = await require("./tax").rateForDocument(client, { companyId, on: String(o.ordered_on instanceof Date ? o.ordered_on.toISOString() : o.ordered_on).slice(0, 10), treatment: "exclusive" });
    const { splitTax } = require("./bills");
    for (const l of s.lines) tax += splitTax(formatLaari(orders.times(l.price, l.units)).replace(/,/g, ""), "exclusive", bp).tax;
    ratePercent = bp / 100;
  }
  const dates = await client.query("SELECT ordered_on::text AS on, expected_on::text AS expected, valid_until::text AS until FROM orders WHERE id = $1", [id]);
  const d = dates.rows[0];
  return {
    kind,
    id,
    number: o.number,
    status: s.status,
    watermark: WATERMARK[s.status] || null,
    issued: d.on,
    due: kind === "quote" ? d.until : d.expected,
    dueLabel: kind === "quote" ? "Valid until" : "Expected",
    project: o.project,
    subject: o.note || null,
    approvedBy: kind === "purchase_order" && o.approved_at ? o.approver : null,
    to: await partyOf(client, { companyId, id: o.counterparty_id }),
    currency: null,
    gstTreatment: selling && brand.gstRegistered ? "exclusive" : "none_unregistered",
    gstRatePercent: ratePercent,
    lines: s.lines.map((l) => ({ code: null, description: l.description, quantity: require("./stock").unitsText(l.units), unit: l.unit, rate: f(l.price), amount: f(orders.times(l.price, l.units)) })),
    totals: { net: f(net), tax: f(tax), gross: f(net + tax) },
    priceNote: kind === "purchase_order" ? `Prices before ${brand.tax.tax}.` : ratePercent !== null ? `${brand.tax.tax} at ${ratePercent}%, the rate today; the invoice charges the rate on its own date.` : null,
  };
}

/** A delivery note (goods out on a sales order) or goods received note (on a purchase order): quantities, no prices. */
async function deliveryData(client, { companyId, id }) {
  const { rows } = await client.query(
    `SELECT d.*, d.delivered_on::text AS on, o.number AS order_no, o.kind AS order_kind, o.counterparty_id, p.name AS project,
            (SELECT count(*) FROM order_deliveries x WHERE x.order_id = d.order_id AND x.created_at <= d.created_at)::int AS n
       FROM order_deliveries d JOIN orders o ON o.id = d.order_id LEFT JOIN projects p ON p.id = o.project_id
      WHERE d.id = $1 AND d.company_id = $2`,
    [id, companyId]
  );
  const d = rows[0];
  if (!d) throw new Error("That delivery is not in these books.");
  const { rows: lines } = await client.query(
    `SELECT l.description, l.unit, l.quantity::text AS ordered, dl.quantity::text AS delivered, i.code
       FROM order_delivery_lines dl JOIN order_lines l ON l.id = dl.order_line_id LEFT JOIN stock_items i ON i.id = l.item_id
      WHERE dl.delivery_id = $1 ORDER BY l.position`,
    [id]
  );
  const incoming = d.order_kind === "purchase";
  return {
    kind: incoming ? "goods_received" : "delivery_note",
    id,
    number: `${d.order_no}-D${d.n}`,
    status: "issued",
    issued: d.on,
    reference: d.reference,
    orderNumber: d.order_no,
    project: d.project,
    subject: d.note || null,
    to: await partyOf(client, { companyId, id: d.counterparty_id }),
    priced: false,
    receivedBy: !incoming,
    lines: lines.map((l) => ({ code: l.code, description: l.description, quantity: String(Number(l.delivered)), ordered: String(Number(l.ordered)), unit: l.unit })),
    totals: {},
  };
}

/** A credit note: what is taken off an invoice, and why. */
async function creditData(client, { companyId, id }) {
  const { rows } = await client.query(
    `SELECT n.*, n.issue_date::text AS on, s.invoice_no, s.gst_rate_bp, s.gst_treatment FROM credit_notes n LEFT JOIN sales_invoices s ON s.id = n.invoice_id
      WHERE n.id = $1 AND n.company_id = $2`,
    [id, companyId]
  );
  const n = rows[0];
  if (!n) throw new Error("That credit note is not in these books.");
  return {
    kind: "credit_note",
    id,
    number: n.note_no,
    status: "posted",
    issued: n.on,
    orderNumber: null,
    againstInvoice: n.invoice_no,
    subject: n.reason,
    to: await partyOf(client, { companyId, id: n.counterparty_id }),
    currency: null,
    gstTreatment: n.gst_treatment || (BigInt(n.tax_laari) > 0n ? "exclusive" : "none_unregistered"),
    gstRatePercent: n.gst_rate_bp === null ? null : n.gst_rate_bp / 100,
    lines: [{ code: null, description: n.invoice_no ? `Credit against invoice ${n.invoice_no}: ${n.reason}` : n.reason, quantity: "1", unit: null, rate: null, amount: f(n.net_laari) }],
    totals: { net: f(n.net_laari), tax: f(n.tax_laari), gross: f(n.gross_laari) },
  };
}

/** A receipt: money received from a customer, and which invoices it paid. Numbered by its entry. */
async function receiptData(client, { companyId, id }) {
  const { rows } = await client.query(
    `SELECT r.*, r.received_on::text AS on, e.entry_no, a.name AS into
       FROM receipts r LEFT JOIN journal_entries e ON e.id = r.entry_id LEFT JOIN accounts a ON a.id = r.account_id
      WHERE r.id = $1 AND r.company_id = $2`,
    [id, companyId]
  );
  const r = rows[0];
  if (!r) throw new Error("That receipt is not in these books.");
  const { rows: against } = await client.query(
    `SELECT s.invoice_no, s.issue_date::text AS on, x.amount_laari FROM receipt_allocations x JOIN sales_invoices s ON s.id = x.invoice_id
      WHERE x.receipt_id = $1 ORDER BY s.issue_date, s.invoice_no`,
    [id]
  );
  const onAccount = BigInt(r.amount_laari) - against.reduce((a, x) => a + BigInt(x.amount_laari), 0n);
  const lines = against.map((x) => ({ code: null, description: `Invoice ${x.invoice_no}, ${x.on}`, quantity: null, unit: null, rate: null, amount: f(x.amount_laari) }));
  if (onAccount > 0n) lines.push({ code: null, description: "Held on your account, against what you owe next", quantity: null, unit: null, rate: null, amount: f(onAccount) });
  return {
    kind: "receipt",
    id,
    number: r.entry_no ? `RC-${r.entry_no}` : `RC-${String(id).slice(0, 8).toUpperCase()}`,
    status: r.voided_at ? "void" : "posted",
    issued: r.on,
    reference: r.reference,
    subject: `Received with thanks${r.into ? `, into ${r.into}` : ""}`,
    to: await partyOf(client, { companyId, id: r.counterparty_id }),
    currency: null,
    gstTreatment: "none_unregistered",
    gstRatePercent: null,
    columns: [{ key: "description", label: "Paid against", grow: true }, { key: "amount", label: "Amount", num: true }],
    lines,
    totals: { net: f(r.amount_laari), tax: "0.00", gross: f(r.amount_laari) },
    totalLabel: "Received",
  };
}

/**
 * A customer's statement: everything invoiced, paid and credited over the
 * last twelve months, oldest first, with the balance after each, and what is
 * owed now. The document's id is the customer's.
 */
async function statementData(client, { companyId, id }) {
  const party = await partyOf(client, { companyId, id });
  if (!party.name) throw new Error("That customer is not in these books.");
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { rows: before } = await client.query(
    `SELECT COALESCE((SELECT SUM(gross_laari) FROM sales_invoices WHERE company_id = $1 AND counterparty_id = $2 AND status = 'posted' AND voided_at IS NULL AND issue_date < $3), 0)
          - COALESCE((SELECT SUM(amount_laari) FROM receipts WHERE company_id = $1 AND counterparty_id = $2 AND voided_at IS NULL AND received_on < $3), 0)
          - COALESCE((SELECT SUM(gross_laari) FROM credit_notes WHERE company_id = $1 AND counterparty_id = $2 AND issue_date < $3), 0) AS opening`,
    [companyId, id, from]
  );
  const { rows: moves } = await client.query(
    // On one day: what was invoiced, then what was credited against it, then what was paid.
    `SELECT issue_date::text AS on, 1 AS turn, 'Invoice ' || invoice_no AS what, gross_laari AS charge, 0 AS paid FROM sales_invoices
      WHERE company_id = $1 AND counterparty_id = $2 AND status = 'posted' AND voided_at IS NULL AND issue_date >= $3
     UNION ALL
     SELECT issue_date::text, 2, 'Credit note ' || note_no, 0, gross_laari FROM credit_notes
      WHERE company_id = $1 AND counterparty_id = $2 AND issue_date >= $3
     UNION ALL
     SELECT received_on::text, 3, 'Payment received' || COALESCE(', ' || reference, ''), 0, amount_laari FROM receipts
      WHERE company_id = $1 AND counterparty_id = $2 AND voided_at IS NULL AND received_on >= $3
     ORDER BY 1, 2, 3`,
    [companyId, id, from]
  );
  let balance = BigInt(before[0].opening);
  const day = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const lines = [{ code: null, on: day(from), description: "Brought forward", charge: "", paid: "", balance: f(balance) }];
  for (const m of moves) {
    balance += BigInt(m.charge) - BigInt(m.paid);
    lines.push({ code: null, on: day(m.on), description: m.what, charge: BigInt(m.charge) ? f(m.charge) : "", paid: BigInt(m.paid) ? f(m.paid) : "", balance: f(balance) });
  }
  return {
    kind: "statement",
    id,
    number: `ST-${today.replace(/-/g, "")}`,
    status: "posted",
    issued: today,
    subject: `From ${niceDate(from)} to ${niceDate(today)}`,
    to: party,
    currency: null,
    gstTreatment: "none_unregistered",
    gstRatePercent: null,
    // Its own columns: a statement is a running account, not a list of things sold.
    columns: [
      { key: "on", label: "Date", nowrap: true },
      { key: "description", label: "What", grow: true },
      { key: "charge", label: "Charged", num: true },
      { key: "paid", label: "Paid or credited", num: true },
      { key: "balance", label: "Balance", num: true },
    ],
    lines,
    totals: { net: f(balance), tax: "0.00", gross: f(balance) },
    totalLabel: balance < 0n ? "In your favour" : "Owed now",
  };
}

const DATA = { invoice: invoiceData, quote: orderData, sales_order: orderData, purchase_order: orderData, delivery_note: deliveryData, goods_received: deliveryData, credit_note: creditData, receipt: receiptData, statement: statementData };

/** What to draw: the issued copy if there is one, else the document as it is now. */
async function show(client, { companyId, kind, documentId }) {
  const { rows } = await client.query(
    "SELECT body, sha256, created_at FROM document_copies WHERE company_id = $1 AND kind = $2 AND document_id = $3",
    [companyId, kind, documentId]
  );
  if (rows[0]) return { ...rows[0].body, issuedCopy: { at: rows[0].created_at, sha256: rows[0].sha256 } };
  if (!DATA[kind]) throw new Error("That kind of document is not drawn yet.");
  return {
    data: await DATA[kind](client, { companyId, id: documentId }),
    brand: await brandOf(client, { companyId }),
    template: await templateOf(client, { companyId, kind }),
    issuedCopy: null,
  };
}

/** Keeps the document as issued. Once: issuing again keeps the first. */
async function keepCopy(client, { companyId, userId, kind, documentId }) {
  const body = {
    data: await DATA[kind](client, { companyId, id: documentId }),
    brand: await brandOf(client, { companyId }),
    template: await templateOf(client, { companyId, kind }),
  };
  const sha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  await client.query(
    `INSERT INTO document_copies (company_id, kind, document_id, body, sha256, created_by) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id, kind, document_id) DO NOTHING`,
    [companyId, kind, documentId, JSON.stringify(body), sha256, userId || null]
  );
  return sha256;
}

module.exports = { KINDS, brandOf, templateOf, invoiceData, show, keepCopy };
