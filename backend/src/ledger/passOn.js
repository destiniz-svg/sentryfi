/**
 * Costs passed on: a cost on a posted bill, or a line of an approved claim,
 * marked for a customer, waits on that customer's next invoice with its
 * markup, so nothing billable is forgotten. An invoice takes it when a person
 * adds it; voiding that invoice lets it wait again. Ids say where each came
 * from: "b:" a bill's cost, "c:" a claim's line.
 */
const { formatLaari } = require("./money");

// A bill's cost is kept in the bill's own currency; what it cost us is its share of the bill's net.
const WAITING = `
SELECT * FROM (
  SELECT 'b:' || c.id AS id, c.id AS charge_id, NULL::uuid AS line_id, c.description, b.issue_date::text AS spent_on,
         (c.amount_laari * b.net_laari / NULLIF(COALESCE(b.fc_net, b.net_laari), 0))::bigint AS cost, c.markup_bp, c.for_customer_id,
         COALESCE(s.name, 'A bill') || COALESCE(' ' || b.bill_no, '') AS source
    FROM bill_charges c JOIN bills b ON b.id = c.bill_id LEFT JOIN counterparties s ON s.id = b.counterparty_id
   WHERE c.company_id = $1 AND c.for_customer_id IS NOT NULL AND b.status = 'posted'
     AND NOT EXISTS (SELECT 1 FROM passed_on p JOIN sales_invoices i ON i.id = p.invoice_id WHERE p.bill_charge_id = c.id AND i.voided_at IS NULL)
  UNION ALL
  SELECT 'c:' || l.id, NULL, l.id, l.description, l.spent_on::text, l.amount_laari, l.markup_bp, l.for_customer_id, e.number
    FROM expense_claim_lines l JOIN expense_claims e ON e.id = l.claim_id
   WHERE l.company_id = $1 AND l.for_customer_id IS NOT NULL AND e.approved_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM passed_on p JOIN sales_invoices i ON i.id = p.invoice_id WHERE p.claim_line_id = l.id AND i.voided_at IS NULL)
) w WHERE for_customer_id = $2 ORDER BY spent_on, id`;

const priced = (r) => {
  const cost = BigInt(r.cost);
  return { ...r, price: cost + (cost * BigInt(r.markup_bp) + 5000n) / 10000n };
};

/** What waits for this customer's next invoice. */
async function waiting(client, { companyId, counterpartyId }) {
  const { rows } = await client.query(WAITING, [companyId, counterpartyId]);
  return rows.map(priced).map((r) => ({
    id: r.id, description: r.description, spentOn: r.spent_on, source: r.source,
    cost: formatLaari(BigInt(r.cost)), markupPercent: r.markup_bp / 100, price: formatLaari(r.price),
  }));
}

/** The invoice takes these costs; each must be waiting for its customer. */
async function take(client, { companyId, invoiceId, counterpartyId, ids }) {
  if (!ids?.length) return;
  const { rows } = await client.query(WAITING, [companyId, counterpartyId]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of new Set(ids)) {
    const r = byId.get(id);
    if (!r) throw new Error("One of those costs is not waiting for this customer. It may be on another invoice already.");
    await client.query("INSERT INTO passed_on (company_id, invoice_id, bill_charge_id, claim_line_id) VALUES ($1,$2,$3,$4)", [companyId, invoiceId, r.charge_id, r.line_id]);
  }
}

/** A customer to pass a cost on to, and the markup as basis points. */
async function forCustomer(client, { companyId, forCustomerId, markup }) {
  if (!forCustomerId) return { forCustomerId: null, markupBp: 0 };
  const { rows } = await client.query("SELECT 1 FROM counterparties WHERE id = $1 AND company_id = $2", [forCustomerId, companyId]);
  if (!rows.length) throw new Error("That customer is not in these books.");
  const pct = Number(String(markup ?? "").replace(/[,%]/g, "") || 0);
  if (!(pct >= 0 && pct <= 1000)) throw new Error("A markup is a percentage, from 0 to 1,000.");
  return { forCustomerId, markupBp: Math.round(pct * 100) };
}

/** Customers a cost can be passed on to. */
async function customers(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT id, name FROM counterparties WHERE company_id = $1 AND 'customer' = ANY(kind) AND merged_into IS NULL ORDER BY lower(name) LIMIT 500",
    [companyId]
  );
  return rows;
}

module.exports = { waiting, take, forCustomer, customers };
