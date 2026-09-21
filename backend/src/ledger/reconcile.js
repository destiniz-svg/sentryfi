const { postEntry, reverseEntry } = require("./post");
const { formatLaari } = require("./money");
const { findOrCreate } = require("./counterparties");
const sales = require("./sales");

/**
 * The bank agrees with the books.
 *
 * A statement line is what the bank says happened. The books either already
 * know (a receipt, a transfer to a tin: recorded before the statement arrived),
 * or they do not, and then a person says what it was.
 *
 * Three rules.
 *
 *   1. Nothing posts on its own. Linking a line to an entry that is already in
 *      the books changes nothing in the books, so an exact reference match is
 *      done for you. Everything that would write a new entry waits for a person
 *      to say so.
 *   2. Ask about groups, not lines. The real statement is four transactions a
 *      day, most of them small transfers to the same few people. "What was the
 *      MVR 19,991.00 across 80 transfers to one person?" is one question, and
 *      asking it 80 times is how a reconciliation gets abandoned.
 *   3. Leaving one for later is an answer. It clears the list without
 *      pretending the books know something they do not, and it comes back the
 *      moment somebody wants it.
 *
 * The bank account's own balance is never touched here. It is what the journal
 * lines on that account add up to, and that only moves when an entry is posted.
 */

const CONTROL = { supplier: "2100", customer: "1300" };

const sideOf = (l) =>
  BigInt(l.credit_laari) > 0n
    ? { moneyIn: true, laari: BigInt(l.credit_laari) }
    : { moneyIn: false, laari: BigInt(l.debit_laari) };

const key = (who) => String(who || "").trim().toLowerCase();

/** One line, locked for the rest of the transaction so two people cannot answer it twice. */
async function lockLine(client, { companyId, lineId }) {
  const { rows } = await client.query(
    `SELECT s.*, a.name AS bank_name
       FROM bank_statement_lines s JOIN accounts a ON a.id = s.account_id
      WHERE s.id = $1 AND s.company_id = $2
        FOR UPDATE OF s`,
    [lineId, companyId]
  );
  if (!rows[0]) throw new Error("There is no such line on a statement.");
  return rows[0];
}

/* ---------------------------------------------------------------- suggest */

/**
 * What the books could say about each of these lines. Suggestions only: a
 * person confirms every one that would write something new.
 */
async function suggest(client, { companyId, lines }) {
  const ids = lines.map((l) => l.id);
  const out = new Map(lines.map((l) => [l.id, { entries: [], invoices: [], bills: [], rule: null }]));
  if (!ids.length) return out;

  // 1. Already in the books: an entry on this bank account for the same amount
  //    in the same direction, close in time, not already answering another line.
  const { rows: entries } = await client.query(
    `SELECT s.id AS line_id, je.id AS entry_id, je.entry_no, je.entry_date, je.narrative,
            (s.posted_on - je.entry_date) AS days
       FROM bank_statement_lines s
       JOIN journal_lines jl ON jl.company_id = s.company_id AND jl.account_id = s.account_id
        AND ((s.credit_laari > 0 AND jl.debit_laari = s.credit_laari)
          OR (s.debit_laari  > 0 AND jl.credit_laari = s.debit_laari))
       JOIN journal_entries je ON je.id = jl.entry_id
      WHERE s.id = ANY($1::uuid[]) AND s.company_id = $2
        AND abs(s.posted_on - je.entry_date) <= 4
        AND je.reverses_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_id = je.id)
        AND NOT EXISTS (SELECT 1 FROM bank_statement_lines x WHERE x.entry_id = je.id)
      ORDER BY s.id, abs(s.posted_on - je.entry_date), je.entry_no`,
    [ids, companyId]
  );
  for (const r of entries) {
    const list = out.get(r.line_id).entries;
    if (list.length < 3) {
      list.push({ entryId: r.entry_id, entryNo: String(r.entry_no), on: r.entry_date, narrative: r.narrative, exact: false });
    }
  }

  // The same reference, written on a receipt somebody recorded, is as sure as
  // it gets: it is the one field both sides printed.
  const { rows: exact } = await client.query(
    `SELECT s.id AS line_id, je.id AS entry_id, je.entry_no, je.entry_date, je.narrative
       FROM bank_statement_lines s
       JOIN receipts r ON r.company_id = s.company_id AND r.voided_at IS NULL
        AND r.amount_laari = s.credit_laari AND r.entry_id IS NOT NULL
        AND position(lower(s.bank_ref) in lower(coalesce(r.reference, ''))) > 0
       JOIN journal_entries je ON je.id = r.entry_id
      WHERE s.id = ANY($1::uuid[]) AND s.company_id = $2
        AND length(coalesce(s.bank_ref, '')) >= 8 AND s.credit_laari > 0
        AND NOT EXISTS (SELECT 1 FROM journal_entries x WHERE x.reverses_id = je.id)
        AND NOT EXISTS (SELECT 1 FROM bank_statement_lines x WHERE x.entry_id = je.id)`,
    [ids, companyId]
  );
  for (const r of exact) {
    const list = out.get(r.line_id).entries;
    const known = list.find((e) => e.entryId === r.entry_id);
    if (known) known.exact = true;
    else list.unshift({ entryId: r.entry_id, entryNo: String(r.entry_no), on: r.entry_date, narrative: r.narrative, exact: true });
  }

  // 2. Money in that an open invoice could account for: exactly what is left
  //    on it, or part of it from a customer whose name looks like the payer.
  const { rows: invoices } = await client.query(
    `WITH inv AS (
       SELECT i.id, i.invoice_no, i.counterparty_id,
              i.gross_laari
                - COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a
                             JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL
                            WHERE a.invoice_id = i.id), 0)
                - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = i.id), 0) AS left_laari
         FROM sales_invoices i
        WHERE i.company_id = $2 AND i.status = 'posted' AND i.voided_at IS NULL)
     SELECT s.id AS line_id, inv.id AS invoice_id, inv.invoice_no, inv.counterparty_id,
            c.name AS customer, inv.left_laari,
            similarity(c.name, coalesce(s.who, '')) AS score
       FROM bank_statement_lines s
       JOIN inv ON inv.left_laari >= s.credit_laari
       LEFT JOIN counterparties c ON c.id = inv.counterparty_id
      WHERE s.id = ANY($1::uuid[]) AND s.company_id = $2 AND s.credit_laari > 0
        AND (inv.left_laari = s.credit_laari OR similarity(c.name, coalesce(s.who, '')) >= 0.3)
      ORDER BY s.id, (inv.left_laari = s.credit_laari) DESC, score DESC`,
    [ids, companyId]
  );
  for (const r of invoices) {
    const list = out.get(r.line_id).invoices;
    if (list.length < 3) {
      list.push({
        invoiceId: r.invoice_id,
        invoiceNo: r.invoice_no,
        counterpartyId: r.counterparty_id,
        customer: r.customer,
        left: formatLaari(BigInt(r.left_laari)),
      });
    }
  }

  // 3. Money out that a supplier bill could account for: the same amount, from
  //    a supplier whose name looks like the payee, and still owed.
  const { rows: bills } = await client.query(
    `SELECT s.id AS line_id, b.id AS bill_id, b.bill_no, c.id AS counterparty_id, c.name AS supplier
       FROM bank_statement_lines s
       JOIN bills b ON b.company_id = s.company_id AND b.status = 'posted' AND b.voided_at IS NULL
        AND b.gross_laari = s.debit_laari
       JOIN counterparties c ON c.id = b.counterparty_id
      WHERE s.id = ANY($1::uuid[]) AND s.company_id = $2 AND s.debit_laari > 0
        AND similarity(c.name, coalesce(s.who, '')) >= 0.3
        AND (SELECT COALESCE(SUM(l.credit_laari) - SUM(l.debit_laari), 0)
               FROM journal_lines l JOIN accounts a ON a.id = l.account_id AND a.code = '${CONTROL.supplier}'
              WHERE l.counterparty_id = c.id AND l.company_id = s.company_id) >= b.gross_laari
      ORDER BY s.id, similarity(c.name, coalesce(s.who, '')) DESC`,
    [ids, companyId]
  );
  for (const r of bills) {
    const list = out.get(r.line_id).bills;
    if (list.length < 3) {
      list.push({ billId: r.bill_id, billNo: r.bill_no, counterpartyId: r.counterparty_id, supplier: r.supplier });
    }
  }

  // 4. What this payee was before, said by a person: the account they chose
  //    most often for the same payee going the same way.
  const rules = await rulesFor(client, {
    companyId,
    pairs: lines.map((l) => ({ who: key(l.who), moneyIn: BigInt(l.credit_laari) > 0n })),
  });
  for (const l of lines) {
    out.get(l.id).rule = rules.get(`${key(l.who)}|${BigInt(l.credit_laari) > 0n}`) || null;
  }
  return out;
}

async function rulesFor(client, { companyId, pairs }) {
  const whos = [...new Set(pairs.map((p) => p.who).filter(Boolean))];
  const found = new Map();
  if (!whos.length) return found;
  const { rows } = await client.query(
    `SELECT DISTINCT ON (t.who, t.money_in) t.who, t.money_in, t.account_id, t.account_name, t.times
       FROM (
         SELECT lower(btrim(s.who)) AS who, (s.credit_laari > 0) AS money_in,
                cp.account_id, ac.name AS account_name, count(*)::int AS times
           FROM bank_statement_lines s
           JOIN journal_lines cp ON cp.entry_id = s.entry_id AND cp.account_id <> s.account_id
           JOIN accounts ac ON ac.id = cp.account_id
          WHERE s.company_id = $1 AND s.status = 'posted'
            AND lower(btrim(s.who)) = ANY($2::text[])
          GROUP BY 1, 2, 3, 4) t
      ORDER BY t.who, t.money_in, t.times DESC`,
    [companyId, whos]
  );
  for (const r of rows) {
    found.set(`${r.who}|${r.money_in}`, { accountId: r.account_id, accountName: r.account_name, times: r.times });
  }
  return found;
}

/* ------------------------------------------------------------------ read */

/**
 * The waiting list, as questions. One per payee and direction, biggest money
 * first, each carrying what was answered last time.
 */
async function groups(client, { companyId, accountId, limit = 40 }) {
  const { rows } = await client.query(
    `SELECT lower(btrim(coalesce(who, ''))) AS k, max(who) AS who, (credit_laari > 0) AS money_in,
            count(*)::int AS n, SUM(debit_laari + credit_laari) AS total,
            min(posted_on) AS first_on, max(posted_on) AS last_on
       FROM bank_statement_lines
      WHERE company_id = $1 AND account_id = $2 AND status = 'open'
      GROUP BY 1, 3
      ORDER BY total DESC, n DESC
      LIMIT $3`,
    [companyId, accountId, limit]
  );
  const rules = await rulesFor(client, { companyId, pairs: rows.map((r) => ({ who: r.k })) });
  return rows.map((r) => ({
    key: r.k,
    who: r.who,
    moneyIn: r.money_in,
    count: r.n,
    total: formatLaari(BigInt(r.total)),
    from: r.first_on,
    to: r.last_on,
    rule: rules.get(`${r.k}|${r.money_in}`) || null,
  }));
}

/** The lines behind one question, each with what the books could say about it. */
async function linesOf(client, { companyId, accountId, who, moneyIn, status = "open", limit = 100 }) {
  const { rows } = await client.query(
    `SELECT * FROM bank_statement_lines
      WHERE company_id = $1 AND account_id = $2 AND status = $3
        AND lower(btrim(coalesce(who, ''))) = $4 AND (credit_laari > 0) = $5
      ORDER BY posted_on DESC, id LIMIT $6`,
    [companyId, accountId, status, key(who), Boolean(moneyIn), limit]
  );
  const ideas = await suggest(client, { companyId, lines: rows });
  return rows.map((l) => ({ line: l, ...ideas.get(l.id) }));
}

/** What has been answered, newest first, so a wrong answer can be found and taken back. */
async function recent(client, { companyId, accountId, statuses = ["posted", "matched", "set_aside"], limit = 100 }) {
  const { rows } = await client.query(
    `SELECT s.*, je.entry_no FROM bank_statement_lines s
       LEFT JOIN journal_entries je ON je.id = s.entry_id
      WHERE s.company_id = $1 AND s.account_id = $2 AND s.status = ANY($3::text[])
      ORDER BY s.decided_at DESC NULLS LAST, s.posted_on DESC LIMIT $4`,
    [companyId, accountId, statuses, limit]
  );
  return rows;
}

/* ---------------------------------------------------------------- decide */

async function settle(client, { companyId, userId, lineId, status, entryId = null, note = null }) {
  await client.query(
    `UPDATE bank_statement_lines
        SET status = $3, entry_id = $4, note = $5, decided_by = $6, decided_at = now()
      WHERE id = $1 AND company_id = $2`,
    [lineId, companyId, status, entryId, note, userId]
  );
}

/**
 * It is already in the books: point the line at the entry. Changes nothing in
 * the books, which is why this is safe to do without being asked when the
 * reference matches exactly.
 */
async function link(client, { companyId, userId, lineId, entryId, note }) {
  const line = await lockLine(client, { companyId, lineId });
  if (line.status !== "open") throw new Error("That line has been dealt with already.");
  const { laari, moneyIn } = sideOf(line);
  const { rows } = await client.query(
    `SELECT je.id FROM journal_entries je
       JOIN journal_lines jl ON jl.entry_id = je.id AND jl.account_id = $3
      WHERE je.id = $1 AND je.company_id = $2
        AND ${moneyIn ? "jl.debit_laari" : "jl.credit_laari"} = $4
        AND NOT EXISTS (SELECT 1 FROM bank_statement_lines x WHERE x.entry_id = je.id)`,
    [entryId, companyId, line.account_id, laari.toString()]
  );
  if (!rows.length) throw new Error("That entry is not for this amount on this account, or it already answers another line.");
  await settle(client, { companyId, userId, lineId, status: "matched", entryId, note });
  return { status: "matched", entryId };
}

/** Somebody says what it was. This is the one that writes a new entry. */
async function post(client, { companyId, userId, lineId, accountId, counterpartyId, note }) {
  const line = await lockLine(client, { companyId, lineId });
  if (line.status !== "open" && line.status !== "set_aside") throw new Error("That line has been dealt with already.");
  const { laari, moneyIn } = sideOf(line);
  if (laari <= 0n) throw new Error("That line has no amount, so there is nothing to post.");
  if (accountId === line.account_id) throw new Error("That is the bank account itself.");

  const { rows: found } = await client.query(
    `SELECT id, code, name, type FROM accounts WHERE id = $1 AND company_id = $2 AND archived_at IS NULL`,
    [accountId, companyId]
  );
  const counter = found[0];
  if (!counter) throw new Error("Which account was it?");

  // Money owed to us and by us belongs to somebody. Without a name the balance
  // could not be read per supplier or customer, so one is found or made from
  // what the bank printed.
  let party = counterpartyId || null;
  const control = counter.code === CONTROL.supplier ? "supplier" : counter.code === CONTROL.customer ? "customer" : null;
  if (control && !party) {
    if (!line.who) throw new Error(`Who is this ${control === "supplier" ? "supplier" : "customer"}? The bank did not say.`);
    const made = await findOrCreate(client, { companyId, userId, name: line.who, kind: control });
    party = made.party.id;
  }

  const said = String(note || "").trim();
  const what = [line.who, said || line.remark].filter(Boolean).join(" - ") || line.kind;
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: line.posted_on,
    source: "bank_import",
    sourceId: line.id,
    narrative: `${moneyIn ? "Received" : "Paid"}: ${what}`,
    lines: moneyIn
      ? [
          { accountId: line.account_id, debit: laari, memo: line.bank_ref || line.kind },
          { accountId: counter.id, credit: laari, counterpartyId: party, memo: said || line.kind },
        ]
      : [
          { accountId: counter.id, debit: laari, counterpartyId: party, memo: said || line.kind },
          { accountId: line.account_id, credit: laari, memo: line.bank_ref || line.kind },
        ],
  });
  await settle(client, { companyId, userId, lineId, status: "posted", entryId: entry.id, note: said || null });
  return { status: "posted", entryId: entry.id, entryNo: String(entry.entryNo), accountName: counter.name };
}

/** Money in that pays an invoice. Goes through the same door as any receipt. */
async function receiveAgainst(client, { companyId, userId, lineId, invoiceId }) {
  const line = await lockLine(client, { companyId, lineId });
  if (line.status !== "open" && line.status !== "set_aside") throw new Error("That line has been dealt with already.");
  const { laari, moneyIn } = sideOf(line);
  if (!moneyIn || laari <= 0n) throw new Error("Only money coming in can pay an invoice.");

  const { rows } = await client.query(
    `SELECT counterparty_id FROM sales_invoices WHERE id = $1 AND company_id = $2`,
    [invoiceId, companyId]
  );
  if (!rows.length) throw new Error("No such invoice.");
  const left = await sales.outstanding(client, { companyId, invoiceId });
  const applied = laari < left ? laari : left;

  const r = await sales.receive(client, {
    companyId,
    userId,
    counterpartyId: rows[0].counterparty_id,
    amount: laari,
    accountId: line.account_id,
    receivedOn: line.posted_on,
    reference: line.bank_ref,
    allocations: [{ invoiceId, amount: applied }],
  });
  await settle(client, { companyId, userId, lineId, status: "posted", entryId: r.entry.id });
  return { status: "posted", entryId: r.entry.id, entryNo: String(r.entry.entryNo), applied: formatLaari(applied), onAccount: formatLaari(r.onAccount) };
}

/** For later. It clears the list without claiming the books know something they do not. */
async function setAside(client, { companyId, userId, lineId, note }) {
  const line = await lockLine(client, { companyId, lineId });
  if (line.status !== "open") throw new Error("That line has been dealt with already.");
  await settle(client, { companyId, userId, lineId, status: "set_aside", note: String(note || "").trim() || null });
  return { status: "set_aside" };
}

/**
 * Take an answer back. A link only unlinks. A posting is reversed, both stay
 * in the journal, and a receipt that came from it is voided so the invoice is
 * owed again.
 */
async function undo(client, { companyId, userId, lineId }) {
  const line = await lockLine(client, { companyId, lineId });
  if (line.status === "open") throw new Error("That line has not been answered.");

  if (line.status === "posted" && line.entry_id) {
    await reverseEntry(client, {
      companyId,
      userId,
      entryId: line.entry_id,
      reason: "Undone from the bank statement",
    });
    await client.query(
      `UPDATE receipts SET voided_at = now(), void_reason = 'Undone from the bank statement'
        WHERE entry_id = $1 AND company_id = $2 AND voided_at IS NULL`,
      [line.entry_id, companyId]
    );
  }
  await settle(client, { companyId, userId, lineId, status: "open" });
  return { status: "open" };
}

/** Answer a whole payee at once: every open line to the same person, the same way. */
async function postGroup(client, { companyId, userId, bankId, who, moneyIn, accountId, note, limit = 500 }) {
  const { rows } = await client.query(
    `SELECT id FROM bank_statement_lines
      WHERE company_id = $1 AND account_id = $2 AND status = 'open'
        AND lower(btrim(coalesce(who, ''))) = $3 AND (credit_laari > 0) = $4
        AND debit_laari + credit_laari > 0
      ORDER BY posted_on, id LIMIT $5`,
    [companyId, bankId, key(who), Boolean(moneyIn), limit]
  );
  let total = 0n;
  const entries = [];
  for (const r of rows) {
    const done = await post(client, { companyId, userId, lineId: r.id, accountId, note });
    entries.push(done.entryId);
  }
  if (rows.length) {
    const { rows: sum } = await client.query(
      `SELECT COALESCE(SUM(debit_laari + credit_laari), 0) AS t FROM bank_statement_lines WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)]
    );
    total = BigInt(sum[0].t);
  }
  return { posted: rows.length, total: formatLaari(total) };
}

/** A whole payee for later, in one go. */
async function setAsideGroup(client, { companyId, userId, bankId, who, moneyIn, note, limit = 500 }) {
  const { rows } = await client.query(
    `SELECT id FROM bank_statement_lines
      WHERE company_id = $1 AND account_id = $2 AND status = 'open'
        AND lower(btrim(coalesce(who, ''))) = $3 AND (credit_laari > 0) = $4
      ORDER BY posted_on, id LIMIT $5`,
    [companyId, bankId, key(who), Boolean(moneyIn), limit]
  );
  for (const r of rows) await setAside(client, { companyId, userId, lineId: r.id, note });
  return { setAside: rows.length };
}

/**
 * After a statement comes in: link what the books already know by an exact
 * reference and amount. This writes nothing to the books.
 */
async function autoMatch(client, { companyId, userId, accountId }) {
  const { rows: open } = await client.query(
    `SELECT * FROM bank_statement_lines
      WHERE company_id = $1 AND account_id = $2 AND status = 'open' AND credit_laari > 0
        AND length(coalesce(bank_ref, '')) >= 8`,
    [companyId, accountId]
  );
  const ideas = await suggest(client, { companyId, lines: open });
  let matched = 0;
  for (const l of open) {
    const sure = ideas.get(l.id).entries.filter((e) => e.exact);
    if (sure.length === 1) {
      await link(client, { companyId, userId, lineId: l.id, entryId: sure[0].entryId, note: "Same reference and amount as a recorded receipt" });
      matched += 1;
    }
  }
  return matched;
}

module.exports = { suggest, groups, linesOf, recent, setAsideGroup, link, post, receiveAgainst, setAside, undo, postGroup, autoMatch };
