const { postEntry } = require("./post");

/**
 * Closing the books, reopening them, and adjusting into a month that is closed.
 *
 * The lock date is whatever the latest row of period_locks says. Refusing an
 * entry inside it is the database's job (see config/period-schema.js); this
 * module is the acts a person performs and the reading that helps them decide.
 */

const niceDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** The date the books are closed through, as YYYY-MM-DD, or null. */
async function lockedThrough(client, { companyId }) {
  const { rows } = await client.query("SELECT books_locked_through($1)::text AS d", [companyId]);
  return rows[0].d;
}

/**
 * What a person might want to know before closing through a date. These are
 * things to look at, not things that stop it: a bill that has not been put in
 * the books is a reason to stop and check, and sometimes exactly the reason to
 * close anyway and deal with it as an adjustment.
 */
async function doubtsFor(client, { companyId, through }) {
  const { rows } = await client.query(
    `SELECT
       (SELECT count(*) FROM bills
         WHERE company_id = $1 AND status IN ('draft','awaiting_review') AND voided_at IS NULL
           AND COALESCE(issue_date, received_at::date) <= $2::date)::int AS bills,
       (SELECT count(*) FROM sales_invoices
         WHERE company_id = $1 AND status = 'draft' AND voided_at IS NULL AND issue_date <= $2::date)::int AS invoices,
       (SELECT count(*) FROM bank_statement_lines
         WHERE company_id = $1 AND status = 'open' AND debit_laari + credit_laari > 0
           AND posted_on <= $2::date)::int AS bank_lines`,
    [companyId, through]
  );
  return { bills: rows[0].bills, invoices: rows[0].invoices, bankLines: rows[0].bank_lines };
}

/** The month ends that could be closed next: after the lock, and already over. */
async function candidates(client, { companyId }) {
  const { rows } = await client.query(
    `WITH first_day AS (
       SELECT COALESCE(
                (SELECT (books_locked_through($1) + 1)),
                (SELECT date_trunc('month', min(entry_date))::date FROM journal_entries WHERE company_id = $1)
              ) AS d)
     SELECT ((g + interval '1 month') - interval '1 day')::date::text AS through
       FROM first_day,
            generate_series(first_day.d::timestamp,
                            (date_trunc('month', current_date) - interval '1 month')::timestamp,
                            interval '1 month') AS g
      WHERE first_day.d IS NOT NULL
      ORDER BY g
      LIMIT 36`,
    [companyId]
  );
  return rows.map((r) => r.through);
}

async function overview(client, { companyId }) {
  const locked = await lockedThrough(client, { companyId });
  const { rows: history } = await client.query(
    `SELECT p.id, p.action, p.locked_through::text AS locked_through, p.reason, p.at, u.name AS who
       FROM period_locks p LEFT JOIN users u ON u.id = p.by_user
      WHERE p.company_id = $1 ORDER BY p.seq DESC LIMIT 50`,
    [companyId]
  );
  const { rows: adjustments } = await client.query(
    `SELECT a.id, a.reason, a.locked_through::text AS locked_through, a.at, u.name AS who,
            je.entry_no, je.entry_date::text AS entry_date, je.narrative
       FROM period_adjustments a
       JOIN journal_entries je ON je.id = a.entry_id
       LEFT JOIN users u ON u.id = a.by_user
      WHERE a.company_id = $1 ORDER BY a.at DESC LIMIT 20`,
    [companyId]
  );
  return { lockedThrough: locked, history, adjustments, candidates: await candidates(client, { companyId }) };
}

/** Close the books through the end of a month that is over. */
async function close(client, { companyId, userId, through }) {
  if (!isoDate.test(String(through || ""))) throw new Error("Which month? Pick the last day of it.");
  const { rows } = await client.query(
    `SELECT EXTRACT(day FROM $1::date + 1) = 1 AS month_end,
            $1::date < date_trunc('month', current_date)::date AS over`,
    [through]
  );
  if (!rows[0].month_end) throw new Error("A period is a month. Pick the last day of one.");
  if (!rows[0].over) throw new Error("That month is not over yet, so there is still more to come in it.");

  const locked = await lockedThrough(client, { companyId });
  if (locked && through <= locked) throw new Error(`The books are already closed through ${niceDate(locked)}.`);

  const doubts = await doubtsFor(client, { companyId, through });
  await client.query(
    `INSERT INTO period_locks (company_id, action, locked_through, by_user) VALUES ($1,'close',$2,$3)`,
    [companyId, through, userId]
  );
  return { lockedThrough: through, doubts };
}

/**
 * Open it again, back to an earlier month end or all the way. An act with a
 * name and a reason on it: what is being reopened is what somebody may already
 * have reported, and anyone reading the history should be able to see who did
 * it and what they said.
 */
async function reopen(client, { companyId, userId, through, reason }) {
  const said = String(reason || "").trim();
  if (said.length < 3) throw new Error("Say why the books are being reopened.");
  const locked = await lockedThrough(client, { companyId });
  if (!locked) throw new Error("Nothing is closed, so there is nothing to reopen.");

  const back = through ? String(through) : null;
  if (back !== null) {
    if (!isoDate.test(back)) throw new Error("Which month end should it go back to?");
    const { rows } = await client.query("SELECT EXTRACT(day FROM $1::date + 1) = 1 AS month_end", [back]);
    if (!rows[0].month_end) throw new Error("A period is a month. Pick the last day of one.");
    if (back >= locked) throw new Error(`The books are closed through ${niceDate(locked)}. Reopening goes back from there.`);
  }
  await client.query(
    `INSERT INTO period_locks (company_id, action, locked_through, reason, by_user) VALUES ($1,'reopen',$2,$3,$4)`,
    [companyId, back, said, userId]
  );
  return { lockedThrough: back };
}

/**
 * A journal entry written by hand: the accountant's correction. Into an open
 * month it is an ordinary entry. Into a closed one it must say why, and the
 * reason is recorded against the entry it produced.
 */
async function adjust(client, { companyId, userId, date, narrative, reason, lines }) {
  if (!isoDate.test(String(date || ""))) throw new Error("What date does it belong to?");
  const said = String(narrative || "").trim();
  if (said.length < 3) throw new Error("Say what this adjustment is.");

  const locked = await lockedThrough(client, { companyId });
  const inClosed = Boolean(locked && date <= locked);
  const why = String(reason || "").trim();
  if (inClosed && why.length < 3) {
    throw new Error(`The books are closed through ${niceDate(locked)}. Say why this is going in anyway.`);
  }

  const entry = await postEntry(client, {
    companyId,
    userId,
    date,
    source: "adjustment",
    narrative: `Adjustment: ${said}`,
    closedPeriodReason: inClosed ? why : null,
    lines,
  });
  return { entry, intoClosedPeriod: inClosed };
}

module.exports = { lockedThrough, doubtsFor, overview, close, reopen, adjust };
