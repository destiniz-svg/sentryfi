/**
 * Checking the books have not been tampered with.
 *
 * Each entry's hash covers its own contents and the hash of the entry before
 * it. So changing an old amount changes its hash, which breaks every hash after
 * it. There is no way to alter one entry quietly; you would have to rewrite the
 * whole chain from that point, and the numbering would have to survive too.
 *
 * This reads the chain from the first entry to the last and reports the first
 * place it stops adding up.
 */

const { assumeIdentity, hashEntry } = require("./post");
const { formatLaari } = require("./money");

async function verifyChain(client, { companyId, userId }) {
  await assumeIdentity(client, { companyId, userId });

  const { rows: entries } = await client.query(
    `SELECT id, company_id, entry_no, to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
            source, source_id, narrative, reverses_id, prev_hash, hash
       FROM journal_entries
      WHERE company_id = $1
      ORDER BY entry_no ASC`,
    [companyId]
  );

  const problems = [];
  let expectedNo = 1n;
  let expectedPrev = null;

  for (const entry of entries) {
    const entryNo = BigInt(entry.entry_no);

    if (entryNo !== expectedNo) {
      problems.push({
        entryNo: entryNo.toString(),
        problem: `Numbering jumps: expected entry ${expectedNo}, found ${entryNo}. An entry is missing.`,
      });
      expectedNo = entryNo;
    }

    const prevMatches =
      (expectedPrev === null && entry.prev_hash === null) ||
      (expectedPrev !== null &&
        entry.prev_hash !== null &&
        Buffer.compare(expectedPrev, entry.prev_hash) === 0);
    if (!prevMatches) {
      problems.push({
        entryNo: entryNo.toString(),
        problem: "This entry does not point at the one before it. Records were inserted or removed.",
      });
    }

    const { rows: lines } = await client.query(
      `SELECT account_id, debit_laari, credit_laari, project_id, cost_code_id,
              counterparty_id, memo
         FROM journal_lines WHERE entry_id = $1 ORDER BY position`,
      [entry.id]
    );
    const normalised = lines.map((line) => ({
      account_id: line.account_id,
      debit_laari: BigInt(line.debit_laari),
      credit_laari: BigInt(line.credit_laari),
      project_id: line.project_id,
      cost_code_id: line.cost_code_id,
      counterparty_id: line.counterparty_id,
      memo: line.memo,
    }));

    const debits = normalised.reduce((s, l) => s + l.debit_laari, 0n);
    const credits = normalised.reduce((s, l) => s + l.credit_laari, 0n);
    if (debits !== credits) {
      problems.push({
        entryNo: entryNo.toString(),
        problem: `Entry does not balance: debits MVR ${formatLaari(debits)}, credits MVR ${formatLaari(credits)}.`,
      });
    }

    const recomputed = hashEntry(
      {
        company_id: entry.company_id,
        entry_no: entryNo,
        entry_date: entry.entry_date,
        source: entry.source,
        source_id: entry.source_id,
        narrative: entry.narrative,
        reverses_id: entry.reverses_id,
      },
      normalised,
      entry.prev_hash
    );
    if (Buffer.compare(recomputed, entry.hash) !== 0) {
      problems.push({
        entryNo: entryNo.toString(),
        problem: "Contents do not match the seal. This entry was altered after it was posted.",
      });
    }

    expectedPrev = entry.hash;
    expectedNo = entryNo + 1n;
  }

  return { ok: problems.length === 0, checked: entries.length, problems };
}

/**
 * The whole books in one figure. Across every account and every entry, debits
 * must equal credits; if they do not, something wrote to the tables without
 * going through postEntry.
 */
async function verifyTrialBalance(client, { companyId, userId }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(debit_laari), 0)::text  AS debits,
            COALESCE(SUM(credit_laari), 0)::text AS credits
       FROM journal_lines WHERE company_id = $1`,
    [companyId]
  );
  const debits = BigInt(rows[0].debits);
  const credits = BigInt(rows[0].credits);
  return { ok: debits === credits, debits, credits, difference: debits - credits };
}

module.exports = { verifyChain, verifyTrialBalance };
