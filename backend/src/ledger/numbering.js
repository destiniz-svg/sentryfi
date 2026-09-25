/**
 * How each kind of document is numbered: the company's own start (INV-,
 * ALT/INV-, QT-), then the next number in the run. Changing the start never
 * renumbers anything already issued; the digits carry on from the highest
 * number of that kind, whatever it started with.
 */
const KINDS = {
  invoice: { label: "Invoices", start: "INV-", width: 6 },
  quote: { label: "Quotes", start: "QT-", width: 4 },
  sales_order: { label: "Sales orders", start: "SO-", width: 4 },
  purchase_order: { label: "Purchase orders", start: "PO-", width: 4 },
  proforma: { label: "Proforma invoices", start: "PF-", width: 4 },
  retainer: { label: "Retainer invoices", start: "RT-", width: 4 },
  credit_note: { label: "Credit notes", start: "CN-", width: 4 },
  purchase_return: { label: "Purchase returns", start: "PR-", width: 4 },
  claim: { label: "Expense claims", start: "EC-", width: 4 },
};

// Where each kind's numbers live, to find the highest so far.
const SOURCE = {
  invoice: "SELECT invoice_no AS number FROM sales_invoices WHERE company_id = $1 AND NOT opening",
  quote: "SELECT number FROM orders WHERE company_id = $1 AND kind = 'quote'",
  sales_order: "SELECT number FROM orders WHERE company_id = $1 AND kind = 'sale'",
  purchase_order: "SELECT number FROM orders WHERE company_id = $1 AND kind = 'purchase'",
  proforma: "SELECT number FROM advance_requests WHERE company_id = $1 AND kind = 'proforma'",
  retainer: "SELECT number FROM advance_requests WHERE company_id = $1 AND kind = 'retainer'",
  credit_note: "SELECT note_no AS number FROM credit_notes WHERE company_id = $1",
  purchase_return: "SELECT number FROM supplier_returns WHERE company_id = $1",
  claim: "SELECT number FROM expense_claims WHERE company_id = $1",
};

async function startOf(client, companyId, kind) {
  const { rows } = await client.query("SELECT prefix FROM document_numbering WHERE company_id = $1 AND kind = $2", [companyId, kind]);
  return rows[0]?.prefix ?? null;
}

/** The next number of a kind: the chosen start, and one past the highest number so far. */
async function next(client, { companyId, kind }) {
  const k = KINDS[kind];
  const start = (await startOf(client, companyId, kind)) ?? k.start;
  const { rows } = await client.query(SOURCE[kind], [companyId]);
  let high = 0;
  let width = k.width;
  for (const r of rows) {
    const m = String(r.number || "").match(/(\d+)\s*$/);
    if (m && Number(m[1]) > high) {
      high = Number(m[1]);
      width = Math.max(k.width, m[1].length);
    }
  }
  return `${start}${String(high + 1).padStart(width, "0")}`;
}

async function list(client, { companyId }) {
  const out = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    const own = await startOf(client, companyId, kind);
    out.push({ kind, label: k.label, start: own ?? k.start, own: own !== null, next: await next(client, { companyId, kind }) });
  }
  return out;
}

async function save(client, { companyId, userId, kind, start }) {
  if (!KINDS[kind]) throw new Error("There is no such kind of document.");
  const s = String(start ?? "").replace(/\s+/g, "");
  if (s.length > 20) throw new Error("Keep the start of the number under 20 characters.");
  if (/\d$/.test(s)) throw new Error("End the start with a letter or a mark (INV- or ALT/INV/), so the number that follows reads clearly.");
  if (!s) await client.query("DELETE FROM document_numbering WHERE company_id = $1 AND kind = $2", [companyId, kind]);
  else
    await client.query(
      `INSERT INTO document_numbering (company_id, kind, prefix, updated_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, kind) DO UPDATE SET prefix = EXCLUDED.prefix, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [companyId, kind, s, userId]
    );
  return next(client, { companyId, kind });
}

module.exports = { KINDS, next, list, save, startOf };
