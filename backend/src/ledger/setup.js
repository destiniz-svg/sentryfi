/**
 * Getting the books going: the first things a new company does, each ticked
 * off from what is really in the books rather than from a box someone
 * ticked, with one sentence saying why it matters and where to do it. A
 * founder who has never kept books can follow it from top to bottom.
 */

const STEPS = [
  { key: "details", title: "Your company's details", href: "/settings?tab=tax", why: "Every invoice and every return needs your TIN, and whether you charge GST decides every price you quote." },
  { key: "bank", title: "Bring in a bank statement", href: "/bank", why: "The bank is the one record nobody argues with; the books start by agreeing with it." },
  { key: "opening", title: "What you owned and owed on day one", href: "/import", why: "Opening balances, or your history from another system, so this year's figures are not missing last year's." },
  { key: "bill", title: "Record your first bill", href: "/bills", why: "Photograph it, check what was read, confirm: that is how every cost gets into the books." },
  { key: "invoice", title: "Send your first invoice", href: "/invoices/new", why: "Money owed to you is only chased when it is written down." },
  { key: "brand", title: "Your logo on your documents", href: "/branding", why: "The invoice is the one part of your books your customer sees." },
  { key: "people", title: "Invite whoever helps you", href: "/settings?tab=people", why: "The person on site photographs bills and keeps the tin, and sees only what that job needs." },
  { key: "close", title: "Close your first month", href: "/closing", why: "A closed month cannot change behind your back; your accountant and MIRA rely on that." },
];

async function steps(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT
       (c.tin IS NOT NULL AND c.tin <> '')                                                   AS details,
       EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.company_id = c.id)                AS bank,
       EXISTS (SELECT 1 FROM journal_entries j WHERE j.company_id = c.id AND j.source IN ('opening_balance', 'import')) AS opening,
       EXISTS (SELECT 1 FROM bills b WHERE b.company_id = c.id)                               AS bill,
       EXISTS (SELECT 1 FROM sales_invoices s WHERE s.company_id = c.id)                      AS invoice,
       (c.brand ->> 'savedAt') IS NOT NULL                                                    AS brand,
       (SELECT count(DISTINCT m.user_id) FROM memberships m WHERE m.company_id = c.id) > 1    AS people,
       books_locked_through(c.id) IS NOT NULL                                                 AS close
     FROM companies c WHERE c.id = $1`,
    [companyId]
  );
  const done = rows[0] || {};
  const list = STEPS.map((s) => ({ ...s, done: Boolean(done[s.key]) }));
  return { steps: list, done: list.filter((s) => s.done).length, total: list.length };
}

module.exports = { steps, STEPS };
