/**
 * Payment runs: pay chosen supplier bills and approved expense claims from one
 * account on one day. One entry: each supplier's share off what is owed to
 * suppliers (2100, tagged to the supplier), each claim off what is owed to
 * staff (2400), and the total off the bank. Each bill and claim then knows
 * what has been paid on it. The run also gives the list of transfers to make
 * at the bank, with each supplier's account number where it is known.
 *
 * A bank line explained as paying a bill (Bank, "paid this bill") is a run of
 * one, dated the bank's day, so the bill knows it is paid here as well. A run
 * whose entry is taken back is marked reversed and its payments stop counting.
 */
const { postEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const stock = require("./stock");
const claims = require("./claims");
const nwt = require("./nwt");

const NWT_OWED = ["2250", "Withholding tax to pay", "liability"];

/** Bills in the books, in our own currency, not fully paid; and approved claims not fully paid. */
async function unpaid(client, { companyId }) {
  const { rows: bills } = await client.query(
    `SELECT b.id, b.bill_no, b.issue_date::text AS issued, b.due_date::text AS due, b.gross_laari, c.name AS supplier, c.bank_accounts,
            COALESCE((SELECT SUM(p.amount_laari) FROM payment_items p JOIN payment_runs pr ON pr.id = p.run_id AND pr.reversed_at IS NULL WHERE p.bill_id = b.id), 0) AS paid
       FROM bills b JOIN counterparties c ON c.id = b.counterparty_id
      WHERE b.company_id = $1 AND b.status = 'posted' AND b.voided_at IS NULL AND b.fc_gross IS NULL`,
    [companyId]
  );
  const { rows: cl } = await client.query("SELECT id FROM expense_claims WHERE company_id = $1 AND approved_at IS NOT NULL AND rejected_at IS NULL", [companyId]);
  const out = [];
  for (const b of bills) {
    const owed = BigInt(b.gross_laari) - BigInt(b.paid);
    if (owed > 0n) out.push({ kind: "bill", id: b.id, payee: b.supplier, reference: b.bill_no, due: b.due || b.issued, owed: formatLaari(owed), bankAccount: (b.bank_accounts || [])[0] || null });
  }
  for (const r of cl) {
    const c = claims.show(await claims.load(client, { companyId, claimId: r.id }));
    if (toLaari(c.owed) > 0n) out.push({ kind: "claim", id: c.id, payee: c.claimant, reference: c.number, due: null, owed: c.owed, bankAccount: null });
  }
  return out.sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
}

/** Pays what was chosen. Never more than is still owed on each. */
async function pay(client, { companyId, userId, fromAccountId, paidOn, reference, items }) {
  await assumeIdentity(client, { companyId, userId });
  if (!items?.length) throw new Error("Choose what to pay.");
  const { rows: from } = await client.query("SELECT id, name FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'asset'", [fromAccountId, companyId]);
  if (!from[0]) throw new Error("Pay from which bank account?");
  const payable = (await client.query("SELECT id FROM accounts WHERE company_id = $1 AND code = '2100'", [companyId])).rows[0];
  if (!payable) throw new Error("This company has no account for what it owes suppliers.");
  const owedToStaff = await stock.account(client, companyId, claims.OWED_TO_STAFF);

  const lines = [];
  const recorded = [];
  const transfers = [];
  const withheld = [];
  const nwtRules = await nwt.rules(client, { companyId });
  let total = 0n;
  for (const it of items) {
    const amount = toLaari(it.amount);
    if (amount <= 0n) throw new Error("Each payment is above zero.");
    if (it.billId) {
      const { rows } = await client.query(
        `SELECT b.id, b.bill_no, b.gross_laari, b.counterparty_id, b.status, b.fc_gross, c.name, c.bank_accounts, c.nwt_category,
                COALESCE((SELECT SUM(p.amount_laari) FROM payment_items p JOIN payment_runs pr ON pr.id = p.run_id AND pr.reversed_at IS NULL WHERE p.bill_id = b.id), 0) AS paid
           FROM bills b JOIN counterparties c ON c.id = b.counterparty_id WHERE b.id = $1 AND b.company_id = $2 FOR UPDATE OF b`,
        [it.billId, companyId]
      );
      const b = rows[0];
      if (!b || b.status !== "posted") throw new Error("Only a bill in the books can be paid.");
      if (b.fc_gross !== null) throw new Error(`${b.bill_no || "That bill"} is in another currency. Pay it from the bank's foreign account.`);
      const left = BigInt(b.gross_laari) - BigInt(b.paid);
      if (amount > left) throw new Error(`Only MVR ${formatLaari(left)} is still owed on ${b.name}'s ${b.bill_no || "bill"}.`);
      lines.push({ accountId: payable.id, debit: amount, counterpartyId: b.counterparty_id, memo: `Paid ${b.name}${b.bill_no ? `, ${b.bill_no}` : ""}` });
      recorded.push({ billId: b.id, amount });
      // A non-resident supplier is paid less the tax kept back for the tax
      // authority; the bill is still settled in full.
      const rule = b.nwt_category && nwtRules?.categories[b.nwt_category];
      const kept = rule ? nwt.withheldOn(amount, rule.bp) : 0n;
      if (kept > 0n) withheld.push({ counterpartyId: b.counterparty_id, billId: b.id, category: b.nwt_category, bp: rule.bp, gross: amount, kept, name: b.name, billNo: b.bill_no });
      transfers.push({ payee: b.name, bankAccount: (b.bank_accounts || [])[0] || null, amount: formatLaari(amount - kept), reference: b.bill_no || "", ...(kept > 0n ? { withheld: formatLaari(kept) } : {}) });
    } else if (it.claimId) {
      const c = claims.show(await claims.load(client, { companyId, claimId: it.claimId }));
      if (!["approved", "part_paid"].includes(c.status)) throw new Error(`${c.number} is not approved and owed.`);
      if (amount > toLaari(c.owed)) throw new Error(`Only MVR ${c.owed} is still owed on ${c.number}.`);
      lines.push({ accountId: owedToStaff, debit: amount, memo: `Paid back ${c.claimant}, ${c.number}` });
      recorded.push({ claimId: c.id, amount });
      transfers.push({ payee: c.claimant, bankAccount: null, amount: formatLaari(amount), reference: c.number });
    } else throw new Error("Each payment is for a bill or a claim.");
    total += amount;
  }
  const keptTotal = withheld.reduce((a, w) => a + w.kept, 0n);
  if (keptTotal > 0n) {
    const toPay = await stock.account(client, companyId, NWT_OWED);
    for (const w of withheld) lines.push({ accountId: toPay, credit: w.kept, counterpartyId: w.counterpartyId, memo: `Withholding tax kept back from ${w.name}${w.billNo ? `, ${w.billNo}` : ""}` });
  }
  lines.push({ accountId: from[0].id, credit: total - keptTotal, memo: reference ? `Payment run ${reference}` : "Payment run" });
  const entry = await postEntry(client, { companyId, userId, date: paidOn, source: "adjustment", narrative: `Payment run: ${items.length} ${items.length === 1 ? "payment" : "payments"}${reference ? `, ${reference}` : ""}`, lines });
  const { rows: run } = await client.query(
    "INSERT INTO payment_runs (company_id, paid_on, from_account_id, reference, entry_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [companyId, paidOn, from[0].id, reference || null, entry.id, userId]
  );
  for (const r of recorded) {
    await client.query("INSERT INTO payment_items (company_id, run_id, bill_id, claim_id, amount_laari) VALUES ($1,$2,$3,$4,$5)", [companyId, run[0].id, r.billId || null, r.claimId || null, r.amount.toString()]);
  }
  for (const w of withheld) {
    await client.query(
      "INSERT INTO nwt_withheld (company_id, counterparty_id, bill_id, run_id, entry_id, category, rate_bp, gross_laari, withheld_laari, paid_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [companyId, w.counterpartyId, w.billId, run[0].id, entry.id, w.category, w.bp, w.gross.toString(), w.kept.toString(), paidOn]
    );
  }
  return { runId: run[0].id, entry, total, withheld: keptTotal, from: from[0].name, transfers };
}

async function runs(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT r.id, r.paid_on::text AS paid_on, r.reference, a.name AS from_account, e.entry_no,
            (SELECT COALESCE(SUM(amount_laari), 0) FROM payment_items i WHERE i.run_id = r.id) AS total,
            (SELECT count(*)::int FROM payment_items i WHERE i.run_id = r.id) AS items
       FROM payment_runs r JOIN accounts a ON a.id = r.from_account_id JOIN journal_entries e ON e.id = r.entry_id
      WHERE r.company_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
    [companyId]
  );
  return rows.map((r) => ({ id: r.id, paidOn: r.paid_on, reference: r.reference, from: r.from_account, entryNo: String(r.entry_no), total: formatLaari(BigInt(r.total)), items: r.items }));
}

module.exports = { unpaid, pay, runs };
