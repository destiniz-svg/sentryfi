/**
 * Proposed audit adjustments and materiality (ISA 450).
 *
 * The auditor proposes a correcting entry with its class (factual,
 * judgemental or projected) and reason. Nothing posts until someone in the
 * company who may adjust the books decides, and never the one who proposed
 * it: accepted, it is posted into the audited period, named and dated;
 * passed, it is left unbooked as too small to matter; rejected, the company
 * disagrees. The auditor may withdraw one after an explanation. Nothing is
 * ever deleted: what stays unbooked (passed and rejected) is summed into the
 * summary of uncorrected misstatements and set against materiality.
 */
const { formatLaari, toLaari } = require("./money");
const { assumeIdentity } = require("./post");
const periods = require("./periods");
const push = require("../services/push");
const { rolesCan } = require("../middleware/company");

const CLASSES = { factual: "Factual", judgemental: "Judgemental", projected: "Projected" };
const f = (laari) => formatLaari(BigInt(laari));
const abs = (x) => (x < 0n ? -x : x);

async function periodRow(client, companyId, periodId, lock = false) {
  const { rows } = await client.query(`SELECT *, from_date::text AS from_text, to_date::text AS to_text FROM audit_periods WHERE id = $1 AND company_id = $2${lock ? " FOR UPDATE" : ""}`, [periodId, companyId]);
  if (!rows[0]) throw new Error("No such period under audit here.");
  return rows[0];
}

/** Materiality for the period: overall, performance (75% unless said), and clearly trivial (5% unless said). */
async function setMateriality(client, { companyId, userId, periodId, materiality, performance, trivial }) {
  await assumeIdentity(client, { companyId, userId });
  await periodRow(client, companyId, periodId);
  const m = toLaari(String(materiality ?? "").replace(/,/g, "") || "0");
  if (m <= 0n) throw new Error("Say overall materiality for the financial statements.");
  const pm = performance ? toLaari(String(performance).replace(/,/g, "")) : (m * 75n) / 100n;
  const t = trivial ? toLaari(String(trivial).replace(/,/g, "")) : (m * 5n) / 100n;
  if (pm <= 0n || pm > m) throw new Error("Performance materiality is above nothing and no more than overall materiality.");
  if (t < 0n || t >= pm) throw new Error("The clearly trivial amount is below performance materiality.");
  await client.query("UPDATE audit_periods SET materiality_laari = $3, performance_laari = $4, trivial_laari = $5 WHERE id = $1 AND company_id = $2", [periodId, companyId, m.toString(), pm.toString(), t.toString()]);
  return { materiality: f(m), performance: f(pm), trivial: f(t) };
}

/** Checks and normalises proposed lines: this company's accounts, one side each, balanced. */
async function checkLines(client, companyId, lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("An adjustment has at least two lines.");
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const { rows } = await client.query("SELECT id, code, name, type::text AS type FROM accounts WHERE company_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL", [companyId, ids]);
  const known = new Map(rows.map((a) => [a.id, a]));
  let d = 0n;
  let c = 0n;
  const out = lines.map((l) => {
    if (!known.has(l.accountId)) throw new Error("Each line needs an account of this company.");
    const debit = toLaari(String(l.debit || "0").replace(/,/g, "") || "0");
    const credit = toLaari(String(l.credit || "0").replace(/,/g, "") || "0");
    if (debit < 0n || credit < 0n || (debit > 0n) === (credit > 0n)) throw new Error("Each line is a debit or a credit, above nothing.");
    d += debit;
    c += credit;
    return { accountId: l.accountId, debit: debit.toString(), credit: credit.toString(), memo: String(l.memo || "").trim().slice(0, 200) || null };
  });
  if (d !== c) throw new Error(`The adjustment does not balance: debits MVR ${f(d)}, credits MVR ${f(c)}.`);
  return out;
}

/** Whoever may decide: in the company, able to adjust the books, not the proposer. */
async function deciders(client, companyId, not) {
  const { rows } = await client.query("SELECT user_id, array_agg(role::text) AS roles FROM memberships WHERE company_id = $1 GROUP BY user_id", [companyId]);
  return rows.filter((r) => r.user_id !== not && rolesCan(r.roles, "adjust")).map((r) => r.user_id);
}

async function propose(client, { companyId, userId, periodId, klass, reason, lines }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await periodRow(client, companyId, periodId, true);
  if (!CLASSES[klass]) throw new Error("Say whether it is factual, judgemental or projected.");
  const why = String(reason || "").trim();
  if (why.length < 3) throw new Error("Say why the books need this, so the company can decide.");
  const checked = await checkLines(client, companyId, lines);
  const { rows: n } = await client.query("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM audit_adjustments WHERE period_id = $1", [periodId]);
  const { rows } = await client.query(
    "INSERT INTO audit_adjustments (company_id, period_id, number, class, reason, lines, proposed_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id, number",
    [companyId, periodId, n[0].next, klass, why.slice(0, 1000), JSON.stringify(checked), userId]
  );
  const total = checked.reduce((s, l) => s + BigInt(l.debit), 0n);
  await push.tell(client, {
    companyId, userIds: await deciders(client, companyId, userId), kind: "ask",
    title: `The auditor proposes adjustment AJ-${rows[0].number}, MVR ${f(total)}`,
    body: `${CLASSES[klass]}: ${why.slice(0, 120)}`, href: `/audit/${p.id}?tab=adjustments`, dedupeKey: `audit-aj:${rows[0].id}`,
  });
  return { id: rows[0].id, number: rows[0].number };
}

async function adjustmentRow(client, companyId, id) {
  const { rows } = await client.query("SELECT a.*, p.to_date::text AS period_to FROM audit_adjustments a JOIN audit_periods p ON p.id = a.period_id WHERE a.id = $1 AND a.company_id = $2 FOR UPDATE OF a", [id, companyId]);
  if (!rows[0]) throw new Error("No such adjustment here.");
  return rows[0];
}

/**
 * The company's decision. Accepted: posted, into the audited period by
 * default (a closed month takes it, with the adjustment as the reason).
 * Passed or rejected: kept unbooked, with the reason.
 */
async function decide(client, { companyId, userId, id, how, note, date }) {
  await assumeIdentity(client, { companyId, userId });
  const a = await adjustmentRow(client, companyId, id);
  if (a.status !== "proposed") throw new Error(`AJ-${a.number} was ${a.status} already.`);
  if (a.proposed_by === userId) throw new Error("Someone other than the one who proposed it decides it.");
  const why = String(note || "").trim();
  const { rows: me } = await client.query("SELECT name FROM users WHERE id = $1", [userId]);
  if (how === "accept") {
    const now = require("./today").today();
    const on = date || (a.period_to < now ? a.period_to : now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error("What date does it go in on?");
    const { entry } = await periods.adjust(client, {
      companyId, userId, date: on,
      narrative: `Audit adjustment AJ-${a.number} (${a.class}): ${a.reason}`.slice(0, 480),
      reason: `Audit adjustment AJ-${a.number}, accepted by ${me[0]?.name || "the company"}${why ? `: ${why}` : ""}`,
      lines: a.lines.map((l) => ({ accountId: l.accountId, debit: BigInt(l.debit), credit: BigInt(l.credit), memo: l.memo })),
    });
    await client.query("UPDATE audit_adjustments SET status = 'accepted', decided_by = $3, decided_at = now(), decision_note = $4, entry_id = $5 WHERE id = $1 AND company_id = $2", [id, companyId, userId, why || null, entry.id]);
    return { status: "accepted", entryNo: String(entry.entryNo) };
  }
  if (how !== "pass" && how !== "reject") throw new Error("Accept it, pass it, or reject it.");
  if (why.length < 3) throw new Error(how === "pass" ? "Say why it is left unbooked." : "Say why the company disagrees.");
  await client.query("UPDATE audit_adjustments SET status = $3, decided_by = $4, decided_at = now(), decision_note = $5 WHERE id = $1 AND company_id = $2", [id, companyId, how === "pass" ? "passed" : "rejected", userId, why.slice(0, 1000)]);
  return { status: how === "pass" ? "passed" : "rejected" };
}

/** The auditor takes a proposal back, after an explanation. Kept, marked withdrawn. */
async function withdraw(client, { companyId, userId, id, note }) {
  await assumeIdentity(client, { companyId, userId });
  const a = await adjustmentRow(client, companyId, id);
  if (a.status !== "proposed") throw new Error(`AJ-${a.number} was ${a.status} already.`);
  const why = String(note || "").trim();
  if (why.length < 3) throw new Error("Say why it is withdrawn.");
  await client.query("UPDATE audit_adjustments SET status = 'withdrawn', decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1 AND company_id = $2", [id, companyId, userId, why.slice(0, 1000)]);
  return { status: "withdrawn" };
}

/**
 * The period's adjustments, each with its effect on profit and on net
 * assets, and the summary of what stays uncorrected against materiality.
 *
 * Materiality is the auditor's own judgement and stays with the auditor: to
 * anyone else (`auditor` false) the thresholds, the standing against them and
 * which items are clearly trivial are left out, so nobody in the company can
 * keep an error just below them.
 */
async function list(client, { companyId, periodId, auditor = false }) {
  const p = await periodRow(client, companyId, periodId);
  const { rows } = await client.query(
    `SELECT a.*, pu.name AS proposed_name, du.name AS decided_name, e.entry_no::text AS entry_no
       FROM audit_adjustments a JOIN users pu ON pu.id = a.proposed_by LEFT JOIN users du ON du.id = a.decided_by LEFT JOIN journal_entries e ON e.id = a.entry_id
      WHERE a.company_id = $1 AND a.period_id = $2 ORDER BY a.number`,
    [companyId, periodId]
  );
  const ids = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.accountId)))];
  const { rows: accts } = ids.length ? await client.query("SELECT id, code, name, type::text AS type FROM accounts WHERE id = ANY($1::uuid[])", [ids]) : { rows: [] };
  const acct = new Map(accts.map((a) => [a.id, a]));
  const trivial = p.trivial_laari === null ? null : BigInt(p.trivial_laari);
  const items = rows.map((r) => {
    let profit = 0n;
    let assets = 0n;
    for (const l of r.lines) {
      const t = acct.get(l.accountId)?.type;
      const d = BigInt(l.debit) - BigInt(l.credit);
      if (t === "income" || t === "expense") profit -= d;
      else if (t === "asset" || t === "liability") assets += d;
    }
    const size = r.lines.reduce((s, l) => s + BigInt(l.debit), 0n);
    return {
      id: r.id, number: r.number, ref: `AJ-${r.number}`, class: r.class, className: CLASSES[r.class], reason: r.reason, status: r.status,
      lines: r.lines.map((l) => ({ account: acct.get(l.accountId) ? `${acct.get(l.accountId).code} ${acct.get(l.accountId).name}` : "An account", debit: f(l.debit), credit: f(l.credit), memo: l.memo })),
      amount: f(size), profitEffect: f(profit), assetsEffect: f(assets), profitLaari: profit, assetsLaari: assets,
      trivial: auditor && trivial !== null && abs(profit) <= trivial && abs(assets) <= trivial,
      proposedBy: r.proposed_name, proposedById: r.proposed_by, proposedAt: r.proposed_at, decidedBy: r.decided_name, decidedAt: r.decided_at, note: r.decision_note, entryNo: r.entry_no,
    };
  });
  const open = items.filter((i) => i.status === "passed" || i.status === "rejected");
  const profit = open.reduce((s, i) => s + i.profitLaari, 0n);
  const assets = open.reduce((s, i) => s + i.assetsLaari, 0n);
  const m = p.materiality_laari === null ? null : BigInt(p.materiality_laari);
  const pm = p.performance_laari === null ? null : BigInt(p.performance_laari);
  const worst = abs(profit) > abs(assets) ? abs(profit) : abs(assets);
  const standing = m === null ? "unset" : worst >= m ? "material" : worst >= pm ? "near" : "below";
  const byClass = Object.fromEntries(Object.keys(CLASSES).map((k) => [k, f(open.filter((i) => i.class === k).reduce((s, i) => s + i.profitLaari, 0n))]));
  return {
    seesMateriality: auditor,
    materiality: !auditor || m === null ? null : { overall: f(m), performance: f(pm), trivial: f(p.trivial_laari) },
    adjustments: items.map(({ profitLaari, assetsLaari, ...rest }) => rest),
    uncorrected: {
      count: open.length, profit: f(profit), assets: f(assets), byClass,
      standing: auditor ? standing : null,
      share: !auditor || m === null || m === 0n ? null : Number((worst * 1000n) / m) / 10,
    },
    counts: Object.fromEntries(["proposed", "accepted", "passed", "rejected", "withdrawn"].map((s) => [s, items.filter((i) => i.status === s).length])),
  };
}

module.exports = { setMateriality, propose, decide, withdraw, list, CLASSES };
