const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");
const { openAssetAccount } = require("./cash");

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
            COALESCE(SUM(l.debit_laari) - SUM(l.credit_laari), 0) AS balance
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

module.exports = { places, openBank, transfer };
