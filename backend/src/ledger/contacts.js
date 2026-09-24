/**
 * Customers and suppliers: one record per business, whichever side of the
 * money it is on (a contractor can be both). What each owes, or is owed, is
 * read from the ledger itself (money owed to us on 1300, owed by us on 2100,
 * each line tagged to its party), so this page can never disagree with the
 * balance sheet. The detail is what the owner asks before picking up the
 * phone: how late, how old, how they usually pay, and what happened lately.
 */
const ApiError = require("../utils/ApiError");
const { formatLaari, toLaari } = require("./money");
const { today: localToday } = require("./today");
const sales = require("./sales");

const AR = "1300";
const AP = "2100";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const f = (v) => formatLaari(BigInt(v || 0));

/** What each party owes us and we owe them, straight from the ledger, plus the last time anything happened. */
async function balances(client, companyId) {
  const { rows } = await client.query(
    `SELECT l.counterparty_id AS id,
            SUM(CASE WHEN a.code = $2 THEN l.debit_laari - l.credit_laari ELSE 0 END) AS receivable,
            SUM(CASE WHEN a.code = $3 THEN l.credit_laari - l.debit_laari ELSE 0 END) AS payable,
            MAX(e.entry_date) AS last_on
       FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id
       JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.company_id = $1 AND l.counterparty_id IS NOT NULL
      GROUP BY l.counterparty_id`,
    [companyId, AR, AP]
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Money owed to us that is past its due date, per customer (on-account money already taken off). */
function overdueByCustomer(aged) {
  const out = new Map();
  for (const i of aged.invoices) {
    if (i.daysOver <= 0) continue;
    const o = out.get(i.customerId) || { laari: 0n, oldest: 0 };
    o.laari += BigInt(i.outstandingLaari);
    o.oldest = Math.max(o.oldest, i.daysOver);
    out.set(i.customerId, o);
  }
  return out;
}

async function list(client, { companyId }) {
  const today = localToday();
  const { rows } = await client.query(
    `SELECT id, name, kind::text[] AS kind, email, phone, tin, gst_number, tags, payment_terms_days, archived_at, created_at
       FROM counterparties WHERE company_id = $1 ORDER BY lower(name)`,
    [companyId]
  );
  const money = await balances(client, companyId);
  const aged = await sales.aged(client, { companyId });
  const late = overdueByCustomer(aged);
  // Bills due within the week, per supplier.
  const { rows: dueSoon } = await client.query(
    `SELECT b.counterparty_id AS id, SUM(b.gross_laari - COALESCE(p.paid, 0)) AS laari
       FROM bills b
       LEFT JOIN (SELECT pi.bill_id, SUM(pi.amount_laari) AS paid FROM payment_items pi JOIN payment_runs r ON r.id = pi.run_id AND r.reversed_at IS NULL GROUP BY pi.bill_id) p ON p.bill_id = b.id
      WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND b.fc_gross IS NULL
        AND b.gross_laari > COALESCE(p.paid, 0) AND COALESCE(b.due_date, b.issue_date) <= $2::date + 7
      GROUP BY b.counterparty_id`,
    [companyId, today]
  );
  const soon = new Map(dueSoon.map((r) => [r.id, BigInt(r.laari)]));

  let receivable = 0n;
  let overdue = 0n;
  let payable = 0n;
  let dueWeek = 0n;
  const contacts = rows.map((c) => {
    const m = money.get(c.id);
    const rec = BigInt(m?.receivable || 0);
    const pay = BigInt(m?.payable || 0);
    const l = late.get(c.id);
    const s = soon.get(c.id) || 0n;
    if (!c.archived_at) {
      receivable += rec > 0n ? rec : 0n;
      payable += pay > 0n ? pay : 0n;
      overdue += l?.laari || 0n;
      dueWeek += s;
    }
    return {
      id: c.id,
      name: c.name,
      customer: c.kind.includes("customer"),
      supplier: c.kind.includes("supplier"),
      email: c.email,
      phone: c.phone,
      tin: c.tin,
      tags: c.tags,
      archived: Boolean(c.archived_at),
      receivable: f(rec),
      receivableLaari: rec.toString(),
      payable: f(pay),
      payableLaari: pay.toString(),
      overdue: l ? f(l.laari) : null,
      oldestDays: l?.oldest || 0,
      dueThisWeek: s > 0n ? f(s) : null,
      lastOn: m?.last_on || null,
      since: c.created_at,
    };
  });
  return {
    contacts,
    totals: { receivable: f(receivable), overdue: f(overdue), payable: f(payable), dueThisWeek: f(dueWeek) },
  };
}

async function party(client, { companyId, id }) {
  if (!UUID.test(String(id))) throw ApiError.notFound("There is no such contact.");
  const { rows } = await client.query("SELECT *, kind::text[] AS kind FROM counterparties WHERE id = $1 AND company_id = $2", [id, companyId]);
  if (!rows.length) throw ApiError.notFound("There is no such contact.");
  return rows[0];
}

/** One customer or supplier: who they are, where the money stands, how they pay, and what happened lately. */
async function show(client, { companyId, id }) {
  const c = await party(client, { companyId, id });
  const m = (await balances(client, companyId)).get(id);
  const aged = await sales.aged(client, { companyId });
  const mine = aged.invoices.filter((i) => i.customerId === id);
  const buckets = { current: 0n, thirty: 0n, sixty: 0n, ninety: 0n, older: 0n };
  for (const i of mine) buckets[i.bucket] += BigInt(i.outstandingLaari);

  // How they pay: invoices settled in full over the last year, from the day
  // issued to the day the last of it arrived.
  const { rows: pays } = await client.query(
    `SELECT round(avg(p.last_on - s.issue_date))::int AS days, count(*)::int AS n,
            round(avg(p.last_on - COALESCE(s.due_date, s.issue_date + 30)))::int AS late
       FROM sales_invoices s
       JOIN LATERAL (SELECT MAX(r.received_on) AS last_on, SUM(a.amount_laari) AS paid
                       FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
                      WHERE a.invoice_id = s.id) p ON true
      WHERE s.company_id = $1 AND s.counterparty_id = $2 AND s.status = 'posted' AND s.voided_at IS NULL
        AND p.paid >= s.gross_laari AND p.last_on >= $3::date - 365`,
    [companyId, id, localToday()]
  );
  const { rows: year } = await client.query(
    `SELECT COALESCE((SELECT SUM(gross_laari) FROM sales_invoices WHERE company_id = $1 AND counterparty_id = $2 AND status = 'posted' AND voided_at IS NULL AND issue_date >= $3::date - 365), 0) AS sold,
            COALESCE((SELECT SUM(gross_laari) FROM bills WHERE company_id = $1 AND counterparty_id = $2 AND status = 'posted' AND voided_at IS NULL AND COALESCE(issue_date, received_at::date) >= $3::date - 365), 0) AS bought,
            COALESCE((SELECT SUM(amount_laari) FROM receipts WHERE company_id = $1 AND counterparty_id = $2 AND voided_at IS NULL AND received_on >= $3::date - 365), 0) AS received`,
    [companyId, id, localToday()]
  );

  // What is still open with them: invoices they owe, bills we owe.
  const { rows: bills } = await client.query(
    `SELECT b.id, b.bill_no, COALESCE(b.due_date, b.issue_date)::text AS due, b.gross_laari - COALESCE(p.paid, 0) AS left
       FROM bills b
       LEFT JOIN (SELECT pi.bill_id, SUM(pi.amount_laari) AS paid FROM payment_items pi JOIN payment_runs r ON r.id = pi.run_id AND r.reversed_at IS NULL GROUP BY pi.bill_id) p ON p.bill_id = b.id
      WHERE b.company_id = $1 AND b.counterparty_id = $2 AND b.status = 'posted' AND b.voided_at IS NULL AND b.fc_gross IS NULL AND b.gross_laari > COALESCE(p.paid, 0)
      ORDER BY 3 NULLS LAST`,
    [companyId, id]
  );

  const { rows: people } = await client.query(
    "SELECT id, name, role, phone, email, for_accounts FROM contact_people WHERE company_id = $1 AND counterparty_id = $2 AND removed_at IS NULL ORDER BY for_accounts DESC, created_at",
    [companyId, id]
  );
  const { rows: doubts } = await client.query(
    `SELECT o.id, o.field, o.value, o.source_kind, o.source_id, o.observed_at FROM counterparty_observations o
      WHERE o.company_id = $1 AND o.counterparty_id = $2 AND o.outcome = 'conflict' ORDER BY o.observed_at DESC`,
    [companyId, id]
  );

  return {
    id: c.id,
    name: c.name,
    customer: c.kind.includes("customer"),
    supplier: c.kind.includes("supplier"),
    archived: Boolean(c.archived_at),
    details: {
      email: c.email, phone: c.phone, address: c.address, tin: c.tin, gstNumber: c.gst_number, gstRegistered: c.gst_registered,
      paymentTermsDays: c.payment_terms_days, creditLimit: c.credit_limit_laari != null ? f(c.credit_limit_laari) : null,
      notes: c.notes, tags: c.tags, alsoKnownAs: c.also_known_as,
      // The last four digits only: enough to recognise, not enough to misuse from a screenshot.
      bankAccounts: (c.bank_accounts || []).map((a) => `····${String(a).replace(/\s/g, "").slice(-4)}`),
    },
    money: {
      receivable: f(m?.receivable),
      receivableLaari: String(m?.receivable || 0),
      payable: f(m?.payable),
      payableLaari: String(m?.payable || 0),
      overdue: f(mine.filter((i) => i.daysOver > 0).reduce((a, i) => a + BigInt(i.outstandingLaari), 0n)),
      aging: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, f(v)])),
      agingLaari: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.toString()])),
      soldYear: f(year[0].sold),
      boughtYear: f(year[0].bought),
      receivedYear: f(year[0].received),
      overLimit: c.credit_limit_laari != null && BigInt(m?.receivable || 0) > BigInt(c.credit_limit_laari),
    },
    pays: pays[0].n ? { days: pays[0].days, late: pays[0].late, invoices: pays[0].n, terms: c.payment_terms_days } : null,
    open: {
      invoices: mine.map((i) => ({ id: i.id, number: i.invoiceNo, due: i.dueDate, outstanding: i.outstanding, daysOver: i.daysOver })),
      bills: bills.map((b) => ({ id: b.id, number: b.bill_no, due: b.due, outstanding: f(b.left) })),
    },
    people: people.map((p) => ({ id: p.id, name: p.name, role: p.role, phone: p.phone, email: p.email, forAccounts: p.for_accounts })),
    doubts: doubts.map((d) => ({
      id: d.id,
      field: d.field,
      value: d.field === "bank_account" ? `····${String(d.value).replace(/\s/g, "").slice(-4)}` : d.value,
      from: d.source_kind === "bill" && d.source_id ? `/bills/${d.source_id}` : null,
      at: d.observed_at,
    })),
    activity: await activity(client, { companyId, id }),
  };
}

/** What happened with them, newest first: documents, money in, money out. */
async function activity(client, { companyId, id }) {
  const { rows } = await client.query(
    `SELECT * FROM (
       SELECT 'invoice' AS kind, s.id, s.issue_date AS on, 'Invoice ' || s.invoice_no AS what, s.gross_laari AS laari, '/documents/invoice/' || s.id AS href
         FROM sales_invoices s WHERE s.company_id = $1 AND s.counterparty_id = $2 AND s.status = 'posted' AND s.voided_at IS NULL
       UNION ALL
       SELECT 'received', r.id, r.received_on, 'Paid you' || COALESCE(' · ' || r.reference, ''), r.amount_laari, NULL
         FROM receipts r WHERE r.company_id = $1 AND r.counterparty_id = $2 AND r.voided_at IS NULL
       UNION ALL
       SELECT 'credit', n.id, n.issue_date, 'Credit note ' || n.note_no, n.gross_laari, '/documents/credit_note/' || n.id
         FROM credit_notes n WHERE n.company_id = $1 AND n.counterparty_id = $2
       UNION ALL
       SELECT 'order', o.id, o.ordered_on, CASE o.kind WHEN 'quote' THEN 'Quote ' WHEN 'sale' THEN 'Sales order ' ELSE 'Purchase order ' END || o.number, NULL, '/orders/' || o.id
         FROM orders o WHERE o.company_id = $1 AND o.counterparty_id = $2 AND o.cancelled_at IS NULL
       UNION ALL
       SELECT 'bill', b.id, COALESCE(b.issue_date, b.received_at::date), 'Bill' || COALESCE(' ' || b.bill_no, ''), b.gross_laari, '/bills/' || b.id
         FROM bills b WHERE b.company_id = $1 AND b.counterparty_id = $2 AND b.status = 'posted' AND b.voided_at IS NULL
       UNION ALL
       SELECT 'paid', pi.id, r.paid_on, 'You paid them' || COALESCE(' · ' || r.reference, ''), pi.amount_laari, NULL
         FROM payment_items pi JOIN payment_runs r ON r.id = pi.run_id AND r.reversed_at IS NULL JOIN bills b ON b.id = pi.bill_id
        WHERE pi.company_id = $1 AND b.counterparty_id = $2
       UNION ALL
       SELECT 'advance', q.id, q.issue_date, CASE q.kind WHEN 'proforma' THEN 'Proforma ' ELSE 'Retainer ' END || q.number, NULL, '/documents/' || q.kind || '/' || q.id
         FROM advance_requests q WHERE q.company_id = $1 AND q.counterparty_id = $2
     ) t ORDER BY t.on DESC NULLS LAST LIMIT 40`,
    [companyId, id]
  );
  return rows.map((r) => ({ kind: r.kind, id: r.id, on: r.on instanceof Date ? r.on.toISOString().slice(0, 10) : r.on, what: r.what, amount: r.laari != null ? f(r.laari) : null, href: r.href }));
}

const clean = (v) => (typeof v === "string" ? v.trim() || null : v ?? null);

/**
 * Close matches already on file: the same TIN or GST number, the same phone,
 * or a name that reads the same. Adding a second record for one business is
 * the mistake every contacts list collects.
 */
// A name without what every company name carries: "Pvt Ltd", "LLC", "FZE", punctuation.
const BARE = (x) => `btrim(regexp_replace(regexp_replace(' ' || regexp_replace(lower(${x}), '[^a-z0-9]+', ' ', 'g') || ' ', ' (pvt|private|ltd|limited|llc|fze|fzco|fzllc|co|company|the|and)(?= )', ' ', 'g'), ' +', ' ', 'g'))`;

async function lookalikes(client, { companyId, name, tin, gstNumber, phone, except = null }) {
  const { rows } = await client.query(
    `SELECT id, name, kind::text[] AS kind,
            CASE WHEN $3::text IS NOT NULL AND replace(lower(tin), ' ', '') = replace(lower($3), ' ', '') THEN 'the same TIN'
                 WHEN $4::text IS NOT NULL AND replace(lower(gst_number), ' ', '') = replace(lower($4), ' ', '') THEN 'the same GST number'
                 WHEN $5::text IS NOT NULL AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 7) = right(regexp_replace($5, '[^0-9]', '', 'g'), 7) THEN 'the same phone'
                 ELSE 'a similar name' END AS why
       FROM counterparties
      WHERE company_id = $1 AND archived_at IS NULL AND ($6::uuid IS NULL OR id <> $6)
        AND ((${BARE("name")} = ${BARE("$2")} OR similarity(${BARE("name")}, ${BARE("$2")}) >= 0.55)
             OR ($3::text IS NOT NULL AND replace(lower(tin), ' ', '') = replace(lower($3), ' ', ''))
             OR ($4::text IS NOT NULL AND replace(lower(gst_number), ' ', '') = replace(lower($4), ' ', ''))
             OR ($5::text IS NOT NULL AND length(regexp_replace($5, '[^0-9]', '', 'g')) >= 7 AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 7) = right(regexp_replace($5, '[^0-9]', '', 'g'), 7)))
      LIMIT 5`,
    [companyId, name, clean(tin), clean(gstNumber), clean(phone), except]
  );
  return rows;
}

const FIELDS = { email: "email", phone: "phone", address: "address", tin: "tin", gstNumber: "gst_number", notes: "notes", paymentTermsDays: "payment_terms_days" };

async function create(client, { companyId, body, force = false }) {
  const name = clean(body.name);
  if (!name) throw ApiError.badRequest("Give them a name.");
  const kind = [body.customer && "customer", body.supplier && "supplier"].filter(Boolean);
  if (!kind.length) throw ApiError.badRequest("Say whether they buy from you, sell to you, or both.");
  if (!force) {
    const like = await lookalikes(client, { companyId, name, tin: body.tin, gstNumber: body.gstNumber, phone: body.phone });
    if (like.length) throw ApiError.conflict("This may already be on file.", { lookalikes: like });
  }
  const { rows } = await client.query(
    `INSERT INTO counterparties (company_id, name, kind, email, phone, address, tin, gst_number, notes, payment_terms_days, credit_limit_laari, tags)
     VALUES ($1,$2,$3::cp_t[],$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [companyId, name, kind, clean(body.email), clean(body.phone), clean(body.address), clean(body.tin), clean(body.gstNumber), clean(body.notes),
     body.paymentTermsDays ?? null, body.creditLimit ? toLaari(body.creditLimit).toString() : null, (body.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 10)]
  );
  return rows[0].id;
}

async function update(client, { companyId, id, body }) {
  await party(client, { companyId, id });
  const sets = [];
  const vals = [id, companyId];
  const set = (col, v) => (vals.push(v), sets.push(`${col} = $${vals.length}`));
  if (body.name !== undefined) {
    if (!clean(body.name)) throw ApiError.badRequest("Give them a name.");
    set("name", clean(body.name));
  }
  for (const [k, col] of Object.entries(FIELDS)) if (body[k] !== undefined) set(col, k === "paymentTermsDays" ? body[k] : clean(body[k]));
  if (body.creditLimit !== undefined) set("credit_limit_laari", body.creditLimit ? toLaari(body.creditLimit).toString() : null);
  if (body.tags !== undefined) set("tags", (body.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 10));
  if (body.customer !== undefined || body.supplier !== undefined) {
    const kind = [body.customer && "customer", body.supplier && "supplier"].filter(Boolean);
    if (!kind.length) throw ApiError.badRequest("They must be a customer, a supplier, or both.");
    vals.push(kind);
    sets.push(`kind = $${vals.length}::cp_t[]`);
  }
  if (body.archived !== undefined) sets.push(body.archived ? "archived_at = COALESCE(archived_at, now())" : "archived_at = NULL");
  if (sets.length) await client.query(`UPDATE counterparties SET ${sets.join(", ")} WHERE id = $1 AND company_id = $2`, vals);
}

/**
 * A detail a document disagreed with (a new bank account, another TIN):
 * take it, or keep what is on file. Taking a new bank account adds it first,
 * so it is the one a payment run uses from now on.
 */
async function settleDoubt(client, { companyId, userId, id, doubtId, take }) {
  const c = await party(client, { companyId, id });
  const { rows } = await client.query("SELECT * FROM counterparty_observations WHERE id = $1 AND company_id = $2 AND counterparty_id = $3 AND outcome = 'conflict'", [doubtId, companyId, id]);
  if (!rows.length) throw ApiError.notFound("That has already been settled.");
  const d = rows[0];
  if (take) {
    if (d.field === "bank_account") await client.query("UPDATE counterparties SET bank_accounts = array_prepend($3, array_remove(bank_accounts, $3)) WHERE id = $1 AND company_id = $2", [id, companyId, d.value]);
    else if (d.field === "tin" || d.field === "gst_number") await client.query(`UPDATE counterparties SET ${d.field} = $3 WHERE id = $1 AND company_id = $2`, [id, companyId, d.value]);
  }
  await client.query("UPDATE counterparty_observations SET outcome = $4, resolved_at = now(), resolved_by = $3 WHERE id = $1 AND company_id = $2", [doubtId, companyId, userId, take ? "applied" : "superseded"]);
  return c.id;
}

async function savePerson(client, { companyId, id, person }) {
  await party(client, { companyId, id });
  const name = clean(person.name);
  if (!name) throw ApiError.badRequest("Give the person a name.");
  if (person.forAccounts) await client.query("UPDATE contact_people SET for_accounts = false WHERE company_id = $1 AND counterparty_id = $2", [companyId, id]);
  if (person.id) {
    if (!UUID.test(person.id)) throw ApiError.notFound("No such person.");
    await client.query(
      "UPDATE contact_people SET name = $4, role = $5, phone = $6, email = $7, for_accounts = $8, removed_at = CASE WHEN $9 THEN now() ELSE NULL END WHERE id = $1 AND company_id = $2 AND counterparty_id = $3",
      [person.id, companyId, id, name, clean(person.role), clean(person.phone), clean(person.email), Boolean(person.forAccounts), Boolean(person.removed)]
    );
  } else {
    await client.query("INSERT INTO contact_people (company_id, counterparty_id, name, role, phone, email, for_accounts) VALUES ($1,$2,$3,$4,$5,$6,$7)", [companyId, id, name, clean(person.role), clean(person.phone), clean(person.email), Boolean(person.forAccounts)]);
  }
}

module.exports = { list, show, create, update, lookalikes, settleDoubt, savePerson, activity };
