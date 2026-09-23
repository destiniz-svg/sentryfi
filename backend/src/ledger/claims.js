/**
 * Expense claims: what someone spent from their own pocket for the business.
 * They write it up line by line and send it; someone who approves (not the
 * claimant, and within their spending limit) approves it, which puts each line
 * on its kind of cost and what is owed to the person on 2400; a payment run
 * pays it back. A rejected claim is kept with its reason.
 */
const { postEntry, assumeIdentity } = require("./post");
const { toLaari, formatLaari } = require("./money");
const stock = require("./stock");

const OWED_TO_STAFF = ["2400", "Owed to staff", "liability"];

async function create(client, { companyId, userId, note, lines, submit = true }) {
  await assumeIdentity(client, { companyId, userId });
  if (!lines?.length) throw new Error("What was spent?");
  const prepared = [];
  for (const [i, l] of lines.entries()) {
    const amount = toLaari(l.amount);
    if (amount <= 0n) throw new Error(`Line ${i + 1}: how much?`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.spentOn || ""))) throw new Error(`Line ${i + 1}: on what date?`);
    if (!String(l.description || "").trim()) throw new Error(`Line ${i + 1}: what was it?`);
    const { rows } = await client.query("SELECT 1 FROM accounts WHERE id = $1 AND company_id = $2 AND type = 'expense'", [l.accountId, companyId]);
    if (!rows.length) throw new Error(`Line ${i + 1}: which kind of cost?`);
    if (l.projectId) {
      const { rows: p } = await client.query("SELECT 1 FROM projects WHERE id = $1 AND company_id = $2", [l.projectId, companyId]);
      if (!p.length) throw new Error("That project is not in these books.");
    }
    prepared.push({ ...l, amount, position: i });
  }
  const { rows: n } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::int), 0) + 1 AS n FROM expense_claims WHERE company_id = $1`,
    [companyId]
  );
  const number = `EC-${String(n[0].n).padStart(4, "0")}`;
  const { rows } = await client.query(
    `INSERT INTO expense_claims (company_id, number, claimant_id, note, submitted_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, number`,
    [companyId, number, userId, String(note || "").trim(), submit ? new Date() : null]
  );
  for (const l of prepared) {
    await client.query(
      `INSERT INTO expense_claim_lines (company_id, claim_id, position, spent_on, description, account_id, project_id, amount_laari) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [companyId, rows[0].id, l.position, l.spentOn, String(l.description).trim(), l.accountId, l.projectId || null, l.amount.toString()]
    );
  }
  return rows[0];
}

async function load(client, { companyId, claimId }) {
  const { rows } = await client.query(
    `SELECT c.*, u.name AS claimant, a.name AS approver,
            (SELECT COALESCE(SUM(amount_laari), 0) FROM expense_claim_lines l WHERE l.claim_id = c.id) AS total,
            (SELECT COALESCE(SUM(amount_laari), 0) FROM payment_items p WHERE p.claim_id = c.id) AS paid
       FROM expense_claims c JOIN users u ON u.id = c.claimant_id LEFT JOIN users a ON a.id = c.approved_by
      WHERE c.id = $1 AND c.company_id = $2`,
    [claimId, companyId]
  );
  if (!rows[0]) throw new Error("That claim is not in these books.");
  const { rows: lines } = await client.query(
    `SELECT l.*, l.spent_on::text AS on_text, a.name AS account, p.name AS project FROM expense_claim_lines l
       JOIN accounts a ON a.id = l.account_id LEFT JOIN projects p ON p.id = l.project_id WHERE l.claim_id = $1 ORDER BY l.position`,
    [claimId]
  );
  const { rows: receipts } = await client.query("SELECT id, filename FROM attachments WHERE claim_id = $1 ORDER BY uploaded_at", [claimId]);
  return { claim: rows[0], lines, receipts };
}

function statusOf(c) {
  const total = BigInt(c.total);
  const paid = BigInt(c.paid);
  if (c.rejected_at) return "rejected";
  if (!c.submitted_at) return "draft";
  if (!c.approved_at) return "submitted";
  if (paid >= total) return "paid";
  return paid > 0n ? "part_paid" : "approved";
}

/** Approved: each line onto its kind of cost, and the whole owed to the claimant. */
async function approve(client, { companyId, userId, claimId, approveUpTo, on }) {
  await assumeIdentity(client, { companyId, userId });
  const { claim, lines } = await load(client, { companyId, claimId });
  if (statusOf(claim) !== "submitted") throw new Error("That claim is not waiting for approval.");
  if (claim.claimant_id === userId) throw new Error("Nobody approves their own claim.");
  const total = BigInt(claim.total);
  if (approveUpTo !== null && total > approveUpTo) throw new Error(`MVR ${formatLaari(total)} is over your limit. Someone with a higher one has to approve it.`);
  const owed = await stock.account(client, companyId, OWED_TO_STAFF);
  const memo = `${claim.number}: ${claim.claimant}`;
  const entry = await postEntry(client, {
    companyId, userId, date: on || new Date().toISOString().slice(0, 10), source: "adjustment",
    narrative: `Expense claim ${claim.number}, ${claim.claimant}`,
    lines: [
      ...lines.map((l) => ({ accountId: l.account_id, debit: BigInt(l.amount_laari), projectId: l.project_id, memo: `${l.description} (${claim.claimant})` })),
      { accountId: owed, credit: total, memo },
    ],
  });
  await client.query("UPDATE expense_claims SET approved_by = $2, approved_at = now(), entry_id = $3 WHERE id = $1", [claimId, userId, entry.id]);
  return { entry, total };
}

async function reject(client, { companyId, userId, claimId, why }) {
  await assumeIdentity(client, { companyId, userId });
  const { claim } = await load(client, { companyId, claimId });
  if (statusOf(claim) !== "submitted") throw new Error("That claim is not waiting for approval.");
  if (!String(why || "").trim()) throw new Error("Say why, so they can put it right.");
  await client.query("UPDATE expense_claims SET rejected_by = $2, rejected_at = now(), rejected_why = $3 WHERE id = $1", [claimId, userId, String(why).trim()]);
}

function show({ claim, lines, receipts = [] }) {
  return {
    id: claim.id, number: claim.number, claimant: claim.claimant, claimantId: claim.claimant_id, note: claim.note,
    status: statusOf(claim), approver: claim.approver, rejectedWhy: claim.rejected_why,
    total: formatLaari(BigInt(claim.total)), paid: formatLaari(BigInt(claim.paid)), owed: formatLaari(BigInt(claim.total) - BigInt(claim.paid)),
    lines: lines.map((l) => ({ on: l.on_text, description: l.description, account: l.account, project: l.project, amount: formatLaari(BigInt(l.amount_laari)) })),
    receipts: receipts.map((r) => ({ id: r.id, name: r.filename })),
  };
}

/** Claims this person may see: their own, and everyone's if they keep the books or approve. */
async function list(client, { companyId, userId, everyone }) {
  const { rows } = await client.query(
    "SELECT id FROM expense_claims WHERE company_id = $1 AND ($2 OR claimant_id = $3) ORDER BY created_at DESC LIMIT 200",
    [companyId, Boolean(everyone), userId]
  );
  const out = [];
  for (const r of rows) out.push(show(await load(client, { companyId, claimId: r.id })));
  return out;
}

module.exports = { OWED_TO_STAFF, create, load, statusOf, approve, reject, show, list };
