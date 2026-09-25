const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { openAssetAccount } = require("./cash");
const statement = require("./statement");
const reconcile = require("./reconcile");
const fx = require("./fx");
const { today: localToday } = require("./today");

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
    `SELECT a.id, a.code, a.name, a.currency, a.bank_account_no,
            a.currency <> (SELECT c.base_currency FROM companies c WHERE c.id = a.company_id) AS foreign,
            CASE WHEN b.id IS NULL THEN 'bank' ELSE 'box' END AS kind,
            COALESCE(SUM(l.debit_laari) - SUM(l.credit_laari), 0) AS balance,
            -- What is in it in its own currency, when that is not ours: the sum of
            -- the foreign amounts on its lines, signed the same way.
            COALESCE(SUM(CASE WHEN l.currency = a.currency THEN
                         CASE WHEN l.debit_laari > 0 THEN l.amount_fc ELSE -l.amount_fc END END), 0) AS balance_fc,
            (SELECT count(*) FROM bank_statement_lines s WHERE s.account_id = a.id)::int AS lines,
            NOT EXISTS (SELECT 1 FROM journal_lines j WHERE j.account_id = a.id)
              AND NOT EXISTS (SELECT 1 FROM bank_statement_lines s WHERE s.account_id = a.id) AS untouched,
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
  return rows.map((r) => ({ ...r, currency: (r.currency || "").trim(), balance: BigInt(r.balance), balanceFc: BigInt(r.balance_fc) }));
}

const cleanNo = (x) => String(x || "").replace(/[\s-]+/g, "") || null;

async function numberFree(client, companyId, no, exceptId = null) {
  const { rows } = await client.query(
    "SELECT name FROM accounts WHERE company_id = $1 AND bank_account_no = $2 AND archived_at IS NULL AND id IS DISTINCT FROM $3",
    [companyId, no, exceptId]
  );
  if (rows.length) throw new Error(`Account ${no} is already here, as "${rows[0].name}".`);
}

/** The number of a bank account opened before numbers were asked for. */
async function setNumber(client, { companyId, accountId, accountNo }) {
  const no = cleanNo(accountNo);
  if (!no) throw new Error("What is its account number?");
  await numberFree(client, companyId, no, accountId);
  const { rowCount } = await client.query(
    "UPDATE accounts SET bank_account_no = $1 WHERE id = $2 AND company_id = $3 AND code LIKE '11%'",
    [no, accountId, companyId]
  );
  if (!rowCount) throw new Error("That is not one of your bank accounts.");
  return { accountNo: no };
}

/**
 * A bank account put right: its name, currency and number. Only while
 * nothing is recorded against it, because an entry or a statement line was
 * made in its currency and under its name, and changing either afterwards
 * would change what those records say.
 */
async function editBank(client, { companyId, accountId, name, currency, accountNo }) {
  const { rows } = await client.query(
    `SELECT a.name, NOT EXISTS (SELECT 1 FROM journal_lines j WHERE j.account_id = a.id)
              AND NOT EXISTS (SELECT 1 FROM bank_statement_lines s WHERE s.account_id = a.id) AS untouched
       FROM accounts a WHERE a.id = $1 AND a.company_id = $2 AND a.code LIKE '11%' AND a.archived_at IS NULL`,
    [accountId, companyId]
  );
  if (!rows[0]) throw new Error("That is not one of your bank accounts.");
  if (!rows[0].untouched) throw new Error(`${rows[0].name} has records in it, so it stays as it is.`);
  const clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("A bank account needs a name, so a statement can say which one it was.");
  const { rows: clash } = await client.query(
    "SELECT 1 FROM accounts WHERE company_id = $1 AND lower(name) = lower($2) AND id <> $3",
    [companyId, clean, accountId]
  );
  if (clash.length) throw new Error(`There is already an account called "${clean}".`);
  const cur = currency ? String(currency).trim().toUpperCase() : null;
  if (cur && !/^[A-Z]{3}$/.test(cur)) throw new Error("A currency is three letters, like USD.");
  const no = cleanNo(accountNo);
  if (!no) throw new Error("What is its account number?");
  await numberFree(client, companyId, no, accountId);
  const { rows: done } = await client.query(
    `UPDATE accounts SET name = $1, bank_account_no = $2,
            currency = COALESCE($3, (SELECT base_currency FROM companies WHERE id = $4))
      WHERE id = $5 AND company_id = $4
      RETURNING id, code, name, trim(currency) AS currency, bank_account_no AS "accountNo"`,
    [clean, no, cur, companyId, accountId]
  );
  return done[0];
}

/** A second bank account, or a first at a new bank. Starts at nothing. */
async function openBank(client, { companyId, name, currency, accountNo }) {
  let clean = String(name || "").trim();
  if (clean.length < 2) throw new Error("A bank account needs a name, so a statement can say which one it was.");
  const no = cleanNo(accountNo);
  if (no) await numberFree(client, companyId, no);
  const cur = currency ? String(currency).trim().toUpperCase() : null;
  if (cur && !/^[A-Z]{3}$/.test(cur)) throw new Error("A currency is three letters, like USD.");
  const taken = async (n) =>
    (await client.query("SELECT 1 FROM accounts WHERE company_id = $1 AND lower(name) = lower($2)", [companyId, n])).rows.length > 0;
  // Two or three accounts at one bank are normal, not a mistake. A name
  // already in use is told apart by its currency, then the end of its number,
  // then a count: "BML" becomes "BML USD", "BML USD ··5555", "BML USD 2".
  if (await taken(clean)) {
    const shown = cur || (await client.query("SELECT base_currency FROM companies WHERE id = $1", [companyId])).rows[0].base_currency.trim();
    if (!new RegExp(`\\b${shown}\\b`, "i").test(clean)) clean = `${clean} ${shown}`;
  }
  if ((await taken(clean)) && no) clean = `${clean} ··${no.slice(-4)}`;
  const base = clean;
  for (let n = 2; await taken(clean); n += 1) clean = `${base} ${n}`;
  const account = await openAssetAccount(client, { companyId, prefix: "11", name: clean, currency: cur, bankAccountNo: no });
  return { ...account, accountNo: no };
}

/**
 * Money from one place to another: bank to tin, tin to bank, bank to bank.
 *
 * clientRef is the phone's own id for this attempt. A transfer sent on a weak
 * connection is sent again until the phone hears back, and without it the
 * second send would move the money twice. Same ref, same answer.
 */
async function transfer(client, { companyId, userId, fromId, toId, amount, amountFc, note, on, clientRef }) {
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

  // A place in another currency moves in that currency too. Both figures are
  // what the bank said; the rate between them is recorded, not assumed.
  let fc = null;
  if (from.foreign || to.foreign) {
    if (from.foreign && to.foreign && from.currency !== to.currency) {
      throw new Error(`${from.currency} to ${to.currency} goes through a rufiyaa account, one step at a time.`);
    }
    const currency = from.foreign ? from.currency : to.currency;
    if (amountFc === undefined || amountFc === null || amountFc === "") throw new Error(`How much in ${currency}?`);
    const fcMinor = toLaari(amountFc);
    if (fcMinor <= 0n) throw new Error(`How much in ${currency}?`);
    fc = { currency, amount: fcMinor, rate: fx.rateBetween(laari, fcMinor) };
  }
  const fcOf = (p) => (p.foreign ? fc : null);

  const said = String(note || "").trim();
  const entry = await postEntry(client, {
    companyId,
    userId,
    date: on || localToday(),
    source: "transfer",
    sourceId: clientRef || null,
    narrative: `Moved ${formatLaari(laari)} from ${from.name} to ${to.name}${said ? ` - ${said}` : ""}`,
    lines: [
      { accountId: to.id, debit: laari, memo: `From ${from.name}`, fc: fcOf(to) },
      { accountId: from.id, credit: laari, memo: `To ${to.name}`, fc: fcOf(from) },
    ],
  });
  // The bank's own rate is the best guess for the next foreign document.
  if (fc) {
    await fx.recordRate(client, {
      companyId, userId, currency: fc.currency, rate: fc.rate, source: "Transfer",
      on: on || localToday(),
    });
  }
  return { entry, from, to, amount: laari, fc, alreadyHad: false };
}

/**
 * Brings a statement in. Posts nothing: it records what the bank says, and
 * says whether the file agrees with itself. The same row arriving again, in
 * this file or an overlapping one, is counted as already had.
 */
async function importStatement(client, { companyId, userId, accountId, text, layout }) {
  const { rows: found } = await client.query(
    `SELECT a.id, trim(a.currency) AS currency, a.currency <> c.base_currency AS foreign
       FROM accounts a JOIN companies c ON c.id = a.company_id
      WHERE a.id = $1 AND a.company_id = $2 AND a.code LIKE '11%' AND a.archived_at IS NULL`,
    [accountId, companyId]
  );
  if (!found.length) throw new Error("That is not a bank account of this company.");
  // A statement for an account in another currency is in that currency: its
  // lines are kept in it, and each goes into the books at its day's rate when
  // it is answered (ledger/reconcile.js).

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

  // What the books already know by an exact reference is linked now. That
  // changes nothing in the books; everything else waits to be asked.
  const matched = await reconcile.autoMatch(client, { companyId, userId, accountId });

  const dates = parsed.rows.map((r) => r.postedOn).sort();
  return {
    matched,
    read: parsed.rows.length,
    added: rowCount,
    alreadyHad: parsed.rows.length - rowCount,
    skipped: parsed.skipped,
    flagged: parsed.rows.filter((r) => r.flag).length,
    // What was odd, and on how many lines, so the person can tell a harmless quirk from a real problem.
    flags: Object.entries(parsed.rows.reduce((m, r) => { for (const f of r.flag ? r.flag.split("; ") : []) m[f] = (m[f] || 0) + 1; return m; }, {})).map(([reason, count]) => ({ reason, count })),
    from: dates[0],
    to: dates[dates.length - 1],
    balance: parsed.balance,
  };
}

/**
 * What the bank itself says: the closing balance on its last statement day,
 * and the books on that same day. Several lines share a day and their order
 * in the file is not always the bank's, so the day's last line is the one
 * whose balance no other line that day started from.
 */
async function bankSays(client, { companyId, accountId }) {
  const { rows: day } = await client.query("SELECT MAX(posted_on)::text AS d FROM bank_statement_lines WHERE company_id = $1 AND account_id = $2 AND balance_laari IS NOT NULL", [companyId, accountId]);
  if (!day[0].d) return null;
  const { rows: lines } = await client.query("SELECT balance_laari, debit_laari, credit_laari FROM bank_statement_lines WHERE company_id = $1 AND account_id = $2 AND posted_on = $3 AND balance_laari IS NOT NULL", [companyId, accountId, day[0].d]);
  const before = new Set(lines.map((x) => String(BigInt(x.balance_laari) - BigInt(x.credit_laari) + BigInt(x.debit_laari))));
  const last = lines.find((x) => !before.has(String(x.balance_laari))) || lines[lines.length - 1];
  const { rows: book } = await client.query(
    "SELECT COALESCE(SUM(l.debit_laari - l.credit_laari), 0) AS b FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE l.company_id = $1 AND l.account_id = $2 AND e.entry_date <= $3",
    [companyId, accountId, day[0].d]
  );
  return { on: day[0].d, bank: BigInt(last.balance_laari), books: BigInt(book[0].b) };
}

module.exports = { places, openBank, setNumber, editBank, transfer, importStatement, bankSays };
