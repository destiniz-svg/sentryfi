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

const KINDS = ["invoice", "quote", "sales_order", "purchase_order", "delivery_note", "credit_note", "receipt", "statement"];
const f = (v) => (v === null || v === undefined ? null : formatLaari(BigInt(v)));

/** The brand kit, with the facts the company already keeps filled in. */
async function brandOf(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT name, registration_no, tin, gst_number, gst_registered, base_currency, payment_details, brand FROM companies WHERE id = $1",
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
  };
}

async function templateOf(client, { companyId, kind }) {
  const { rows } = await client.query("SELECT settings FROM document_templates WHERE company_id = $1 AND kind = $2", [companyId, kind]);
  return rows[0]?.settings || {};
}

/** An invoice as its paper shows it: every figure from the books, as text. */
async function invoiceData(client, { companyId, invoiceId }) {
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
      rate: foreign ? null : f(l.unit_price_laari),
      amount: foreign ? f(l.fc_net) : f(l.net_laari),
    })),
    totals: foreign
      ? { net: f(s.fc_net), tax: f(s.fc_tax), gross: f(s.fc_gross), taxInBase: f(s.tax_laari), grossInBase: f(s.gross_laari) }
      : { net: f(s.net_laari), tax: f(s.tax_laari), gross: f(s.gross_laari) },
  };
}

const DATA = { invoice: invoiceData };

/** What to draw: the issued copy if there is one, else the document as it is now. */
async function show(client, { companyId, kind, documentId }) {
  const { rows } = await client.query(
    "SELECT body, sha256, created_at FROM document_copies WHERE company_id = $1 AND kind = $2 AND document_id = $3",
    [companyId, kind, documentId]
  );
  if (rows[0]) return { ...rows[0].body, issuedCopy: { at: rows[0].created_at, sha256: rows[0].sha256 } };
  if (!DATA[kind]) throw new Error("That kind of document is not drawn yet.");
  return {
    data: await DATA[kind](client, { companyId, [`${kind}Id`]: documentId }),
    brand: await brandOf(client, { companyId }),
    template: await templateOf(client, { companyId, kind }),
    issuedCopy: null,
  };
}

/** Keeps the document as issued. Once: issuing again keeps the first. */
async function keepCopy(client, { companyId, userId, kind, documentId }) {
  const body = {
    data: await DATA[kind](client, { companyId, [`${kind}Id`]: documentId }),
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
