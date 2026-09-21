const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { openAssetAccount } = require("./cash");
const statement = require("./statement");

/**
 * Where the money sits, and moving it between places.
 *
 * A bank account is an account under 11xx and a tin is an account under 12xx,
 * so both are read the same way: the sum of their journal lines. Nothing here
 * stores a balance. A transfer is one balanced entry — money out of one place,
 * into another — which is what it is in the bank's own books too.
 */

/** The bank accounts and open tins, each with what the books say is in it. */
async function places(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT a.id, a.code, a.name,
            CASE WHEN b.id IS NULL THEN 'bank' ELSE 'box' END AS kind,
            COALESCE(SUM(l.debit_laari) - SUM(l.credit_laari), 0) AS balance,
            (SELECT count(*) FROM bank_statement_lines s WHERE s.account_id = a.id)::int AS lines,
            (SELECT count(*) FROM bank_statement_lines s WHERE s.account_id = a.id AND s.status = 'open')::int AS waiting
       FROM accounts a
       LEFT JOIN cash_boxes b ON b.account_id = a.id AND b.closed_at IS NULL
       LEFT JOIN journal_lines l ON l.account_id = a.id AND l.company_id = a.company_id
      WHERE a.company_id = $1 AND a.archived_at IS NULL
        AND (b.id IS NOT NULL OR a.code LIKE '11%')
      GROUP BY a.id, b.id
      ORDER BY a.code`,
    [companyId]
  );
  return rows.map((r) => ({ ...r, balance: BigInt(r.balance) }));
}

/** A second bank account, or a first at a new bank. Starts at nothing. */
async function openBank(client, { companyId, name }) {
  const clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("A bank account needs a name, so a statement can say which one it was.");
  const { rows } = await client.query(
    `SELECT 1 FROM accounts WHERE company_id = $1 AND lower(name) = lower($2)`,
    [companyId, clean]
  );
  if (rows.length) throw new Error(`There is already an account called "${clean}".`);
  return openAssetAccount(client, { companyId, prefix: "11", name: clean });
}

/**
 * Money from one place to another: bank to tin, tin to bank, bank to bank.
 *
 * clientRef is the phone's own id for this attempt. A transfer sent on a weak
 * connection is sent again until the phone hears back, and without it the
 * second send would move the money twice. Same ref, same answer.
 */
async function transfer(client, { companyId, userId, fromId, toId, amount, note, on, clientRef }) {
  const laari = toLaari(amount);
  if (laari <= 0n) throw new Error("How much is moving?");
  if (!fromId || !toId) throw new Error("Say where it comes from and where it goes.");
  if (fromId === toId) throw new Error("That is the same place twice.");

  // Take the company's posting lock before looking for an earlier attempt, so
  // two sends of the same ref arriving together cannot both find nothing.
  await client.query(
    "INSERT INTO journal_counters (company_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [companyId]
  );
  await client.query("SELECT 1 FROM journal_counters WHERE company_id = $1 FOR UPDATE", [companyId]);

  if (clientRef) {
    const { rows } = await client.query(
      `SELECT id, entry_no FROM journal_entries
        WHERE company_id = $1 AND source = 'transfer' AND source_id = $2`,
      [companyId, clientRef]
    );
    if (rows[0]) return { entry: { id: rows[0].id, entryNo: rows[0].entry_no }, alreadyHad: true };
  }

  const all = await places(client, { companyId });
  const from = all.find((p) => p.id === fromId);
  const to = all.find((p) => p.id === toId);
  if (!from || !to) throw new Error("Money can only be moved between bank accounts and open cash boxes.");

  const said = String(note || "").trim();
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: on || new Date(),
    source: "transfer",
    sourceId: clientRef || null,
    narrative: `Moved ${formatLaari(laari)} from ${from.name} to ${to.name}${said ? ` - ${said}` : ""}`,
    lines: [
      { accountId: to.id, debit: laari, memo: `From ${from.name}` },
      { accountId: from.id, credit: laari, memo: `To ${to.name}` },
    ],
  });
  return { entry, from, to, amount: laari, alreadyHad: false };
}

/**
 * Brings a statement in. Posts nothing: it records what the bank says, and
 * says whether the file agrees with itself. The same row arriving again, in
 * this file or an overlapping one, is counted as already had.
 */
async function importStatement(client, { companyId, userId, accountId, text, layout }) {
  const { rows: found } = await client.query(
    `SELECT id FROM accounts WHERE id = $1 AND company_id = $2 AND code LIKE '11%' AND archived_at IS NULL`,
    [accountId, companyId]
  );
  if (!found.length) throw new Error("That is not a bank account of this company.");

  const parsed = statement.parse(text, layout);
  if (!parsed.rows.length) {
    throw new Error(
      parsed.skipped.length
        ? `None of the ${parsed.skipped.length} lines could be read. The first: line ${parsed.skipped[0].rowNo}, ${parsed.skipped[0].why}.`
        : "That file has nothing in it."
    );
  }

  const col = (pick) => parsed.rows.map(pick);
  const { rowCount } = await client.query(
    `INSERT INTO bank_statement_lines
       (company_id, account_id, posted_on, value_on, kind, bank_ref, internal_ref, happened_at,
        remark, who, channel, debit_laari, credit_laari, balance_laari, flag, row_hash, imported_by)
     SELECT $1::uuid, $2::uuid, t.*, $3::uuid
       FROM unnest($4::date[], $5::date[], $6::text[], $7::text[], $8::text[], $9::timestamp[],
                   $10::text[], $11::text[], $12::text[], $13::bigint[], $14::bigint[], $15::bigint[],
                   $16::text[], $17::text[])
            AS t(posted_on, value_on, kind, bank_ref, internal_ref, happened_at,
                 remark, who, channel, debit_laari, credit_laari, balance_laari, flag, row_hash)
     ON CONFLICT (account_id, row_hash) DO NOTHING`,
    [
      companyId, accountId, userId,
      col((r) => r.postedOn), col((r) => r.valueOn), col((r) => r.kind), col((r) => r.bankRef),
      col((r) => r.internalRef), col((r) => r.happenedAt), col((r) => r.remark), col((r) => r.who),
      col((r) => r.channel), col((r) => r.debitLaari.toString()), col((r) => r.creditLaari.toString()),
      col((r) => (r.balanceLaari === null ? null : r.balanceLaari.toString())),
      col((r) => r.flag), col((r) => r.hash),
    ]
  );

  const dates = parsed.rows.map((r) => r.postedOn).sort();
  return {
    read: parsed.rows.length,
    added: rowCount,
    alreadyHad: parsed.rows.length - rowCount,
    skipped: parsed.skipped,
    flagged: parsed.rows.filter((r) => r.flag).length,
    from: dates[0],
    to: dates[dates.length - 1],
    balance: parsed.balance,
  };
}

module.exports = { places, openBank, transfer, importStatement };
