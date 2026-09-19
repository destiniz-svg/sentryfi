/**
 * The bill path, proved against the real database.
 *
 * Exported as a section so it runs inside the ledger self-test's single
 * rolled-back transaction rather than opening its own.
 */

const { splitTax, findPossibleDuplicates, postBill } = require("../src/ledger/bills");
const { verifyChain, verifyTrialBalance } = require("../src/ledger/verify");
const { toLaari, formatLaari } = require("../src/ledger/money");

async function testBills(client, ctx, { check, expectRejection }) {
  const { companyId, userId, accounts } = ctx;

  // ---- the arithmetic that must not be guessed --------------------------

  console.log("\n4. How the tax was quoted, recorded rather than inferred");

  const inclusive = splitTax("4250.50", "inclusive", 800);
  check(
    "a tax-inclusive MVR 4,250.50 splits to 3,935.65 + 314.85",
    inclusive.net === 393565n && inclusive.tax === 31485n && inclusive.gross === 425050n,
    `got ${formatLaari(inclusive.net)} + ${formatLaari(inclusive.tax)} = ${formatLaari(inclusive.gross)}`
  );

  const exclusive = splitTax("4250.50", "exclusive", 800);
  check(
    "the same figure quoted tax-exclusive grosses up to 4,590.54",
    exclusive.net === 425050n && exclusive.tax === 34004n && exclusive.gross === 459054n,
    `got ${formatLaari(exclusive.net)} + ${formatLaari(exclusive.tax)} = ${formatLaari(exclusive.gross)}`
  );

  check(
    "the two readings of the same printed figure differ by MVR 340.04",
    exclusive.gross - inclusive.gross === 34004n
  );

  const unregistered = splitTax("4250.50", "none_unregistered", null);
  check(
    "an unregistered supplier's bill carries no tax at all",
    unregistered.tax === 0n && unregistered.net === 425050n
  );

  let refused = false;
  try { splitTax("100.00", "unknown", 800); } catch { refused = true; }
  check("a bill whose tax treatment is unknown refuses to split", refused);

  refused = false;
  try { splitTax("100.00", "inclusive", null); } catch { refused = true; }
  check("even 8% is not assumed when no rate was recorded", refused);

  // ---- a bill becomes a balanced entry ----------------------------------

  console.log("\n5. A bill produces a balanced entry, and the paper stays");

  const { rows: cpRows } = await client.query(
    `INSERT INTO counterparties (company_id, name, also_known_as, kind, gst_registered)
     VALUES ($1, 'Lily Enterprises Pvt Ltd',
             ARRAY['Lily Enterprise','LILY ENTERPRISES PVT L'], '{supplier}', true)
     RETURNING id`,
    [companyId]
  );
  const supplier = cpRows[0].id;

  const split = splitTax("4250.50", "inclusive", 800);
  const { rows: billRows } = await client.query(
    `INSERT INTO bills
       (company_id, counterparty_id, bill_no, issue_date, currency,
        net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp, received_by)
     VALUES ($1,$2,'INV-8841','2026-09-15','MVR',$3,$4,$5,'inclusive',800,$6)
     RETURNING id`,
    [companyId, supplier, String(split.net), String(split.tax), String(split.gross), userId]
  );
  const billId = billRows[0].id;

  const { entry } = await postBill(client, { companyId, userId, billId, accounts });
  check("the bill posted", Boolean(entry.id));
  check(
    `the entry totals the gross, MVR ${formatLaari(split.gross)}`,
    entry.totalLaari === split.gross,
    `got ${formatLaari(entry.totalLaari)}`
  );

  const { rows: lineRows } = await client.query(
    `SELECT debit_laari, credit_laari FROM journal_lines
      WHERE entry_id = $1 ORDER BY position`,
    [entry.id]
  );
  check("it has three lines: cost, reclaimable tax, and what is owed", lineRows.length === 3);
  check(
    "the tax line carries exactly the tax that was inside the price",
    BigInt(lineRows[1].debit_laari) === split.tax,
    `got ${formatLaari(BigInt(lineRows[1].debit_laari))}`
  );

  const { rows: stateRows } = await client.query(
    "SELECT status, entry_id FROM bills WHERE id = $1", [billId]
  );
  check("the bill is marked posted and points at its entry",
    stateRows[0].status === "posted" && stateRows[0].entry_id === entry.id);

  const balance = await verifyTrialBalance(client, { companyId, userId });
  check("the books still balance", balance.ok, `out by MVR ${formatLaari(balance.difference)}`);

  // ---- an unregistered supplier claims nothing --------------------------

  const { rows: cp2 } = await client.query(
    `INSERT INTO counterparties (company_id, name, kind, gst_registered)
     VALUES ($1, 'Island Zone Constraction', '{supplier}', false) RETURNING id`,
    [companyId]
  );
  const unregisteredSupplier = cp2[0].id;

  const plain = splitTax("2000.00", "none_unregistered", null);
  const { rows: bill2 } = await client.query(
    `INSERT INTO bills
       (company_id, counterparty_id, bill_no, issue_date,
        net_laari, tax_laari, gross_laari, gst_treatment, received_by)
     VALUES ($1,$2,'IZ-114','2026-09-16',$3,0,$4,'none_unregistered',$5)
     RETURNING id`,
    [companyId, unregisteredSupplier, String(plain.net), String(plain.gross), userId]
  );
  const e2 = await postBill(client, { companyId, userId, billId: bill2[0].id, accounts });
  const { rows: l2 } = await client.query(
    "SELECT count(*)::int AS n FROM journal_lines WHERE entry_id = $1", [e2.entry.id]
  );
  check(
    "an unregistered supplier's bill posts with two lines and no tax claimed",
    l2[0].n === 2,
    `got ${l2[0].n} lines`
  );

  await expectRejection(client, "recording tax against an unregistered supplier", async () => {
    await client.query(
      `INSERT INTO bills (company_id, counterparty_id, net_laari, tax_laari, gross_laari, gst_treatment)
       VALUES ($1,$2,100000,8000,108000,'none_unregistered')`,
      [companyId, unregisteredSupplier]
    );
  });

  // ---- the duplicate, stopped before it posts ---------------------------

  console.log("\n6. A supplier billed twice is stopped before it is paid twice");

  const { rows: dupRows } = await client.query(
    `INSERT INTO bills
       (company_id, counterparty_id, bill_no, issue_date,
        net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp, received_by)
     VALUES ($1,$2,'INV-8841','2026-09-17',$3,$4,$5,'inclusive',800,$6)
     RETURNING id`,
    [companyId, supplier, String(split.net), String(split.tax), String(split.gross), userId]
  );

  const warned = await findPossibleDuplicates(client, {
    companyId, userId,
    bill: { id: dupRows[0].id, counterpartyId: supplier, billNo: "INV-8841",
            grossLaari: split.gross, issueDate: "2026-09-17" },
  });
  check("the same bill number from the same supplier is flagged", warned.length > 0);
  if (warned.length) {
    check("and it is called near-certain, not a maybe", warned[0].confidence === "near-certain");
    console.log(`          it says: ${warned[0].because}`);
  }

  await expectRejection(client, "posting the duplicate anyway", () =>
    postBill(client, { companyId, userId, billId: dupRows[0].id, accounts })
  );

  // A different number, same amount, days apart: suspicious, not refused.
  const { rows: nearRows } = await client.query(
    `INSERT INTO bills
       (company_id, counterparty_id, bill_no, issue_date,
        net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp, received_by)
     VALUES ($1,$2,'INV-8850','2026-09-18',$3,$4,$5,'inclusive',800,$6)
     RETURNING id`,
    [companyId, supplier, String(split.net), String(split.tax), String(split.gross), userId]
  );
  const near = await findPossibleDuplicates(client, {
    companyId, userId,
    bill: { id: nearRows[0].id, counterpartyId: supplier, billNo: "INV-8850",
            grossLaari: split.gross, issueDate: "2026-09-18" },
  });
  check(
    "the same amount days apart is raised as possible, not refused",
    near.length > 0 && near.every((d) => d.confidence === "possible"),
    near.map((d) => d.confidence).join(", ")
  );
  const posted = await postBill(client, { companyId, userId, billId: nearRows[0].id, accounts });
  check("and it still posts, because a monthly charge looks like this", Boolean(posted.entry.id));

  // ---- refusals ---------------------------------------------------------

  console.log("\n   What a bill will not do");

  const { rows: vague } = await client.query(
    `INSERT INTO bills (company_id, counterparty_id, bill_no, net_laari, tax_laari, gross_laari, gst_treatment)
     VALUES ($1,$2,'INV-9000',100000,0,100000,'unknown') RETURNING id`,
    [companyId, supplier]
  );
  await expectRejection(client, "posting a bill whose tax nobody has established", () =>
    postBill(client, { companyId, userId, billId: vague[0].id, accounts })
  );

  await expectRejection(client, "a bill whose parts do not add up to its total", async () => {
    await client.query(
      `INSERT INTO bills (company_id, counterparty_id, net_laari, tax_laari, gross_laari, gst_treatment)
       VALUES ($1,$2,100000,8000,999999,'exclusive')`,
      [companyId, supplier]
    );
  });

  const chain = await verifyChain(client, { companyId, userId });
  check(`the chain still verifies over all ${chain.checked} entries`, chain.ok);
}

module.exports = { testBills };
