/**
 * Non-resident withholding tax: which suppliers it applies to, what was kept
 * back from each payment, and the month's return.
 *
 * The keeping back happens where the money goes out (ledger/payments.js); this
 * is the list the return is made from, and the one switch per supplier. A
 * payment run taken back drops out of the month, because its tax was never
 * paid over either.
 */
const { formatLaari } = require("./money");
const { packFor } = require("./tax");
const { niceDate } = require("./gstReturn");

const pad = (n) => String(n).padStart(2, "0");

/** The pack's categories, or null where the country has no such tax in Sentryfi. */
async function rules(client, { companyId }) {
  const pack = await packFor(client, { companyId });
  return pack.withholding || null;
}

/** What to keep back from `amount` for a supplier in `category`: laari, rounded half up. */
function withheldOn(amount, bp) {
  return (BigInt(amount) * BigInt(bp) + 5000n) / 10000n;
}

/** Mark a supplier as non-resident in a category, or clear it (category null). */
async function setSupplier(client, { companyId, counterpartyId, category }) {
  const r = await rules(client, { companyId });
  if (!r) throw new Error("Withholding tax on payments abroad is not set up for this country.");
  if (category && !r.categories[category]) throw new Error("Which kind of payment is it?");
  const { rowCount } = await client.query("UPDATE counterparties SET nwt_category = $3 WHERE id = $1 AND company_id = $2", [counterpartyId, companyId, category || null]);
  if (!rowCount) throw new Error("That supplier is not in these books.");
}

/** Every supplier, with the category if any, for choosing. */
async function suppliers(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT id, name, nwt_category FROM counterparties WHERE company_id = $1 AND 'supplier' = ANY(kind) ORDER BY nwt_category IS NULL, lower(name)",
    [companyId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.nwt_category }));
}

/** A month's withholding: each payment, the total, and when the return is due. */
async function month(client, { companyId, key }) {
  const r = await rules(client, { companyId });
  if (!/^\d{4}-\d{2}$/.test(String(key || ""))) throw new Error("Which month? Like 2026-08.");
  const [y, m] = key.split("-").map(Number);
  const from = `${key}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const due = `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-${pad(r?.dueDay || 15)}`;
  const { rows } = await client.query(
    `SELECT w.paid_on::text AS paid_on, c.name AS payee, COALESCE(c.tin, '') AS tin, w.category, w.rate_bp,
            w.gross_laari, w.withheld_laari, b.bill_no
       FROM nwt_withheld w
       JOIN payment_runs pr ON pr.id = w.run_id AND pr.reversed_at IS NULL
       JOIN counterparties c ON c.id = w.counterparty_id
       LEFT JOIN bills b ON b.id = w.bill_id
      WHERE w.company_id = $1 AND w.paid_on BETWEEN $2 AND $3
      ORDER BY w.paid_on, c.name`,
    [companyId, from, to]
  );
  const total = rows.reduce((a, x) => a + BigInt(x.withheld_laari), 0n);
  return {
    key,
    label: new Date(from + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    form: r?.form || null,
    due,
    dueLabel: niceDate(due),
    total: formatLaari(total),
    payments: rows.map((x) => ({
      paidOn: x.paid_on,
      payee: x.payee,
      tin: x.tin,
      category: x.category,
      categoryLabel: r?.categories[x.category]?.label || x.category,
      ratePct: x.rate_bp / 100,
      gross: formatLaari(BigInt(x.gross_laari)),
      withheld: formatLaari(BigInt(x.withheld_laari)),
      billNo: x.bill_no,
    })),
  };
}

module.exports = { rules, withheldOn, setSupplier, suppliers, month };
