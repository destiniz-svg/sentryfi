/**
 * The auditor's workspace: a period, its seal, and samples drawn from it.
 *
 * It reads the books and never changes them. What it keeps is its own: the
 * period asked about, the seal as last checked, each sample as drawn, and
 * which items in it have been seen, with the note made.
 */
const { assumeIdentity } = require("./post");
const { verifyChain } = require("./verify");
const { formatLaari, toLaari } = require("./money");

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const f = (laari) => formatLaari(BigInt(laari));

// What can be sampled: what went into the books in the period and still stands.
const POPULATION = {
  bill: `SELECT b.id, b.bill_no AS no, COALESCE(b.issue_date, b.received_at::date)::text AS day, c.name AS party, b.gross_laari AS amount
           FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1 AND b.entry_id IS NOT NULL AND b.voided_at IS NULL
            AND COALESCE(b.issue_date, b.received_at::date) BETWEEN $2 AND $3`,
  invoice: `SELECT i.id, i.invoice_no AS no, i.issue_date::text AS day, c.name AS party, i.gross_laari AS amount
              FROM sales_invoices i LEFT JOIN counterparties c ON c.id = i.counterparty_id
             WHERE i.company_id = $1 AND i.entry_id IS NOT NULL AND i.voided_at IS NULL AND i.issue_date BETWEEN $2 AND $3`,
  entry: `SELECT e.id, e.entry_no::text AS no, e.entry_date::text AS day, e.narrative AS party,
                 (SELECT COALESCE(SUM(l.debit_laari), 0) FROM journal_lines l WHERE l.entry_id = e.id) AS amount
            FROM journal_entries e
           WHERE e.company_id = $1 AND e.entry_date BETWEEN $2 AND $3`,
};
const KINDS = Object.keys(POPULATION);

async function periodRow(client, companyId, periodId) {
  const { rows } = await client.query("SELECT * FROM audit_periods WHERE id = $1 AND company_id = $2", [periodId, companyId]);
  if (!rows[0]) throw new Error("No such period under audit here.");
  return rows[0];
}

/**
 * The seal over the period: the whole chain is read (a break before the period
 * breaks every entry after it), and the problems are sorted into those inside
 * the period and those elsewhere.
 */
async function checkSeal(client, { companyId, userId, periodId }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await periodRow(client, companyId, periodId);
  const chain = await verifyChain(client, { companyId, userId });
  const { rows } = await client.query(
    "SELECT MIN(entry_no) AS first, MAX(entry_no) AS last, COUNT(*)::int AS n FROM journal_entries WHERE company_id = $1 AND entry_date BETWEEN $2 AND $3",
    [companyId, p.from_date, p.to_date]
  );
  const { rows: inPeriod } = await client.query(
    "SELECT entry_no::text AS no FROM journal_entries WHERE company_id = $1 AND entry_date BETWEEN $2 AND $3",
    [companyId, p.from_date, p.to_date]
  );
  const mine = new Set(inPeriod.map((r) => r.no));
  const problems = chain.problems.map((x) => ({ ...x, inPeriod: mine.has(x.entryNo) }));
  const ok = problems.length === 0;
  await client.query(
    "UPDATE audit_periods SET seal_checked_at = now(), seal_ok = $3, seal_entries = $4, seal_problems = $5::jsonb WHERE id = $1 AND company_id = $2",
    [periodId, companyId, ok, rows[0].n, JSON.stringify(problems)]
  );
  return { ok, entries: rows[0].n, checked: chain.checked, problems };
}

async function createPeriod(client, { companyId, userId, name, from, to }) {
  await assumeIdentity(client, { companyId, userId });
  if (!DAY.test(from || "") || !DAY.test(to || "")) throw new Error("Say the first and last day of the period.");
  if (to < from) throw new Error("The period ends before it starts.");
  const label = String(name || "").trim() || `${from} to ${to}`;
  const { rows } = await client.query(
    "INSERT INTO audit_periods (company_id, name, from_date, to_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [companyId, label.slice(0, 120), from, to, userId]
  );
  const seal = await checkSeal(client, { companyId, userId, periodId: rows[0].id });
  return { id: rows[0].id, seal };
}

const showPeriod = (p) => ({
  id: p.id, name: p.name, from: p.from_date_text, to: p.to_date_text,
  seal: p.seal_checked_at ? { at: p.seal_checked_at, ok: p.seal_ok, entries: p.seal_entries, problems: p.seal_problems || [] } : null,
});

async function periods(client, { companyId }) {
  const { rows } = await client.query(
    "SELECT *, from_date::text AS from_date_text, to_date::text AS to_date_text FROM audit_periods WHERE company_id = $1 ORDER BY to_date DESC, created_at DESC",
    [companyId]
  );
  return rows.map(showPeriod);
}

async function period(client, { companyId, periodId }) {
  const { rows } = await client.query(
    "SELECT *, from_date::text AS from_date_text, to_date::text AS to_date_text FROM audit_periods WHERE id = $1 AND company_id = $2",
    [periodId, companyId]
  );
  if (!rows[0]) throw new Error("No such period under audit here.");
  const { rows: samples } = await client.query(
    `SELECT s.*, u.name AS by_name,
            (SELECT COUNT(*)::int FROM audit_sample_items i WHERE i.sample_id = s.id) AS items,
            (SELECT COUNT(*)::int FROM audit_sample_items i WHERE i.sample_id = s.id AND i.seen_at IS NOT NULL) AS seen
       FROM audit_samples s LEFT JOIN users u ON u.id = s.created_by
      WHERE s.company_id = $1 AND s.period_id = $2 ORDER BY s.created_at`,
    [companyId, periodId]
  );
  return {
    ...showPeriod(rows[0]),
    samples: samples.map((s) => ({
      id: s.id, kind: s.kind, how: s.how, size: s.size, over: s.over_laari === null ? null : f(s.over_laari),
      population: s.population, items: s.items, seen: s.seen, by: s.by_name, at: s.created_at,
    })),
  };
}

/**
 * A sample: so many at random, or every one worth at least an amount. Kept as
 * drawn, with what each item said then, so it can be shown again unchanged.
 */
async function draw(client, { companyId, userId, periodId, kind, how, size, over }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await periodRow(client, companyId, periodId);
  if (!KINDS.includes(kind)) throw new Error("Sample bills, invoices or entries.");
  const params = [companyId, p.from_date, p.to_date];
  const { rows: all } = await client.query(`SELECT COUNT(*)::int AS n FROM (${POPULATION[kind]}) x`, params);
  let picked;
  let n = null;
  let floor = null;
  if (how === "random") {
    n = Number(size);
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error("Draw between 1 and 200 at random.");
    picked = (await client.query(`SELECT * FROM (${POPULATION[kind]}) x ORDER BY random() LIMIT ${n}`, params)).rows;
  } else if (how === "over") {
    floor = toLaari(String(over ?? "").replace(/,/g, ""));
    if (floor <= 0n) throw new Error("Say the amount: every one worth at least this is drawn.");
    // ponytail: capped at 500 items; a larger sample is a sign the amount is too low.
    picked = (await client.query(`SELECT * FROM (${POPULATION[kind]}) x WHERE amount >= $4 ORDER BY amount DESC LIMIT 500`, [...params, floor.toString()])).rows;
  } else throw new Error("Draw at random, or by value.");
  if (!picked.length) throw new Error(`There is nothing to draw: no ${kind === "entry" ? "entries" : `${kind}s`} in the period${floor !== null ? " worth that much" : ""}.`);
  const { rows } = await client.query(
    "INSERT INTO audit_samples (company_id, period_id, kind, how, size, over_laari, population, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    [companyId, periodId, kind, how, n, floor === null ? null : floor.toString(), all[0].n, userId]
  );
  for (const it of picked) {
    await client.query(
      "INSERT INTO audit_sample_items (company_id, sample_id, doc_id, doc_no, doc_date, party, amount_laari) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [companyId, rows[0].id, it.id, it.no, it.day, it.party, String(it.amount)]
    );
  }
  return { id: rows[0].id, drawn: picked.length, population: all[0].n };
}

async function sample(client, { companyId, sampleId }) {
  const { rows } = await client.query("SELECT s.*, p.name AS period FROM audit_samples s JOIN audit_periods p ON p.id = s.period_id WHERE s.id = $1 AND s.company_id = $2", [sampleId, companyId]);
  if (!rows[0]) throw new Error("No such sample here.");
  const s = rows[0];
  const { rows: items } = await client.query(
    `SELECT i.*, i.doc_date::text AS day, u.name AS seen_name FROM audit_sample_items i LEFT JOIN users u ON u.id = i.seen_by
      WHERE i.sample_id = $1 AND i.company_id = $2 ORDER BY i.amount_laari DESC, i.doc_no`,
    [sampleId, companyId]
  );
  return {
    id: s.id, periodId: s.period_id, period: s.period, kind: s.kind, how: s.how, size: s.size, over: s.over_laari === null ? null : f(s.over_laari), population: s.population,
    items: items.map((i) => ({ id: i.id, docId: i.doc_id, no: i.doc_no, on: i.day, party: i.party, amount: f(i.amount_laari), seen: i.seen_at ? { at: i.seen_at, by: i.seen_name } : null, note: i.note })),
  };
}

/** A journal entry as the auditor reads it: its lines, by account. */
async function entryOf(client, companyId, entryId) {
  if (!entryId) return null;
  const { rows } = await client.query("SELECT id, entry_no::text AS no, entry_date::text AS day, source, narrative FROM journal_entries WHERE id = $1 AND company_id = $2", [entryId, companyId]);
  if (!rows[0]) return null;
  const { rows: lines } = await client.query(
    `SELECT a.code, a.name, l.debit_laari, l.credit_laari, l.memo FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.entry_id = $1 ORDER BY l.position`,
    [entryId]
  );
  const { day, ...entry } = rows[0];
  return { ...entry, on: day, lines: lines.map((l) => ({ account: `${l.code} ${l.name}`, debit: f(l.debit_laari), credit: f(l.credit_laari), memo: l.memo })) };
}

const files = (client, companyId, column, id) =>
  client.query(`SELECT id, filename, content_type FROM attachments WHERE company_id = $1 AND ${column} = $2 AND hidden_at IS NULL ORDER BY uploaded_at`, [companyId, id]).then((r) => r.rows);

/** Everything behind one sampled item: the document, its entry, the money against it, and its papers. */
async function evidence(client, { companyId, sampleId, itemId }) {
  const { rows } = await client.query(
    "SELECT i.doc_id, s.kind FROM audit_sample_items i JOIN audit_samples s ON s.id = i.sample_id WHERE i.id = $1 AND i.sample_id = $2 AND i.company_id = $3",
    [itemId, sampleId, companyId]
  );
  if (!rows[0]) throw new Error("No such item in that sample.");
  const { doc_id: id, kind } = rows[0];
  if (kind === "entry") return { kind, entry: await entryOf(client, companyId, id), files: await files(client, companyId, "entry_id", id) };
  if (kind === "bill") {
    const { rows: b } = await client.query(
      `SELECT b.*, COALESCE(b.issue_date, b.received_at::date)::text AS day, c.name AS party FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id WHERE b.id = $1 AND b.company_id = $2`,
      [id, companyId]
    );
    const bill = b[0];
    const { rows: lines } = await client.query("SELECT description, quantity::text AS quantity, net_laari, tax_laari FROM bill_lines WHERE bill_id = $1 AND company_id = $2 ORDER BY position", [id, companyId]);
    const { rows: paid } = await client.query(
      `SELECT r.paid_on::text AS day, r.reference, p.amount_laari, r.reversed_at FROM payment_items p JOIN payment_runs r ON r.id = p.run_id WHERE p.bill_id = $1 AND p.company_id = $2 ORDER BY r.paid_on`,
      [id, companyId]
    );
    return {
      kind,
      document: { no: bill.bill_no, on: bill.day, party: bill.party, net: f(bill.net_laari), tax: f(bill.tax_laari), gross: f(bill.gross_laari), status: bill.status, href: `/bills/${id}` },
      lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, net: f(l.net_laari), tax: f(l.tax_laari) })),
      entry: await entryOf(client, companyId, bill.entry_id),
      money: paid.map((p) => ({ on: p.day, what: p.reference ? `Paid, ${p.reference}` : "Paid", amount: f(p.amount_laari), undone: Boolean(p.reversed_at) })),
      files: await files(client, companyId, "bill_id", id),
    };
  }
  const { rows: inv } = await client.query(
    "SELECT i.*, i.issue_date::text AS day, c.name AS party FROM sales_invoices i LEFT JOIN counterparties c ON c.id = i.counterparty_id WHERE i.id = $1 AND i.company_id = $2",
    [id, companyId]
  );
  const invoice = inv[0];
  const { rows: lines } = await client.query("SELECT description, quantity::text AS quantity, net_laari, tax_laari FROM sales_invoice_lines WHERE invoice_id = $1 AND company_id = $2 ORDER BY position", [id, companyId]);
  const { rows: got } = await client.query(
    `SELECT r.received_on::text AS day, a.amount_laari, r.voided_at FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id WHERE a.invoice_id = $1 AND a.company_id = $2 ORDER BY r.received_on`,
    [id, companyId]
  );
  return {
    kind,
    document: { no: invoice.invoice_no, on: invoice.day, party: invoice.party, net: f(invoice.net_laari), tax: f(invoice.tax_laari), gross: f(invoice.gross_laari), status: invoice.status, href: "/invoices" },
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, net: f(l.net_laari), tax: f(l.tax_laari) })),
    entry: await entryOf(client, companyId, invoice.entry_id),
    money: got.map((r) => ({ on: r.day, what: "Received", amount: f(r.amount_laari), undone: Boolean(r.voided_at) })),
    files: await files(client, companyId, "sales_invoice_id", id),
  };
}

/** Ticked as seen, with a note; or the tick taken back. */
async function see(client, { companyId, userId, sampleId, itemId, seen, note }) {
  await assumeIdentity(client, { companyId, userId });
  const { rowCount } = await client.query(
    `UPDATE audit_sample_items SET seen_by = CASE WHEN $4 THEN $5::uuid END, seen_at = CASE WHEN $4 THEN now() END, note = $6
      WHERE id = $1 AND sample_id = $2 AND company_id = $3`,
    [itemId, sampleId, companyId, seen !== false, userId, String(note || "").trim().slice(0, 500) || null]
  );
  if (!rowCount) throw new Error("No such item in that sample.");
  return { seen: seen !== false };
}

module.exports = { createPeriod, checkSeal, periods, period, draw, sample, evidence, see, KINDS };
