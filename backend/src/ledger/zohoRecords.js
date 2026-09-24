/**
 * The parts of a Zoho Books backup that post nothing: each contact's details,
 * estimates as quotes, purchase orders as orders, and the project's customer
 * and figures. Brought in after the books (the history import), so the
 * contacts the entries made are the ones filled in.
 *
 * Nothing already here is overwritten: a detail is filled only where Sentryfi
 * has none, a quote or order whose number is already here is left as it is,
 * and bringing the same backup in again adds nothing.
 */
const { assumeIdentity } = require("./post");
const { findOrCreate } = require("./counterparties");

async function bring(client, { companyId, userId, records, system = "zoho" }) {
  await assumeIdentity(client, { companyId, userId });
  const done = { contactsFilled: 0, contactsMade: 0, quotes: 0, purchaseOrders: 0, projects: 0 };

  // Contacts: found exactly by name (made if the books never met them), then
  // the details Sentryfi does not have yet.
  const partyId = new Map();
  for (const c of records.contacts) {
    if (!c.name) continue;
    const r = await findOrCreate(client, { companyId, userId, name: c.name, kind: c.kind, exact: true });
    partyId.set(`${c.kind}|${c.name.toLowerCase()}`, r.party.id);
    if (r.created) done.contactsMade += 1;
    const { rowCount } = await client.query(
      `UPDATE counterparties SET
         email = COALESCE(email, $3), phone = COALESCE(phone, $4), address = COALESCE(address, $5),
         notes = COALESCE(notes, $6), payment_terms_days = COALESCE(payment_terms_days, $7),
         credit_limit_laari = COALESCE(credit_limit_laari, $8)
       WHERE id = $1 AND company_id = $2
         AND (($3::text IS NOT NULL AND email IS NULL) OR ($4::text IS NOT NULL AND phone IS NULL) OR ($5::text IS NOT NULL AND address IS NULL)
           OR ($6::text IS NOT NULL AND notes IS NULL) OR ($7::int IS NOT NULL AND payment_terms_days IS NULL) OR ($8::bigint IS NOT NULL AND credit_limit_laari IS NULL))`,
      [r.party.id, companyId, c.email, c.phone, c.address, c.notes, c.paymentTermsDays, c.creditLimit === null ? null : c.creditLimit.toString()]
    );
    done.contactsFilled += rowCount;
  }
  const party = async (name, kind) => {
    const k = `${kind}|${String(name || "").toLowerCase()}`;
    if (!partyId.has(k)) partyId.set(k, (await findOrCreate(client, { companyId, userId, name, kind, exact: true })).party.id);
    return partyId.get(k);
  };

  // Their account names, as the history import mapped them.
  const { rows: map } = await client.query("SELECT their_name, account_id FROM import_account_map WHERE company_id = $1 AND system = $2", [companyId, system]);
  const accountOf = new Map(map.map((m) => [m.their_name, m.account_id]));

  const order = async (kind, o, extra) => {
    if (!o.number || !o.party || !o.lines.length) return false;
    const { rows } = await client.query(
      `INSERT INTO orders (company_id, kind, number, counterparty_id, ordered_on, expected_on, note, needs_approval, approved_by, approved_at, created_by,
                           valid_until, accepted_at, declined_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,now(),$8,$9,$10,$11,$12)
       ON CONFLICT (company_id, kind, number) DO NOTHING RETURNING id`,
      [companyId, kind, o.number, await party(o.party, kind === "purchase" ? "supplier" : "customer"), o.date, o.expectedOn || null, `${o.note ? o.note + "\n\n" : ""}Brought in from Zoho Books.`, userId,
        extra.validUntil || null, extra.accepted ? o.date : null, extra.declined ? o.date : null, extra.closed ? o.date : null]
    );
    if (!rows.length) return false;
    for (const l of o.lines) {
      await client.query(
        "INSERT INTO order_lines (company_id, order_id, position, description, account_id, quantity, unit, unit_price_laari) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [companyId, rows[0].id, l.position, l.description, accountOf.get(l.account) || null, Number(l.quantity) > 0 ? l.quantity : "1", l.unit, (l.unitPrice < 0n ? 0n : l.unitPrice).toString()]
      );
    }
    return true;
  };
  for (const q of records.quotes) if (await order("quote", q, { validUntil: q.validUntil, accepted: q.status === "accepted", declined: q.status === "declined" })) done.quotes += 1;
  // A purchase order Zoho has billed is finished here: closed, nothing more expected.
  for (const p of records.purchaseOrders) if (await order("purchase", p, { closed: /billed|closed/.test(p.status) })) done.purchaseOrders += 1;

  // A project's customer and figures, where the project here has none yet.
  for (const p of records.projects || []) {
    const { rowCount } = await client.query(
      `UPDATE projects SET counterparty_id = COALESCE(counterparty_id, $3), contract_laari = COALESCE(contract_laari, $4), budget_laari = COALESCE(budget_laari, $5)
        WHERE company_id = $1 AND lower(name) = lower($2)
          AND ((counterparty_id IS NULL AND $3::uuid IS NOT NULL) OR (contract_laari IS NULL AND $4::bigint IS NOT NULL) OR (budget_laari IS NULL AND $5::bigint IS NOT NULL))`,
      [companyId, p.name, p.customer ? await party(p.customer, "customer") : null, p.contract ? p.contract.toString() : null, p.budget ? p.budget.toString() : null]
    );
    done.projects += rowCount;
  }
  // The invoices, bills and payments, as documents on the entries the books already hold.
  done.documents = await require("./zohoDocs").bring(client, { companyId, userId, records, system });
  return done;
}

module.exports = { bring };
