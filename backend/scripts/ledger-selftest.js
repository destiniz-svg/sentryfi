/**
 * Proving the floor holds.
 *
 * Step 1 of the build plan is done when three things are true:
 *
 *   1. a bill produces a balanced entry,
 *   2. the seal verifies from the first record to the last,
 *   3. a query for another company's books comes back empty.
 *
 * This checks all three against the real database, plus the refusals that
 * matter: an entry that does not balance, an amount that drifts, and a record
 * altered after the fact.
 *
 * Everything runs inside one transaction that is rolled back at the end, so it
 * is safe to run against production and leaves nothing behind. Run it with
 *   npm run ledger:selftest
 */

const { pool } = require("../src/config/db");
const { LEDGER_SQL } = require("../src/config/ledger-schema");
const { BILLS_SQL } = require("../src/config/bills-schema");
const { testBills } = require("./bills-selftest-section");
const { testIdentity } = require("./identity-selftest-section");
const { postEntry, reverseEntry, assumeIdentity } = require("../src/ledger/post");
const { verifyChain, verifyTrialBalance } = require("../src/ledger/verify");
const { toLaari, formatLaari, gstWithin, gstOnTop, allocate } = require("../src/ledger/money");

let passed = 0;
let failed = 0;

function check(description, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${description}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${description}${detail ? `\n          ${detail}` : ""}`);
  }
}

async function expectRejection(client, description, run) {
  await client.query("SAVEPOINT attempt");
  try {
    await run();
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    check(description, false, "it was accepted, and should not have been");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    check(description, true);
    console.log(`          refused with: ${err.message.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------- the money

function testMoney() {
  console.log("\nMoney is whole laari, and never a floating point number");

  check('"4,250.50" reads as 425050 laari', toLaari("4,250.50") === 425050n);
  check("4250.5 reads as 425050 laari", toLaari(4250.5) === 425050n);
  check('"0.1" plus "0.2" is exactly 0.30', toLaari("0.1") + toLaari("0.2") === toLaari("0.30"));
  check('a third decimal rounds up: "10.005" is 10.01', toLaari("10.005") === 1001n);
  check("425050 laari prints as 4,250.50", formatLaari(425050n) === "4,250.50");
  check("5 laari prints as 0.05, not 0.5", formatLaari(5n) === "0.05");

  let refused = false;
  try { toLaari("about four thousand"); } catch { refused = true; }
  check("an amount it cannot read is refused, not guessed", refused);

  // The case this exists for: a thousand amounts of MVR 0.07 must come to
  // MVR 70.00 exactly. Added as floating point they come to 69.99999999999966,
  // which is the drift the whole laari rule exists to remove.
  let total = 0n;
  for (let i = 0; i < 1000; i += 1) total += toLaari("0.07");
  check("a thousand amounts of 0.07 add to exactly 70.00", total === 7000n, `got ${formatLaari(total)}`);

  console.log("\nGST, quoted both ways round");
  check("8% on top of MVR 1,000 is MVR 80.00", gstOnTop("1000.00", 8) === 8000n);
  check("8% within MVR 1,080 is MVR 80.00", gstWithin("1080.00", 8) === 8000n);
  check(
    "within and on-top give different answers for the same figure",
    gstWithin("1000.00", 8) !== gstOnTop("1000.00", 8)
  );

  const shares = allocate("100.00", [1, 1, 1]);
  check(
    "MVR 100 split three ways still sums to MVR 100",
    shares.reduce((a, b) => a + b, 0n) === 10000n,
    `got ${shares.map(formatLaari).join(" + ")}`
  );
}

// --------------------------------------------------------------- the ledger

async function testLedger(client) {
  // Two companies, so isolation can be tested with something real to leak.
  const { rows: userRows } = await client.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Ledger self-test', $1, 'not-a-real-account')
     RETURNING id`,
    [`selftest+${Date.now()}@sentryfi.invalid`]
  );
  const userId = userRows[0].id;

  const { rows: companyRows } = await client.query(
    `INSERT INTO companies (name, base_currency, gst_registered)
     VALUES ('Altura Pvt Ltd (test)', 'MVR', true),
            ('Steva Enterprises (test)', 'MVR', true)
     RETURNING id`
  );
  const altura = companyRows[0].id;
  const steva = companyRows[1].id;

  const accountsFor = async (companyId) => {
    // FORCE ROW LEVEL SECURITY applies to the table owner as well, so even this
    // setup has to say which company it is acting for.
    await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
    const { rows } = await client.query(
      `INSERT INTO accounts (company_id, code, name, type) VALUES
         ($1,'1100','Bank',             'asset'),
         ($1,'2100','Suppliers we owe', 'liability'),
         ($1,'5100','Materials',        'expense'),
         ($1,'1400','GST we can claim', 'asset')
       RETURNING id, code`,
      [companyId]
    );
    return Object.fromEntries(rows.map((r) => [r.code, r.id]));
  };
  const a = await accountsFor(altura);
  const s = await accountsFor(steva);

  // ---- 1. a bill produces a balanced entry ------------------------------

  console.log("\n1. A bill produces a balanced entry");

  // A real shape: MVR 4,250.50 of cement from a GST-registered supplier who
  // quotes tax-inclusive, which is how most Maldivian suppliers invoice.
  const gross = toLaari("4250.50");
  const tax = gstWithin(gross, 8);
  const net = gross - tax;

  const bill = await postEntry(client, {
    companyId: altura,
    userId,
    date: "2026-09-15",
    source: "bill",
    narrative: "Cement, 20 tonnes — Lily Enterprises",
    lines: [
      { accountId: a["5100"], debit: net, memo: "Cement 20t" },
      { accountId: a["1400"], debit: tax, memo: "GST 8% included in the price" },
      { accountId: a["2100"], credit: gross, memo: "Lily Enterprises" },
    ],
  });

  check("the bill posted", Boolean(bill.id));
  check("it is entry number 1", bill.entryNo === 1n, `got ${bill.entryNo}`);
  check(
    `the two sides agree at MVR ${formatLaari(gross)}`,
    bill.totalLaari === gross,
    `got ${formatLaari(bill.totalLaari)}`
  );
  check(
    `tax and net add back to the gross exactly (${formatLaari(net)} + ${formatLaari(tax)})`,
    net + tax === gross
  );

  await postEntry(client, {
    companyId: altura,
    userId,
    date: "2026-09-16",
    source: "payment",
    narrative: "Paid Lily Enterprises",
    lines: [
      { accountId: a["2100"], debit: gross },
      { accountId: a["1100"], credit: gross },
    ],
  });

  // ---- the refusals -----------------------------------------------------

  console.log("\n   What it refuses to write");

  await expectRejection(client, "an entry where the sides do not agree", () =>
    postEntry(client, {
      companyId: altura, userId, date: "2026-09-17", source: "bill",
      narrative: "Deliberately out by MVR 10",
      lines: [
        { accountId: a["5100"], debit: "100.00" },
        { accountId: a["2100"], credit: "90.00" },
      ],
    })
  );

  await expectRejection(client, "a line that is a debit and a credit at once", () =>
    postEntry(client, {
      companyId: altura, userId, date: "2026-09-17", source: "bill",
      narrative: "Both sides on one line",
      lines: [
        { accountId: a["5100"], debit: "100.00", credit: "100.00" },
        { accountId: a["2100"], credit: "100.00" },
      ],
    })
  );

  await expectRejection(client, "an entry with no explanation of what it is", () =>
    postEntry(client, {
      companyId: altura, userId, date: "2026-09-17", source: "bill", narrative: "   ",
      lines: [
        { accountId: a["5100"], debit: "100.00" },
        { accountId: a["2100"], credit: "100.00" },
      ],
    })
  );

  await expectRejection(client, "deleting a posted entry", async () => {
    await client.query("DELETE FROM journal_entries WHERE id = $1", [bill.id]);
  });

  await expectRejection(client, "quietly editing the amount on a posted line", async () => {
    await client.query("UPDATE journal_lines SET debit_laari = 1 WHERE entry_id = $1", [bill.id]);
  });

  // Both of those were stopped by the permission before the trigger was
  // reached. The triggers are the second line of defence, for anyone connecting
  // with more authority than the application has, so they are worth proving
  // separately rather than assuming.
  await expectRejection(client, "deleting an entry even as the database owner", async () => {
    await client.query("RESET ROLE");
    await client.query("DELETE FROM journal_entries WHERE id = $1", [bill.id]);
  });

  await expectRejection(client, "rewriting an entry's seal even as the database owner", async () => {
    await client.query("RESET ROLE");
    await client.query("UPDATE journal_entries SET hash = '\\x00' WHERE id = $1", [bill.id]);
  });

  await expectRejection(client, "back-dating a posted entry even as the database owner", async () => {
    await client.query("RESET ROLE");
    await client.query("UPDATE journal_entries SET entry_date = '2026-01-01' WHERE id = $1", [bill.id]);
  });

  await assumeIdentity(client, { companyId: altura, userId });

  // ---- corrections ------------------------------------------------------

  console.log("\n   Corrections leave both records standing");

  const correction = await reverseEntry(client, {
    companyId: altura, userId, entryId: bill.id,
    reason: "Supplier reissued the invoice with the right tonnage",
    date: "2026-09-18",
  });
  check("the reversal posted as its own entry", correction.entryNo === 3n, `got ${correction.entryNo}`);

  const { rows: stillThere } = await client.query(
    "SELECT id FROM journal_entries WHERE id = $1", [bill.id]
  );
  check("the original is still there, not deleted", stillThere.length === 1);

  const balance = await verifyTrialBalance(client, { companyId: altura, userId });
  check(
    "after the reversal the books still balance overall",
    balance.ok,
    `out by MVR ${formatLaari(balance.difference)}`
  );

  await expectRejection(client, "reversing the same entry twice", () =>
    reverseEntry(client, {
      companyId: altura, userId, entryId: bill.id, reason: "again", date: "2026-09-18",
    })
  );

  // ---- 2. the seal verifies ---------------------------------------------

  console.log("\n2. The seal verifies from the first record to the last");

  const chain = await verifyChain(client, { companyId: altura, userId });
  check(
    `all ${chain.checked} entries verify`,
    chain.ok,
    chain.problems.map((p) => `entry ${p.entryNo}: ${p.problem}`).join("\n          ")
  );

  // Now the threat the seal exists for. Triggers and permissions stop the
  // application; they do not stop somebody with direct database access. Here
  // that is simulated exactly: as the owner, with the safety triggers off,
  // MVR 4,250.50 of cement is inflated to MVR 42,500.50 on both sides at once,
  // so the entry still balances and the trial balance still agrees. Nothing but
  // the hash notices.
  await client.query("SAVEPOINT tamper");
  await client.query("RESET ROLE");
  // The balance checks from the entries posted above are still queued, waiting
  // for COMMIT, and Postgres will not alter a table with trigger events
  // pending. Running them now clears the queue; they all pass, because
  // everything posted so far balances.
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("ALTER TABLE journal_lines DISABLE TRIGGER USER");
  await client.query(
    `UPDATE journal_lines SET debit_laari = debit_laari + 3825000
      WHERE entry_id = $1 AND debit_laari > 0 AND account_id = $2`,
    [bill.id, a["5100"]]
  );
  await client.query(
    `UPDATE journal_lines SET credit_laari = credit_laari + 3825000 WHERE entry_id = $1 AND credit_laari > 0`,
    [bill.id]
  );
  await client.query("ALTER TABLE journal_lines ENABLE TRIGGER USER");
  // Back to checking at COMMIT, which is what the rest of the run needs: the
  // lines of one entry arrive one at a time and only balance once they are all
  // in. Immediate checking would reject the first line of every entry.
  await client.query("SET CONSTRAINTS ALL DEFERRED");

  const tamperedBalance = await verifyTrialBalance(client, { companyId: altura, userId });
  const tamperedChain = await verifyChain(client, { companyId: altura, userId });

  check(
    "a doctored figure still passes a plain balance check (which is why the seal exists)",
    tamperedBalance.ok
  );
  check(
    "the seal catches it anyway",
    !tamperedChain.ok,
    "the chain verified despite the record being altered"
  );
  if (!tamperedChain.ok) {
    console.log(`          it reports: entry ${tamperedChain.problems[0].entryNo}: ${tamperedChain.problems[0].problem}`);
    check(
      "and it names the altered entry, not a later one",
      tamperedChain.problems[0].entryNo === "1",
      `named entry ${tamperedChain.problems[0].entryNo}`
    );
  }

  await client.query("ROLLBACK TO SAVEPOINT tamper");

  const restored = await verifyChain(client, { companyId: altura, userId });
  check("with the tampering undone, the chain verifies again", restored.ok);

  // ---- 3. one company cannot see another --------------------------------

  console.log("\n3. A query for another company's books comes back empty");

  await postEntry(client, {
    companyId: steva, userId, date: "2026-09-15", source: "bill",
    narrative: "Steva's own bill, which Altura must never see",
    lines: [
      { accountId: s["5100"], debit: "999.99" },
      { accountId: s["2100"], credit: "999.99" },
    ],
  });

  // Acting as Altura, ask for everything. Not "everything where company_id is
  // Altura" — everything. A correct filter in the query would prove nothing,
  // because the point is that forgetting the filter is safe.
  await assumeIdentity(client, { companyId: altura, userId });
  const { rows: seenByAltura } = await client.query("SELECT company_id FROM journal_entries");
  const leaked = seenByAltura.filter((r) => r.company_id !== altura);
  check(
    "an unfiltered query returns only this company's entries",
    seenByAltura.length > 0 && leaked.length === 0,
    `saw ${seenByAltura.length} entries, ${leaked.length} belonging to another company`
  );

  const { rows: linesSeen } = await client.query("SELECT company_id FROM journal_lines");
  check(
    "the same for the lines beneath them",
    linesSeen.length > 0 && linesSeen.every((r) => r.company_id === altura)
  );

  // And the sharper version: name the other company explicitly.
  const { rows: aimed } = await client.query(
    "SELECT id FROM journal_entries WHERE company_id = $1", [steva]
  );
  check("asking for the other company by name returns nothing", aimed.length === 0, `got ${aimed.length} rows`);

  await expectRejection(client, "writing an entry into another company's books", async () => {
    await assumeIdentity(client, { companyId: altura, userId });
    await client.query(
      `INSERT INTO journal_entries
         (company_id, entry_no, entry_date, posted_by, source, narrative, hash)
       VALUES ($1, 9999, '2026-09-19', $2, 'adjustment', 'Smuggled in', '\\x00')`,
      [steva, userId]
    );
  });

  // With no identity set at all, nothing is visible. A forgotten identity must
  // fail closed, not open.
  await client.query("SET LOCAL ROLE sentryfi_app");
  await client.query("SELECT set_config('app.company_id', '', true)");
  const { rows: anonymous } = await client.query("SELECT id FROM journal_entries");
  check("with no company set, nothing at all is visible", anonymous.length === 0, `got ${anonymous.length} rows`);
  await client.query("RESET ROLE");

  // Steva's books are of course still intact from Steva's side.
  const stevaChain = await verifyChain(client, { companyId: steva, userId });
  check("the other company's own books verify independently", stevaChain.ok);
  check("and its numbering starts at 1, not continuing Altura's", stevaChain.checked === 1);

  // ---- step 2: the bill path --------------------------------------------

  // An outsider, to prove that belonging to nothing is refused.
  const { rows: outsiderRows } = await client.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Not a member', $1, 'not-a-real-account') RETURNING id`,
    [`outsider+${Date.now()}@sentryfi.invalid`]
  );
  await testIdentity(
    client,
    { companyId: altura, otherCompanyId: steva, userId, outsiderId: outsiderRows[0].id },
    { check }
  );

  await testBills(
    client,
    {
      companyId: altura,
      userId,
      accounts: { expense: a["5100"], taxReclaimable: a["1400"], payable: a["2100"] },
    },
    { check, expectRejection }
  );
}

// ------------------------------------------------------------------- run it

(async () => {
  console.log("Ledger self-test — nothing is kept; the whole run is rolled back at the end.");

  testMoney();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(LEDGER_SQL);
    await client.query(BILLS_SQL);
    await testLedger(client);
  } catch (err) {
    failed += 1;
    console.error(`\n  ERROR  the run stopped early: ${err.message}`);
    if (err.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* nothing to roll back */ }
    client.release();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed === 0) {
    console.log("Step 1 holds: bills balance, the seal verifies, and the books are walled off.");
  }
  process.exit(failed === 0 ? 0 : 1);
})();
