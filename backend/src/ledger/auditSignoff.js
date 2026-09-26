/**
 * Signing off a period's audit.
 *
 * Before the auditor signs, every part of the work is read for what is left:
 * the seal, materiality, samples not yet seen, questions still open,
 * confirmations not concluded, the count, adjustments still waiting for the
 * company. What would make the sign-off wrong blocks it (an adjustment the
 * company has not decided; a broken seal under a clean opinion); what is
 * merely unfinished needs the auditor to say, in a note, why they sign anyway.
 *
 * Signing re-checks the seal and records the chain's last entry, so the
 * sign-off says which state of the books it covers. After it, a database
 * trigger keeps the period's audit work exactly as it was.
 */
const { assumeIdentity } = require("./post");
const audit = require("./audit");
const questions = require("./auditQuestions");
const adjustments = require("./auditAdjustments");

const OPINIONS = { unmodified: "Unmodified", qualified: "Qualified", adverse: "Adverse", disclaimer: "Disclaimer of opinion" };

async function readiness(client, req, { periodId }) {
  const companyId = req.companyId;
  const p = await audit.period(client, { companyId, periodId });
  const items = [];
  const add = (key, name, state, said) => items.push({ key, name, state, said });

  if (!p.seal) add("seal", "Seal", "warn", "The seal has not been checked.");
  else if (!p.seal.ok) add("seal", "Seal", "block-clean", `The seal is broken: ${p.seal.problems.length} ${p.seal.problems.length === 1 ? "entry does" : "entries do"} not match what was posted.`);
  else add("seal", "Seal", "done", `${p.seal.entries ? `Intact over the period's ${p.seal.entries} entries` : "No entries in the period; the chain around it is intact"}. It is checked again as you sign.`);

  const adj = await adjustments.list(client, { companyId, periodId, auditor: true });
  add("materiality", "Materiality", adj.materiality ? "done" : "warn", adj.materiality ? `Overall MVR ${adj.materiality.overall}.` : "Not set.");

  const items_ = p.samples.reduce((s, x) => s + x.items, 0);
  const seen = p.samples.reduce((s, x) => s + x.seen, 0);
  if (!p.samples.length) add("samples", "Samples", "warn", "None drawn.");
  else add("samples", "Samples", seen === items_ ? "done" : "warn", seen === items_ ? `All ${items_} items seen.` : `${items_ - seen} of ${items_} items not yet seen.`);

  const q = await questions.list(client, req, { periodId });
  const loose = q.counts.open + q.counts.late + q.counts.answered;
  add("questions", "Questions", loose ? "warn" : "done", loose ? `${loose} not closed (${q.counts.late} late, ${q.counts.answered} answered and waiting for you to close).` : q.questions.length ? "All closed." : "None asked.");

  const { rows: conf } = await client.query("SELECT status FROM audit_confirmations WHERE company_id = $1 AND period_id = $2", [companyId, periodId]);
  const open = conf.filter((c) => c.status !== "closed").length;
  add("confirmations", "Confirmations", open ? "warn" : "done", open ? `${open} of ${conf.length} not concluded.` : conf.length ? `All ${conf.length} concluded.` : "None sent.");

  const { rows: obs } = await client.query("SELECT concluded_at FROM audit_observations WHERE company_id = $1 AND period_id = $2", [companyId, periodId]);
  // Stock held at the period's end, not today: a dormant year before stock was kept needs no count.
  const { rows: stock } = await client.query(
    "SELECT COALESCE(SUM(quantity), 0) > 0 AS has FROM stock_moves WHERE company_id = $1 AND moved_on <= (SELECT to_date FROM audit_periods WHERE id = $2)",
    [companyId, periodId]
  );
  if (!obs.length) add("count", "Year-end count", stock[0].has ? "warn" : "done", stock[0].has ? "Stock was held at the period end and no count was attended." : "No stock held at the period end.");
  else add("count", "Year-end count", obs.every((o) => o.concluded_at) ? "done" : "warn", obs.every((o) => o.concluded_at) ? "Attended and concluded." : "Attended; not yet concluded.");

  if (adj.counts.proposed) add("adjustments", "Adjustments", "block", `${adj.counts.proposed} still waiting for the company to decide.`);
  else add("adjustments", "Adjustments", adj.uncorrected.standing === "material" ? "warn" : "done", adj.uncorrected.count ? `Uncorrected: MVR ${adj.uncorrected.profit} on profit${adj.uncorrected.share !== null ? `, ${adj.uncorrected.share}% of materiality` : ""}.` : "Nothing left uncorrected.");

  const { rows: packs } = await client.query("SELECT count(*)::int AS n FROM audit_packs WHERE company_id = $1 AND period_id = $2", [companyId, periodId]);
  add("pack", "Audit pack", packs[0].n ? "done" : "warn", packs[0].n ? `${packs[0].n} made.` : "None made yet (it can still be made after signing).");

  return { signedOff: Boolean(p.signedOff), items };
}

async function signOff(client, req, { periodId, opinion, note }) {
  const companyId = req.companyId;
  const userId = req.user.id;
  await assumeIdentity(client, { companyId, userId });
  if (!OPINIONS[opinion]) throw new Error("Say the opinion.");
  const { rows: p } = await client.query("SELECT signed_off_at FROM audit_periods WHERE id = $1 AND company_id = $2 FOR NO KEY UPDATE", [periodId, companyId]);
  if (!p[0]) throw new Error("No such period under audit here.");
  if (p[0].signed_off_at) throw new Error("This period is signed off already.");
  // The seal as it is now, not as it was last checked.
  const seal = await audit.checkSeal(client, { companyId, userId, periodId });
  const r = await readiness(client, req, { periodId });
  const blocks = r.items.filter((i) => i.state === "block" || (i.state === "block-clean" && opinion === "unmodified"));
  if (blocks.length) throw new Error(`Not yet: ${blocks.map((b) => `${b.name.toLowerCase()}: ${b.said}`).join(" ")}`);
  const loose = r.items.filter((i) => i.state === "warn" || i.state === "block-clean");
  const why = String(note || "").trim();
  if (loose.length && why.length < 10) throw new Error(`Some work is not finished (${loose.map((i) => i.name.toLowerCase()).join(", ")}). Say in a note why you sign anyway.`);
  const { rows: head } = await client.query("SELECT entry_no::text AS no, encode(hash, 'hex') AS hash FROM journal_entries WHERE company_id = $1 ORDER BY entry_no DESC LIMIT 1", [companyId]);
  await client.query(
    `UPDATE audit_periods SET signed_off_by = $3, signed_off_at = now(), opinion = $4, signoff_note = $5, signoff_head = $6::jsonb
      WHERE id = $1 AND company_id = $2`,
    [periodId, companyId, userId, opinion, why.slice(0, 2000) || null, JSON.stringify({ ...(head[0] || {}), sealOk: seal.ok, entries: seal.entries, loose: loose.map((i) => i.key) })]
  );
  return { signedOff: true, head: head[0] || null };
}

module.exports = { readiness, signOff, OPINIONS };
