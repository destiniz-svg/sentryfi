/**
 * The auditor's workspace: a period, its seal, and samples drawn from it.
 *
 * It reads the books and never changes them. What it keeps is its own: the
 * period asked about, the seal as last checked, each sample as drawn, and
 * which items in it have been seen, with the note made.
 *
 * A sample can be proved (ISA 530): it keeps its seed and exact rule, and a
 * fingerprint of the population it was drawn from. Items are ranked by a hash
 * of the seed and their own id, so the same seed over the same population
 * always picks the same items; re-drawing it later either matches, or says
 * what changed.
 */
const crypto = require("crypto");
const { assumeIdentity } = require("./post");
const { verifyChain } = require("./verify");
const { formatLaari, toLaari } = require("./money");
const risk = require("./auditRisk");

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const f = (laari) => formatLaari(BigInt(laari));

/**
 * What can be sampled: what went into the books in the period and still
 * stands. Each row: id, no, day, party, amount (laari), entry_id.
 */
const POPULATION = {
  bill: `SELECT b.id, b.bill_no AS no, COALESCE(b.issue_date, b.received_at::date)::text AS day, c.name AS party, b.gross_laari AS amount, b.entry_id
           FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1 AND b.entry_id IS NOT NULL AND b.voided_at IS NULL
            AND COALESCE(b.issue_date, b.received_at::date) BETWEEN $2 AND $3`,
  invoice: `SELECT i.id, i.invoice_no AS no, i.issue_date::text AS day, c.name AS party, i.gross_laari AS amount, i.entry_id
              FROM sales_invoices i LEFT JOIN counterparties c ON c.id = i.counterparty_id
             WHERE i.company_id = $1 AND i.entry_id IS NOT NULL AND i.voided_at IS NULL AND i.issue_date BETWEEN $2 AND $3`,
  entry: `SELECT e.id, e.entry_no::text AS no, e.entry_date::text AS day, e.narrative AS party,
                 (SELECT COALESCE(SUM(l.debit_laari), 0) FROM journal_lines l WHERE l.entry_id = e.id) AS amount, e.id AS entry_id
            FROM journal_entries e
           WHERE e.company_id = $1 AND e.entry_date BETWEEN $2 AND $3`,
  payment: `SELECT r.id, COALESCE(NULLIF(r.reference, ''), 'Paid ' || r.paid_on::text) AS no, r.paid_on::text AS day,
                   (SELECT string_agg(DISTINCT c.name, ', ') FROM payment_items p JOIN bills b ON b.id = p.bill_id JOIN counterparties c ON c.id = b.counterparty_id WHERE p.run_id = r.id) AS party,
                   (SELECT COALESCE(SUM(p.amount_laari), 0) FROM payment_items p WHERE p.run_id = r.id) AS amount, r.entry_id
              FROM payment_runs r
             WHERE r.company_id = $1 AND r.reversed_at IS NULL AND r.paid_on BETWEEN $2 AND $3`,
  receipt: `SELECT r.id, 'RC-' || COALESCE(e.entry_no::text, upper(left(r.id::text, 8))) AS no, r.received_on::text AS day, c.name AS party, r.amount_laari AS amount, r.entry_id
              FROM receipts r LEFT JOIN counterparties c ON c.id = r.counterparty_id LEFT JOIN journal_entries e ON e.id = r.entry_id
             WHERE r.company_id = $1 AND r.entry_id IS NOT NULL AND r.voided_at IS NULL AND r.received_on BETWEEN $2 AND $3`,
  credit_note: `SELECT n.id, n.note_no AS no, n.issue_date::text AS day, c.name AS party, n.gross_laari AS amount, n.entry_id
                  FROM credit_notes n LEFT JOIN counterparties c ON c.id = n.counterparty_id
                 WHERE n.company_id = $1 AND n.entry_id IS NOT NULL AND n.issue_date BETWEEN $2 AND $3`,
  claim: `SELECT x.id, x.number AS no, (x.approved_at AT TIME ZONE 'Indian/Maldives')::date::text AS day, u.name AS party,
                 (SELECT COALESCE(SUM(l.amount_laari), 0) FROM expense_claim_lines l WHERE l.claim_id = x.id) AS amount, x.entry_id
            FROM expense_claims x JOIN users u ON u.id = x.claimant_id
           WHERE x.company_id = $1 AND x.entry_id IS NOT NULL AND (x.approved_at AT TIME ZONE 'Indian/Maldives')::date BETWEEN $2 AND $3`,
};
const KINDS = Object.keys(POPULATION);
const NAMES = { bill: "bills", invoice: "invoices", entry: "journal entries", payment: "payments", receipt: "receipts", credit_note: "credit notes", claim: "expense claims" };

async function periodRow(client, companyId, periodId) {
  const { rows } = await client.query("SELECT *, from_date::text AS from_text, to_date::text AS to_text, (SELECT name FROM users WHERE id = signed_off_by) AS signed_name FROM audit_periods WHERE id = $1 AND company_id = $2", [periodId, companyId]);
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
    "SELECT entry_no::text AS no FROM journal_entries WHERE company_id = $1 AND entry_date BETWEEN $2 AND $3",
    [companyId, p.from_date, p.to_date]
  );
  const mine = new Set(rows.map((r) => r.no));
  const problems = chain.problems.map((x) => ({ ...x, inPeriod: mine.has(x.entryNo) }));
  const ok = problems.length === 0;
  // A signed-off period keeps the seal as it stood at sign-off; a later check is reported, not stored.
  if (!p.signed_off_at) {
    await client.query(
      "UPDATE audit_periods SET seal_checked_at = now(), seal_ok = $3, seal_entries = $4, seal_problems = $5::jsonb WHERE id = $1 AND company_id = $2",
      [periodId, companyId, ok, rows.length, JSON.stringify(problems)]
    );
  }
  return { ok, entries: rows.length, checked: chain.checked, problems };
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
  id: p.id, name: p.name, from: p.from_text, to: p.to_text,
  seal: p.seal_checked_at ? { at: p.seal_checked_at, ok: p.seal_ok, entries: p.seal_entries, problems: p.seal_problems || [] } : null,
  signedOff: p.signed_off_at ? { at: p.signed_off_at, by: p.signed_name, opinion: p.opinion, note: p.signoff_note, head: p.signoff_head } : null,
});

async function periods(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT p.*, p.from_date::text AS from_text, p.to_date::text AS to_text, (SELECT name FROM users WHERE id = p.signed_off_by) AS signed_name,
            (SELECT COUNT(*)::int FROM audit_sample_items i JOIN audit_samples s ON s.id = i.sample_id WHERE s.period_id = p.id) AS items,
            (SELECT COUNT(*)::int FROM audit_sample_items i JOIN audit_samples s ON s.id = i.sample_id WHERE s.period_id = p.id AND i.seen_at IS NOT NULL) AS seen
       FROM audit_periods p WHERE p.company_id = $1 ORDER BY p.to_date DESC, p.created_at DESC`,
    [companyId]
  );
  return rows.map((p) => ({ ...showPeriod(p), items: p.items, seen: p.seen }));
}

/** A sample's rule, said the way an auditor would write it on the working paper. */
function ruleText(s) {
  const r = s.rule || { size: s.size, over: s.over_laari };
  const what = NAMES[s.kind];
  if (s.how === "random") return `${r.size} ${what} at random`;
  if (s.how === "over") return `Every one of the ${what} of MVR ${f(r.over)} or more`;
  if (s.how === "key") return `Every one of the ${what} of MVR ${f(r.over)} or more, and ${r.size} of the rest at random`;
  if (s.how === "mus") return `${r.size} ${what} by monetary unit, one hit every MVR ${f(r.interval || 0)}`;
  if (s.how === "risk") return `${r.size ? `${r.size} at random from the` : "Every one of the"} entries that ${(r.tests || []).map((t) => risk.TESTS[t]?.short || t).join(" or ")}`;
  return "";
}

async function period(client, { companyId, periodId }) {
  const p = await periodRow(client, companyId, periodId);
  const { rows: samples } = await client.query(
    `SELECT s.*, u.name AS by_name,
            (SELECT COUNT(*)::int FROM audit_sample_items i WHERE i.sample_id = s.id) AS items,
            (SELECT COUNT(*)::int FROM audit_sample_items i WHERE i.sample_id = s.id AND i.seen_at IS NOT NULL) AS seen,
            (SELECT COALESCE(SUM(i.amount_laari), 0) FROM audit_sample_items i WHERE i.sample_id = s.id) AS value
       FROM audit_samples s LEFT JOIN users u ON u.id = s.created_by
      WHERE s.company_id = $1 AND s.period_id = $2 ORDER BY s.created_at`,
    [companyId, periodId]
  );
  return {
    ...showPeriod(p),
    samples: samples.map((s) => ({
      id: s.id, kind: s.kind, how: s.how, said: ruleText(s), population: s.population,
      populationValue: s.population_laari === null ? null : f(s.population_laari), value: f(s.value),
      items: s.items, seen: s.seen, by: s.by_name, at: s.created_at,
    })),
  };
}

// ------------------------------------------------------------------ drawing

/** A fingerprint of what could be drawn from: every item's id and amount, in a fixed order. */
function fingerprint(rows) {
  const h = crypto.createHash("sha256");
  for (const r of [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))) h.update(`${r.id}:${r.amount}\n`);
  return h.digest("hex");
}

/** Each item's place in the seed's order: a hash of the seed and its id, so the order is fixed by the seed alone. */
const rank = (seed, id) => crypto.createHash("sha256").update(`${seed}:${id}`).digest("hex");
const bySeed = (seed, rows) => rows.map((r) => ({ ...r, rank: rank(seed, r.id) })).sort((a, b) => (a.rank < b.rank ? -1 : 1));
const byValue = (rows) => [...rows].sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : BigInt(b.amount) < BigInt(a.amount) ? -1 : 0));

/**
 * Monetary-unit sampling: the population laid end to end in a fixed order,
 * one hit every `interval` from a start fixed by the seed. An item worth more
 * than the interval is always hit (sometimes more than once, counted once).
 */
function mus(seed, rows, size) {
  const ordered = rows.filter((r) => BigInt(r.amount) > 0n).sort((a, b) => (`${a.day}|${a.no}|${a.id}` < `${b.day}|${b.no}|${b.id}` ? -1 : 1));
  const total = ordered.reduce((s, r) => s + BigInt(r.amount), 0n);
  if (total === 0n) return { picked: [], interval: 0n };
  const interval = total / BigInt(size) || 1n;
  let at = BigInt("0x" + rank(seed, "start").slice(0, 12)) % interval;
  const picked = [];
  let upTo = 0n;
  for (const r of ordered) {
    const from = upTo;
    upTo += BigInt(r.amount);
    let hits = 0;
    while (at < upTo) {
      if (at >= from) hits += 1;
      at += interval;
    }
    if (hits) picked.push({ ...r, why: BigInt(r.amount) >= interval ? `Worth more than the interval: always drawn${hits > 1 ? ` (${hits} hits)` : ""}` : "Monetary-unit hit" });
  }
  return { picked, interval };
}

async function populationOf(client, { companyId, p, kind }) {
  const { rows } = await client.query(POPULATION[kind], [companyId, p.from_date, p.to_date]);
  return rows.map((r) => ({ ...r, amount: String(r.amount) }));
}

/** The selection a rule makes over a population, with why each was chosen. */
async function select(client, { companyId, p, how, rule, seed, population }) {
  if (how === "random") return bySeed(seed, population).slice(0, rule.size).map((r) => ({ ...r, why: "At random" }));
  if (how === "over") return byValue(population.filter((r) => BigInt(r.amount) >= BigInt(rule.over))).slice(0, 500).map((r) => ({ ...r, why: `MVR ${f(rule.over)} or more` }));
  if (how === "key") {
    const key = byValue(population.filter((r) => BigInt(r.amount) >= BigInt(rule.over))).slice(0, 500).map((r) => ({ ...r, why: `Key item: MVR ${f(rule.over)} or more` }));
    const rest = bySeed(seed, population.filter((r) => BigInt(r.amount) < BigInt(rule.over))).slice(0, rule.size).map((r) => ({ ...r, why: "At random from the rest" }));
    return [...key, ...rest];
  }
  if (how === "mus") return mus(seed, population, rule.size).picked;
  if (how === "risk") {
    const screened = await risk.screen(client, { companyId, from: p.from_text, to: p.to_text });
    const flagged = new Map(screened.entries.map((e) => [e.id, e.flags.filter((x) => rule.tests.includes(x.test))]).filter(([, fl]) => fl.length));
    const hits = population.filter((r) => flagged.has(r.id)).map((r) => ({ ...r, why: flagged.get(r.id).map((x) => x.said).join("; ") }));
    return rule.size ? bySeed(seed, hits).slice(0, rule.size) : byValue(hits).slice(0, 500);
  }
  throw new Error("Draw at random, by value, key items and the rest, by monetary unit, or from the journal risks.");
}

function ruleFrom({ kind, how, size, over, tests }) {
  const n = size === undefined || size === null || size === "" ? null : Number(size);
  const needSize = how === "random" || how === "key" || how === "mus";
  if (needSize && n === null) throw new Error("Say how many to draw.");
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > 200)) throw new Error("Draw between 1 and 200.");
  const rule = {};
  if (n !== null && how !== "over") rule.size = n;
  if (how === "over" || how === "key") {
    const floor = toLaari(String(over ?? "").replace(/,/g, "") || "0");
    if (floor <= 0n) throw new Error("Say the amount: every one worth at least this is drawn.");
    rule.over = floor.toString();
  }
  if (how === "risk") {
    if (kind !== "entry") throw new Error("The journal risks are about entries: sample journal entries.");
    const t = (tests || []).filter((x) => risk.TESTS[x]);
    if (!t.length) throw new Error("Pick at least one risk to draw from.");
    rule.tests = t;
  }
  return rule;
}

/**
 * A sample, kept as drawn, with what each item said then and why it was
 * chosen. The seed is made here, never given, so the choice cannot be steered.
 */
async function draw(client, { companyId, userId, periodId, kind, how, size, over, tests }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await periodRow(client, companyId, periodId);
  if (!KINDS.includes(kind)) throw new Error("Sample bills, invoices, entries, payments, receipts, credit notes or claims.");
  const rule = ruleFrom({ kind, how, size, over, tests });
  const population = await populationOf(client, { companyId, p, kind });
  const seed = crypto.randomBytes(8).toString("hex");
  const picked = await select(client, { companyId, p, how, rule, seed, population });
  if (!picked.length) throw new Error(`There is nothing to draw: no ${NAMES[kind]} in the period${how === "over" || how === "risk" ? " that meet that" : ""}.`);
  if (how === "mus") rule.interval = mus(seed, population, rule.size).interval.toString();
  const total = population.reduce((s, r) => s + BigInt(r.amount), 0n);
  const { rows } = await client.query(
    `INSERT INTO audit_samples (company_id, period_id, kind, how, size, over_laari, population, population_laari, population_hash, seed, rule, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) RETURNING id`,
    [companyId, periodId, kind, how, rule.size || null, rule.over || null, population.length, total.toString(), fingerprint(population), seed, JSON.stringify(rule), userId]
  );
  for (const it of picked) {
    await client.query(
      "INSERT INTO audit_sample_items (company_id, sample_id, doc_id, doc_no, doc_date, party, amount_laari, why, entry_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [companyId, rows[0].id, it.id, it.no, it.day, it.party, it.amount, it.why || null, it.entry_id || null]
    );
  }
  return { id: rows[0].id, drawn: picked.length, population: population.length, seed };
}

/**
 * The proof: the same rule and seed run again over the population as it is
 * now. The same population must give the same items; if the population has
 * changed, it says how.
 */
async function prove(client, { companyId, sampleId }) {
  const { rows } = await client.query("SELECT * FROM audit_samples WHERE id = $1 AND company_id = $2", [sampleId, companyId]);
  const s = rows[0];
  if (!s) throw new Error("No such sample here.");
  if (!s.seed) return { provable: false, said: "This sample was drawn before samples kept their seed, so it can be shown as drawn but not re-drawn." };
  const p = await periodRow(client, companyId, s.period_id);
  const population = await populationOf(client, { companyId, p, kind: s.kind });
  const again = await select(client, { companyId, p, how: s.how, rule: s.rule, seed: s.seed, population });
  const { rows: kept } = await client.query("SELECT doc_id FROM audit_sample_items WHERE sample_id = $1", [sampleId]);
  const was = new Set(kept.map((k) => k.doc_id));
  const now = new Set(again.map((a) => a.id));
  const sameItems = was.size === now.size && [...was].every((x) => now.has(x));
  const samePopulation = fingerprint(population) === s.population_hash;
  const total = population.reduce((t, r) => t + BigInt(r.amount), 0n);
  return {
    provable: true, samePopulation, sameItems, seed: s.seed,
    then: { count: s.population, value: f(s.population_laari || 0) },
    now: { count: population.length, value: f(total) },
    said: samePopulation && sameItems
      ? `Re-drawn from the same ${s.population} ${NAMES[s.kind]} with seed ${s.seed}: the same ${was.size} items.`
      : samePopulation
        ? "The population is the same but the draw differs. This should not happen: tell Sentryfi."
        : `The ${NAMES[s.kind]} in the period have changed since the draw (${s.population} then, ${population.length} now; MVR ${f(s.population_laari || 0)} then, MVR ${f(total)} now). ${sameItems ? "The same items would still be drawn." : "A draw today would pick differently."}`,
  };
}

// ------------------------------------------------------------------ reading a sample

async function sample(client, { companyId, sampleId }) {
  const { rows } = await client.query("SELECT s.*, p.name AS period, p.signed_off_at FROM audit_samples s JOIN audit_periods p ON p.id = s.period_id WHERE s.id = $1 AND s.company_id = $2", [sampleId, companyId]);
  if (!rows[0]) throw new Error("No such sample here.");
  const s = rows[0];
  const { rows: items } = await client.query(
    `SELECT i.*, i.doc_date::text AS day, u.name AS seen_name,
            (SELECT r.entry_no::text FROM journal_entries r WHERE r.reverses_id = i.entry_id AND r.company_id = i.company_id LIMIT 1) AS reversed_by
       FROM audit_sample_items i LEFT JOIN users u ON u.id = i.seen_by
      WHERE i.sample_id = $1 AND i.company_id = $2 ORDER BY i.amount_laari DESC, i.doc_no`,
    [sampleId, companyId]
  );
  return {
    id: s.id, periodId: s.period_id, period: s.period, kind: s.kind, how: s.how, said: ruleText(s), seed: s.seed, signedOff: Boolean(s.signed_off_at),
    population: s.population, populationValue: s.population_laari === null ? null : f(s.population_laari),
    items: items.map((i) => ({
      id: i.id, docId: i.doc_id, no: i.doc_no, on: i.day, party: i.party, amount: f(i.amount_laari), why: i.why,
      // Reversed in the books after it was drawn: Tally's alert on an audited voucher, here for every item.
      changed: i.reversed_by ? `Reversed since, by entry ${i.reversed_by}` : null,
      seen: i.seen_at ? { at: i.seen_at, by: i.seen_name } : null, note: i.note,
    })),
  };
}

/** A journal entry as the auditor reads it: its lines by account, who posted it and when, and what reversed it. */
async function entryOf(client, companyId, entryId) {
  if (!entryId) return null;
  const { rows } = await client.query(
    `SELECT e.id, e.entry_no::text AS no, e.entry_date::text AS day, e.source::text AS source, e.narrative, e.posted_at, u.name AS posted_by,
            o.entry_no::text AS reverses, (SELECT r.entry_no::text FROM journal_entries r WHERE r.reverses_id = e.id LIMIT 1) AS reversed_by, e.reversal_reason
       FROM journal_entries e JOIN users u ON u.id = e.posted_by LEFT JOIN journal_entries o ON o.id = e.reverses_id
      WHERE e.id = $1 AND e.company_id = $2`,
    [entryId, companyId]
  );
  if (!rows[0]) return null;
  const { rows: lines } = await client.query(
    `SELECT a.code, a.name, l.debit_laari, l.credit_laari, l.memo FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.entry_id = $1 ORDER BY l.position`,
    [entryId]
  );
  const { day, ...e } = rows[0];
  return { ...e, on: day, lines: lines.map((l) => ({ account: `${l.code} ${l.name}`, debit: f(l.debit_laari), credit: f(l.credit_laari), memo: l.memo })) };
}

const files = (client, companyId, column, id) =>
  client.query(`SELECT id, filename, content_type FROM attachments WHERE company_id = $1 AND ${column} = $2 AND hidden_at IS NULL ORDER BY uploaded_at`, [companyId, id]).then((r) => r.rows);

const lineRows = (rows) => rows.map((l) => ({ description: l.description, quantity: l.quantity, net: f(l.net_laari), tax: f(l.tax_laari) }));

/** Each kind's document: its header, its lines, the money against it, its papers and the page it opens on. */
const DOCUMENT = {
  async bill(client, companyId, id) {
    const { rows } = await client.query("SELECT b.*, COALESCE(b.issue_date, b.received_at::date)::text AS day, c.name AS party FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id WHERE b.id = $1 AND b.company_id = $2", [id, companyId]);
    const d = rows[0];
    const { rows: lines } = await client.query("SELECT description, quantity::text AS quantity, net_laari, tax_laari FROM bill_lines WHERE bill_id = $1 AND company_id = $2 ORDER BY position", [id, companyId]);
    const { rows: paid } = await client.query("SELECT r.paid_on::text AS day, r.reference, p.amount_laari, r.reversed_at FROM payment_items p JOIN payment_runs r ON r.id = p.run_id WHERE p.bill_id = $1 AND p.company_id = $2 ORDER BY r.paid_on", [id, companyId]);
    return {
      document: { title: "Bill", no: d.bill_no, on: d.day, party: d.party, net: f(d.net_laari), tax: f(d.tax_laari), gross: f(d.gross_laari), href: `/bills/${id}` },
      lines: lineRows(lines), entryId: d.entry_id,
      money: { title: "Paid", rows: paid.map((p) => ({ on: p.day, what: p.reference ? `Paid, ${p.reference}` : "Paid", amount: f(p.amount_laari), undone: Boolean(p.reversed_at) })) },
      files: await files(client, companyId, "bill_id", id),
    };
  },
  async invoice(client, companyId, id) {
    const { rows } = await client.query("SELECT i.*, i.issue_date::text AS day, c.name AS party FROM sales_invoices i LEFT JOIN counterparties c ON c.id = i.counterparty_id WHERE i.id = $1 AND i.company_id = $2", [id, companyId]);
    const d = rows[0];
    const { rows: lines } = await client.query("SELECT description, quantity::text AS quantity, net_laari, tax_laari FROM sales_invoice_lines WHERE invoice_id = $1 AND company_id = $2 ORDER BY position", [id, companyId]);
    const { rows: got } = await client.query("SELECT r.received_on::text AS day, a.amount_laari, r.voided_at FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id WHERE a.invoice_id = $1 AND a.company_id = $2 ORDER BY r.received_on", [id, companyId]);
    return {
      document: { title: "Invoice", no: d.invoice_no, on: d.day, party: d.party, net: f(d.net_laari), tax: f(d.tax_laari), gross: f(d.gross_laari), href: `/documents/invoice/${id}` },
      lines: lineRows(lines), entryId: d.entry_id,
      money: { title: "Received", rows: got.map((r) => ({ on: r.day, what: "Received", amount: f(r.amount_laari), undone: Boolean(r.voided_at) })) },
      files: await files(client, companyId, "sales_invoice_id", id),
    };
  },
  async credit_note(client, companyId, id) {
    const { rows } = await client.query("SELECT n.*, n.issue_date::text AS day, c.name AS party, i.invoice_no FROM credit_notes n LEFT JOIN counterparties c ON c.id = n.counterparty_id LEFT JOIN sales_invoices i ON i.id = n.invoice_id WHERE n.id = $1 AND n.company_id = $2", [id, companyId]);
    const d = rows[0];
    return {
      document: { title: "Credit note", no: d.note_no, on: d.day, party: d.party, net: f(d.net_laari), tax: f(d.tax_laari), gross: f(d.gross_laari), href: `/documents/credit_note/${id}`, note: `${d.reason}${d.invoice_no ? ` · against invoice ${d.invoice_no}` : ""}` },
      lines: [], entryId: d.entry_id, money: null, files: await files(client, companyId, "credit_note_id", id),
    };
  },
  async receipt(client, companyId, id) {
    const { rows } = await client.query("SELECT r.*, r.received_on::text AS day, c.name AS party, a.code || ' ' || a.name AS into_account FROM receipts r LEFT JOIN counterparties c ON c.id = r.counterparty_id JOIN accounts a ON a.id = r.account_id WHERE r.id = $1 AND r.company_id = $2", [id, companyId]);
    const d = rows[0];
    const { rows: alloc } = await client.query("SELECT i.invoice_no, i.issue_date::text AS day, a.amount_laari FROM receipt_allocations a JOIN sales_invoices i ON i.id = a.invoice_id WHERE a.receipt_id = $1 AND a.company_id = $2 ORDER BY i.issue_date", [id, companyId]);
    return {
      document: { title: "Receipt", no: null, on: d.day, party: d.party, gross: f(d.amount_laari), href: `/documents/receipt/${id}`, note: `Into ${d.into_account}${d.reference ? ` · ${d.reference}` : ""}` },
      lines: [], entryId: d.entry_id,
      money: { title: "Paid off", rows: alloc.map((a) => ({ on: a.day, what: `Invoice ${a.invoice_no}`, amount: f(a.amount_laari), undone: false })) },
      files: [],
    };
  },
  async payment(client, companyId, id) {
    const { rows } = await client.query("SELECT r.*, r.paid_on::text AS day, a.code || ' ' || a.name AS from_account FROM payment_runs r JOIN accounts a ON a.id = r.from_account_id WHERE r.id = $1 AND r.company_id = $2", [id, companyId]);
    const d = rows[0];
    const { rows: items } = await client.query(
      `SELECT COALESCE(c.name || ' · ' || b.bill_no, c.name, 'Claim ' || x.number) AS what, b.issue_date::text AS day, p.amount_laari
         FROM payment_items p LEFT JOIN bills b ON b.id = p.bill_id LEFT JOIN counterparties c ON c.id = b.counterparty_id LEFT JOIN expense_claims x ON x.id = p.claim_id
        WHERE p.run_id = $1 AND p.company_id = $2`,
      [id, companyId]
    );
    const total = items.reduce((s, i) => s + BigInt(i.amount_laari), 0n);
    return {
      document: { title: "Payment", no: d.reference, on: d.day, party: null, gross: f(total), href: "/payments", note: `From ${d.from_account}` },
      lines: [], entryId: d.entry_id,
      money: { title: "What it paid", rows: items.map((i) => ({ on: i.day, what: i.what, amount: f(i.amount_laari), undone: false })) },
      files: [],
    };
  },
  async claim(client, companyId, id) {
    const { rows } = await client.query("SELECT x.*, (x.approved_at AT TIME ZONE 'Indian/Maldives')::date::text AS day, u.name AS claimant, a.name AS approver FROM expense_claims x JOIN users u ON u.id = x.claimant_id LEFT JOIN users a ON a.id = x.approved_by WHERE x.id = $1 AND x.company_id = $2", [id, companyId]);
    const d = rows[0];
    const { rows: lines } = await client.query("SELECT l.spent_on::text AS day, l.description, a.code || ' ' || a.name AS account, l.amount_laari FROM expense_claim_lines l JOIN accounts a ON a.id = l.account_id WHERE l.claim_id = $1 AND l.company_id = $2 ORDER BY l.position", [id, companyId]);
    const total = lines.reduce((s, l) => s + BigInt(l.amount_laari), 0n);
    return {
      document: { title: "Expense claim", no: d.number, on: d.day, party: d.claimant, gross: f(total), href: "/claims", note: `Approved by ${d.approver || "nobody yet"}${d.note ? ` · ${d.note}` : ""}` },
      lines: lines.map((l) => ({ description: `${l.day} · ${l.description} (${l.account})`, quantity: "1", net: f(l.amount_laari), tax: "0.00" })),
      entryId: d.entry_id, money: null, files: await files(client, companyId, "claim_id", id),
    };
  },
};

/** Everything behind one sampled item: the document, its entry, the money against it, its papers, and anything to look at twice. */
async function evidence(client, { companyId, sampleId, itemId }) {
  const { rows } = await client.query(
    `SELECT i.doc_id, s.kind, p.from_date::text AS from_text, p.to_date::text AS to_text
       FROM audit_sample_items i JOIN audit_samples s ON s.id = i.sample_id JOIN audit_periods p ON p.id = s.period_id
      WHERE i.id = $1 AND i.sample_id = $2 AND i.company_id = $3`,
    [itemId, sampleId, companyId]
  );
  if (!rows[0]) throw new Error("No such item in that sample.");
  const { doc_id: id, kind } = rows[0];
  const out = kind === "entry" ? { document: null, lines: [], entryId: id, money: null, files: await files(client, companyId, "entry_id", id) } : await DOCUMENT[kind](client, companyId, id);
  const entry = await entryOf(client, companyId, out.entryId);
  // Look twice: what the risk screen says about its entry.
  const flags = entry ? (await risk.screen(client, { companyId, from: rows[0].from_text, to: rows[0].to_text, only: entry.id })).entries[0]?.flags || [] : [];
  const { entryId, ...rest } = out;
  return { kind, ...rest, entry, flags };
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

module.exports = { createPeriod, checkSeal, periods, period, draw, prove, sample, evidence, see, entryOf, KINDS, NAMES, mus, fingerprint };
