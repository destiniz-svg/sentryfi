const { postEntry } = require("./post");
const { toLaari, formatLaari } = require("./money");

/**
 * The money people actually handle.
 *
 * On a Maldivian site a supervisor carries a few thousand rufiyaa in a tin and
 * spends it on the things that cannot wait: a boat load of sand, a day's
 * labour, lunch for the crew. Some of it comes back as a scrap of paper and
 * some of it comes back as nothing at all. None of it could be recorded until
 * now, so the books were complete about everything except the money people
 * were actually holding.
 *
 * Everything here goes through postEntry, so a handful of cash is the same
 * kind of fact as a supplier invoice: a balanced entry, numbered without gaps,
 * in the hash chain. There is no separate cash ledger and no running total
 * kept anywhere — what is in a box is read from the journal lines on that
 * box's account, every time it is asked.
 *
 * That last part is the whole design. A tin of cash already has two records:
 * the books, and the notes in the tin. The job here is to keep the first one
 * honest and make the second one's disagreements visible, not to invent a
 * third one that can drift from both.
 */

/** What the books say is in the box, right now. */
async function boxBalance(client, { companyId, accountId }) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(l.debit_laari) - SUM(l.credit_laari), 0) AS balance
       FROM journal_lines l
      WHERE l.company_id = $1 AND l.account_id = $2`,
    [companyId, accountId]
  );
  return BigInt(rows[0].balance);
}

/** An account by its code, for this company. */
async function accountByCode(client, { companyId, code }) {
  const { rows } = await client.query(
    `SELECT id, name FROM accounts WHERE company_id = $1 AND code = $2`,
    [companyId, code]
  );
  return rows[0] || null;
}

/**
 * Where a cash difference goes.
 *
 * Made when it is first needed rather than added to the starting chart,
 * because companies that already exist would not have it, and a count is a
 * bad moment to discover an account is missing.
 */
async function differencesAccount(client, { companyId }) {
  const found = await accountByCode(client, { companyId, code: "5700" });
  if (found) return found;

  // DO NOTHING, not DO UPDATE. The app role has INSERT on accounts and
  // deliberately not UPDATE — a chart of accounts is not something the
  // application rewrites — so an upsert here fails with "permission denied for
  // table accounts" the first time anybody counts a tin. The restriction is
  // right; this asks for what it actually needs.
  await client.query(
    `INSERT INTO accounts (company_id, code, name, type)
     VALUES ($1, '5700', 'Cash differences', 'expense')
     ON CONFLICT (company_id, code) DO NOTHING`,
    [companyId]
  );
  const made = await accountByCode(client, { companyId, code: "5700" });
  if (!made) throw new Error("Could not open an account for cash differences.");
  return made;
}

/**
 * A new asset account under a two-digit family (11 bank, 12 cash boxes), with
 * the next free code: 1111, 1112, ... The family's own 1100/1200 is the
 * starting chart's account and stays where it is.
 */
async function openAssetAccount(client, { companyId, prefix, name }) {
  const { rows: used } = await client.query(
    `SELECT code FROM accounts WHERE company_id = $1 AND code LIKE $2`,
    [companyId, `${prefix}%`]
  );
  const taken = new Set(used.map((r) => r.code));
  let code = null;
  for (let n = 1; n <= 89; n += 1) {
    const candidate = `${prefix}${String(n + 10).padStart(2, "0")}`;
    if (!taken.has(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("There is no room for another account in the chart of accounts.");

  const { rows } = await client.query(
    `INSERT INTO accounts (company_id, code, name, type)
     VALUES ($1, $2, $3, 'asset') RETURNING id, code, name`,
    [companyId, code, name]
  );
  return rows[0];
}

/**
 * Opens a box.
 *
 * Every box gets its own account beneath cash, so "what is in the Malé site
 * tin" can be answered without reading a memo field. One shared account for
 * every box would mean a count could only ever check the total, which is
 * precisely the figure nobody is holding.
 */
async function openBox(client, { companyId, userId, name, holderId, projectId }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("A cash box needs a name, so a count can say which tin it was.");

  const { rows: existing } = await client.query(
    `SELECT id FROM cash_boxes WHERE company_id = $1 AND lower(name) = lower($2)`,
    [companyId, clean]
  );
  if (existing.length) throw new Error(`There is already a cash box called "${clean}".`);

  // 1200 is "Cash boxes" in the starting chart; each box hangs beneath it with
  // its own code so its balance stands alone.
  const account = await openAssetAccount(client, { companyId, prefix: "12", name: `Cash: ${clean}` });

  const { rows } = await client.query(
    `INSERT INTO cash_boxes (company_id, name, account_id, holder_id, project_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [companyId, clean, account.id, holderId || userId, projectId || null]
  );
  return rows[0];
}

/**
 * Money out of the tin.
 *
 * Posted the moment it is recorded. A cash spend that waits for approval is a
 * cash spend that never gets recorded: the money has already gone, and asking
 * somebody to come back later to confirm what they already did is how a tin
 * ends up unaccounted for. It is reversible, like anything else that touched
 * the books.
 */
async function spend(client, { companyId, userId, boxId, amount, what, accountId, projectId, spentOn }) {
  const laari = toLaari(amount);
  if (laari <= 0n) throw new Error("How much was spent?");
  const said = String(what || "").trim();
  if (!said) throw new Error("What was it spent on?");

  const { rows: boxes } = await client.query(
    `SELECT id, name, account_id FROM cash_boxes
      WHERE id = $1 AND company_id = $2 AND closed_at IS NULL`,
    [boxId, companyId]
  );
  const box = boxes[0];
  if (!box) throw new Error("That cash box is not open.");

  // Spending more than is in the tin is recorded, never refused. The money has
  // already gone; a box that reads below zero is a finding, and refusing the
  // record would only move the problem somewhere the books cannot see it.
  const before = await boxBalance(client, { companyId, accountId: box.account_id });

  const { rows: spendRows } = await client.query(
    `INSERT INTO cash_spends
       (company_id, box_id, amount_laari, what, account_id, project_id, spent_by, spent_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, current_date))
     RETURNING *`,
    [companyId, boxId, laari.toString(), said, accountId, projectId || null, userId, spentOn || null]
  );
  const record = spendRows[0];

  const entry = await postEntry(client, {
    companyId,
    userId,
    date: record.spent_on,
    source: "cash_spend",
    sourceId: record.id,
    narrative: `${said} - cash from ${box.name}`,
    lines: [
      { accountId, debit: laari, projectId: projectId || null, memo: said },
      { accountId: box.account_id, credit: laari, memo: `Cash from ${box.name}` },
    ],
  });

  await client.query(`UPDATE cash_spends SET entry_id = $1 WHERE id = $2`, [entry.id, record.id]);

  const after = before - laari;
  return {
    spend: { ...record, entry_id: entry.id },
    entry,
    box,
    leftInBox: after,
    // The number the person holding the tin cares about, and the one they can
    // check against what is in their hand.
    overdrawn: after < 0n,
  };
}

/**
 * What was actually counted.
 *
 * The count is kept as counted. If it disagrees with the books, the difference
 * becomes its own entry with the reason attached — so the books end up
 * agreeing with the tin, and the journal says exactly how much was
 * unaccounted for and what was said about it. A count that quietly rewrote
 * earlier entries would erase the only evidence that anything was wrong.
 */
async function count(client, { companyId, userId, boxId, counted, reason }) {
  const countedLaari = toLaari(counted);
  if (countedLaari < 0n) throw new Error("A count cannot be less than nothing.");

  const { rows: boxes } = await client.query(
    `SELECT id, name, account_id FROM cash_boxes
      WHERE id = $1 AND company_id = $2 AND closed_at IS NULL`,
    [boxId, companyId]
  );
  const box = boxes[0];
  if (!box) throw new Error("That cash box is not open.");

  const expected = await boxBalance(client, { companyId, accountId: box.account_id });
  const difference = countedLaari - expected;
  const said = String(reason || "").trim();

  if (difference !== 0n && !said) {
    throw new Error(
      difference < 0n
        ? `There is ${formatLaari(-difference)} less in the box than the books say. Say what happened to it.`
        : `There is ${formatLaari(difference)} more in the box than the books say. Say where it came from.`
    );
  }

  let entry = null;
  if (difference !== 0n) {
    const account = await differencesAccount(client, { companyId });
    const short = difference < 0n;
    const size = short ? -difference : difference;

    entry = await postEntry(client, {
      companyId,
      userId,
      date: new Date(),
      source: "cash_count",
      narrative: `Counted ${box.name}: ${short ? "short" : "over"} by ${formatLaari(size)} - ${said}`,
      lines: short
        ? [
            { accountId: account.id, debit: size, memo: said },
            { accountId: box.account_id, credit: size, memo: `Short on counting ${box.name}` },
          ]
        : [
            { accountId: box.account_id, debit: size, memo: `Over on counting ${box.name}` },
            { accountId: account.id, credit: size, memo: said },
          ],
    });
  }

  const { rows } = await client.query(
    `INSERT INTO cash_counts
       (company_id, box_id, counted_laari, expected_laari, reason, entry_id, counted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      companyId,
      boxId,
      countedLaari.toString(),
      expected.toString(),
      said || null,
      entry ? entry.id : null,
      userId,
    ]
  );

  return { count: rows[0], entry, expected, counted: countedLaari, difference };
}

/** Asking for more. Not money yet, so nothing is posted. */
async function askTopup(client, { companyId, userId, boxId, amount, note }) {
  const laari = toLaari(amount);
  if (laari <= 0n) throw new Error("How much is needed?");

  const { rows: boxes } = await client.query(
    `SELECT id FROM cash_boxes WHERE id = $1 AND company_id = $2 AND closed_at IS NULL`,
    [boxId, companyId]
  );
  if (!boxes.length) throw new Error("That cash box is not open.");

  const { rows } = await client.query(
    `INSERT INTO cash_topups (company_id, box_id, asked_laari, note, asked_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [companyId, boxId, laari.toString(), String(note || "").trim() || null, userId]
  );
  return rows[0];
}

/**
 * Giving it. This is the moment it becomes money: out of the bank, into the
 * tin.
 *
 * What was given is recorded separately from what was asked for, because they
 * are different numbers often enough to matter and the gap is worth seeing.
 */
async function giveTopup(client, { companyId, userId, topupId, given, fromAccountId }) {
  const { rows: found } = await client.query(
    `SELECT t.*, b.name AS box_name, b.account_id AS box_account
       FROM cash_topups t JOIN cash_boxes b ON b.id = t.box_id
      WHERE t.id = $1 AND t.company_id = $2`,
    [topupId, companyId]
  );
  const topup = found[0];
  if (!topup) throw new Error("No such request.");
  if (topup.status !== "asked") throw new Error("That request has already been dealt with.");

  const laari =
    given === undefined || given === null ? BigInt(topup.asked_laari) : toLaari(given);
  if (laari <= 0n) throw new Error("How much was given?");

  // Which bank account it comes out of. Without one named, the starting chart's
  // 1100, which is the only one a company has until it opens a second.
  const bank = fromAccountId
    ? (await client.query(
        `SELECT id FROM accounts WHERE id = $1 AND company_id = $2 AND code LIKE '11%'`,
        [fromAccountId, companyId]
      )).rows[0]
    : await accountByCode(client, { companyId, code: "1100" });
  if (!bank) throw new Error("That is not a bank account of this company.");

  const entry = await postEntry(client, {
    companyId,
    userId,
    date: new Date(),
    source: "cash_topup",
    sourceId: topup.id,
    narrative: `Cash to ${topup.box_name}`,
    lines: [
      { accountId: topup.box_account, debit: laari, memo: `Top-up for ${topup.box_name}` },
      { accountId: bank.id, credit: laari, memo: `Cash drawn for ${topup.box_name}` },
    ],
  });

  const { rows } = await client.query(
    `UPDATE cash_topups
        SET status = 'given', given_laari = $3, entry_id = $4, settled_by = $5, settled_at = now()
      WHERE id = $1 AND company_id = $2 RETURNING *`,
    [topupId, companyId, laari.toString(), entry.id, userId]
  );
  return { topup: rows[0], entry };
}

module.exports = {
  boxBalance,
  accountByCode,
  differencesAccount,
  openAssetAccount,
  openBox,
  spend,
  count,
  askTopup,
  giveTopup,
};
