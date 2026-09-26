/**
 * The auditor's questions to the company: each one an ask on a record's own
 * conversation (a bill, an entry, the audit itself for a general request),
 * so the answer, and any papers with it, sit with the record for good. The
 * workspace keeps which asks belong to which period, and reads their state
 * from the conversation: open, answered, closed, and late past their date.
 */
const comments = require("./comments");
const { today } = require("./today");

// A sampled item's kind is the kind of record its question is pinned to.
const RECORD = { bill: "bill", invoice: "invoice", entry: "entry", payment: "payment", receipt: "receipt", credit_note: "credit_note", claim: "claim" };

/** Asks the company something, on a record or on the period itself. */
async function ask(client, req, { periodId, kind, recordId, body, askOf, dueOn }) {
  const { rows } = await client.query("SELECT id FROM audit_periods WHERE id = $1 AND company_id = $2", [periodId, req.companyId]);
  if (!rows[0]) throw new Error("No such period under audit here.");
  const k = kind === "audit_period" ? "audit_period" : RECORD[kind];
  if (!k) throw new Error("Ask about a document, an entry, or the audit as a whole.");
  const id = k === "audit_period" ? periodId : recordId;
  if (!askOf) throw new Error("Say who in the company should answer.");
  if (!String(body || "").trim()) throw new Error("Write the question.");
  const commentId = await comments.post(client, req, { kind: k, id, body, askOf, dueOn: dueOn || null });
  await client.query(
    "INSERT INTO audit_questions (company_id, period_id, comment_id, kind, record_id, created_by) VALUES ($1,$2,$3,$4,$5,$6)",
    [req.companyId, periodId, commentId, k, id, req.user.id]
  );
  return { id: commentId };
}

/** The period's questions with their state, the latest reply, and what came with it. */
async function list(client, req, { periodId }) {
  const { rows } = await client.query(
    `SELECT q.kind, q.record_id, c.id, c.body, c.due_on::text AS due_on, c.answered_at, c.done_at, c.created_at, c.removed_at,
            u.name AS by_name, a.name AS of_name, d.name AS done_name,
            (SELECT COUNT(*)::int FROM comments r WHERE r.company_id = c.company_id AND r.kind = c.kind AND r.record_id = c.record_id AND r.created_at >= c.created_at AND r.id <> c.id AND r.removed_at IS NULL) AS replies,
            (SELECT json_build_object('body', r.body, 'by', ru.name, 'at', r.created_at) FROM comments r JOIN users ru ON ru.id = r.user_id
              WHERE r.company_id = c.company_id AND r.kind = c.kind AND r.record_id = c.record_id AND r.created_at >= c.created_at AND r.id <> c.id AND r.removed_at IS NULL
              ORDER BY r.created_at DESC LIMIT 1) AS latest,
            (SELECT COUNT(*)::int FROM attachments f JOIN comments r ON r.id = f.comment_id
              WHERE r.company_id = c.company_id AND r.kind = c.kind AND r.record_id = c.record_id AND r.created_at >= c.created_at AND r.id <> c.id AND r.removed_at IS NULL) AS files
       FROM audit_questions q JOIN comments c ON c.id = q.comment_id
       JOIN users u ON u.id = c.user_id LEFT JOIN users a ON a.id = c.asked_of LEFT JOIN users d ON d.id = c.done_by
      WHERE q.company_id = $1 AND q.period_id = $2
      ORDER BY c.done_at NULLS FIRST, c.due_on NULLS LAST, c.created_at`,
    [req.companyId, periodId]
  );
  const now = today();
  const out = [];
  for (const r of rows) {
    let rec;
    try {
      rec = await comments.about(client, { companyId: req.companyId, kind: r.kind, id: r.record_id });
    } catch {
      rec = { title: "A record no longer here", href: null };
    }
    const status = r.removed_at ? "withdrawn" : r.done_at ? "closed" : r.answered_at ? "answered" : r.due_on && r.due_on < now ? "late" : "open";
    out.push({
      id: r.id, kind: r.kind, recordId: r.record_id, about: r.kind === "audit_period" ? "The audit as a whole" : rec.title, href: rec.href,
      body: r.body, by: r.by_name, of: r.of_name, dueOn: r.due_on, at: r.created_at, status,
      replies: r.replies, files: r.files, latest: r.latest, closedBy: r.done_name,
    });
  }
  const count = (s) => out.filter((q) => q.status === s).length;
  return { questions: out, counts: { open: count("open"), late: count("late"), answered: count("answered"), closed: count("closed") } };
}

module.exports = { ask, list, RECORD };
