/**
 * The team talking about a record.
 *
 * Every record that has a page can carry a conversation: comments, @mentions
 * that tell someone, and asks (a comment one person has to answer). Who hears
 * about it is whoever follows the record: the person who made it, anyone who
 * has written on it, been mentioned or been asked.
 *
 * Seeing the conversation follows seeing the record, with two ways in besides:
 * the person the record belongs to (the site staff who photographed a bill,
 * the claimant) and a guest, someone let in to this one conversation by a
 * person who can open the record. A guest sees the thread and what it is
 * about, never the books behind it.
 */
const ApiError = require("../utils/ApiError");
const push = require("../services/push");
// Loaded when used, like services/push: the middleware brings the pool and its settings with it.
const rolesCan = (roles, action) => require("../middleware/company").rolesCan(roles, action);

const orders = (kind, name) => ({
  name,
  sql: `SELECT number AS label, created_by AS owner FROM orders WHERE id = $1 AND company_id = $2 AND kind = '${kind}'`,
  href: (id) => `/orders/${id}`,
});
const advance = (kind, name) => ({
  name,
  sql: `SELECT number AS label, created_by AS owner FROM advance_requests WHERE id = $1 AND company_id = $2 AND kind = '${kind}'`,
  href: (id) => `/documents/${kind}/${id}`,
});

/** Each kind of record: what it is called, whose it is, where it opens, and what opening it takes. */
const KINDS = {
  invoice: { name: "Invoice", sql: "SELECT invoice_no AS label, raised_by AS owner FROM sales_invoices WHERE id = $1 AND company_id = $2", href: (id) => `/documents/invoice/${id}` },
  credit_note: { name: "Credit note", sql: "SELECT note_no AS label, raised_by AS owner FROM credit_notes WHERE id = $1 AND company_id = $2", href: (id) => `/documents/credit_note/${id}` },
  quote: orders("quote", "Quote"),
  sales_order: orders("sale", "Sales order"),
  purchase_order: orders("purchase", "Purchase order"),
  proforma: advance("proforma", "Proforma"),
  retainer: advance("retainer", "Retainer"),
  bill: {
    name: "Bill",
    sql: `SELECT NULLIF(concat_ws(' ', cp.name, b.bill_no), '') AS label, b.received_by AS owner
            FROM bills b LEFT JOIN counterparties cp ON cp.id = b.counterparty_id WHERE b.id = $1 AND b.company_id = $2`,
    href: (id) => `/bills/${id}`,
  },
  claim: { name: "Claim", sql: "SELECT number AS label, claimant_id AS owner FROM expense_claims WHERE id = $1 AND company_id = $2", href: (id) => `/talk/claim/${id}` },
  bank_line: {
    name: "Bank line",
    sql: `SELECT concat(to_char(posted_on, 'DD Mon YYYY'), ' · ', COALESCE(NULLIF(remark, ''), NULLIF(who, ''), kind)) AS label, imported_by AS owner
            FROM bank_statement_lines WHERE id = $1 AND company_id = $2`,
    href: (id) => `/talk/bank_line/${id}`,
  },
  pay_run: { name: "Payroll", sql: "SELECT period AS label, created_by AS owner FROM pay_runs WHERE id = $1 AND company_id = $2", href: (id) => `/payroll/runs/${id}`, need: "run_payroll" },
  project: { name: "Project", sql: "SELECT name AS label, NULL::uuid AS owner FROM projects WHERE id = $1 AND company_id = $2", href: (id) => `/projects/${id}` },
  contact: { name: "", sql: "SELECT name AS label, NULL::uuid AS owner FROM counterparties WHERE id = $1 AND company_id = $2", href: (id) => `/contacts/${id}` },
  shipment: { name: "Shipment", sql: "SELECT reference AS label, created_by AS owner FROM shipments WHERE id = $1 AND company_id = $2", href: (id) => `/shipments/${id}` },
  // For the auditor's questions: a journal entry, a payment and a receipt, and the audit itself.
  entry: { name: "Entry", sql: "SELECT entry_no::text AS label, posted_by AS owner FROM journal_entries WHERE id = $1 AND company_id = $2", href: (id) => `/talk/entry/${id}` },
  payment: { name: "Payment", sql: "SELECT COALESCE(NULLIF(reference, ''), to_char(paid_on, 'DD Mon YYYY')) AS label, created_by AS owner FROM payment_runs WHERE id = $1 AND company_id = $2", href: (id) => `/talk/payment/${id}` },
  receipt: { name: "Receipt", sql: "SELECT to_char(received_on, 'DD Mon YYYY') AS label, received_by AS owner FROM receipts WHERE id = $1 AND company_id = $2", href: (id) => `/documents/receipt/${id}` },
  audit_period: { name: "Audit", sql: "SELECT name AS label, created_by AS owner FROM audit_periods WHERE id = $1 AND company_id = $2", href: (id) => `/audit/${id}?tab=questions`, need: "read_trail" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The record: its name, owner and page. Refuses a kind or id that is not this company's. */
async function about(client, { companyId, kind, id }) {
  const k = KINDS[kind];
  if (!k || !UUID.test(String(id))) throw ApiError.notFound("There is no such record.");
  const { rows } = await client.query(k.sql, [id, companyId]);
  if (!rows.length) throw ApiError.notFound("There is no such record.");
  const label = rows[0].label || "";
  return { kind, id, label, title: `${k.name} ${label}`.trim(), owner: rows[0].owner, href: k.href(id), need: k.need || "read" };
}

/** Everyone in the company, with their roles. */
async function members(client, companyId) {
  const { rows } = await client.query(
    `SELECT u.id, u.name, u.email, array_agg(m.role::text) AS roles
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = $1 GROUP BY u.id, u.name, u.email ORDER BY u.name`,
    [companyId]
  );
  return rows;
}

const opens = (member, rec) => rolesCan(member.roles, rec.need);

async function guests(client, { companyId, kind, id }) {
  const { rows } = await client.query("SELECT user_id FROM record_followers WHERE company_id = $1 AND kind = $2 AND record_id = $3 AND guest_by IS NOT NULL", [companyId, kind, id]);
  return new Set(rows.map((r) => r.user_id));
}

/**
 * May this person see the conversation, and do they open the record itself?
 * Throws when they may not see it.
 */
async function access(client, req, { kind, id }) {
  const rec = await about(client, { companyId: req.companyId, kind, id });
  const canOpen = req.can(rec.need);
  if (canOpen || rec.owner === req.user.id || (await guests(client, { companyId: req.companyId, kind, id })).has(req.user.id)) return { rec, canOpen };
  throw ApiError.forbidden("This conversation is not open to you.");
}

/** Where a notification about this record takes each person. */
const hrefFor = (rec, member) => (opens(member, rec) ? `${rec.href}${rec.href.includes("?") ? "&" : "?"}talk=1` : `/talk/${rec.kind}/${rec.id}`);

async function thread(client, req, { kind, id }) {
  const { rec, canOpen } = await access(client, req, { kind, id });
  const { rows } = await client.query(
    `SELECT c.id, c.user_id, u.name, c.body, c.mentions, c.asked_of, a.name AS asked_name, c.due_on::text AS due_on,
            c.answered_at, c.done_at, d.name AS done_name, c.edited_at, c.removed_at, r.name AS removed_name, c.created_at
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN users a ON a.id = c.asked_of
       LEFT JOIN users d ON d.id = c.done_by
       LEFT JOIN users r ON r.id = c.removed_by
      WHERE c.company_id = $1 AND c.kind = $2 AND c.record_id = $3 ORDER BY c.created_at`,
    [req.companyId, kind, id]
  );
  const { rows: files } = await client.query(
    `SELECT a.id, a.comment_id, a.filename, a.content_type, a.byte_size FROM attachments a
       JOIN comments c ON c.id = a.comment_id
      WHERE c.company_id = $1 AND c.kind = $2 AND c.record_id = $3 AND a.hidden_at IS NULL ORDER BY a.uploaded_at`,
    [req.companyId, kind, id]
  );
  const everyone = await members(client, req.companyId);
  const nameOf = new Map(everyone.map((m) => [m.id, m.name]));
  const { rows: f } = await client.query("SELECT following FROM record_followers WHERE company_id = $1 AND kind = $2 AND record_id = $3 AND user_id = $4", [req.companyId, kind, id, req.user.id]);
  return {
    record: { kind, id, title: rec.title, href: rec.href, opens: canOpen },
    following: f.length ? f[0].following : false,
    comments: rows.map((c) => ({
      id: c.id,
      by: { id: c.user_id, name: c.name },
      mine: c.user_id === req.user.id,
      // A comment taken down keeps its place and who took it down, not its words.
      body: c.removed_at ? null : c.body,
      mentions: c.removed_at ? [] : c.mentions.map((m) => ({ id: m, name: nameOf.get(m) || "Someone who has left" })),
      ask: c.asked_of ? { of: { id: c.asked_of, name: c.asked_name }, dueOn: c.due_on, answeredAt: c.answered_at, doneAt: c.done_at, doneBy: c.done_name, status: c.done_at ? "done" : c.answered_at ? "answered" : "open" } : null,
      edited: Boolean(c.edited_at),
      removed: c.removed_at ? { at: c.removed_at, by: c.removed_name } : null,
      files: c.removed_at ? [] : files.filter((x) => x.comment_id === c.id).map((x) => ({ id: x.id, filename: x.filename, contentType: x.content_type, size: Number(x.byte_size) })),
      at: c.created_at,
    })),
  };
}

/** Who can be @mentioned here, and whether each can open the record. */
async function people(client, req, { kind, id }) {
  const { rec } = await access(client, req, { kind, id });
  const g = await guests(client, { companyId: req.companyId, kind, id });
  return (await members(client, req.companyId))
    .filter((m) => m.id !== req.user.id)
    .map((m) => ({ id: m.id, name: m.name, email: m.email, sees: opens(m, rec) || m.id === rec.owner || g.has(m.id) }));
}

async function follow(client, { companyId, kind, id, userId, on = true, guestBy = null, force = false }) {
  await client.query(
    `INSERT INTO record_followers (company_id, kind, record_id, user_id, following, guest_by) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id, kind, record_id, user_id) DO UPDATE SET
       following = CASE WHEN $7 THEN EXCLUDED.following ELSE record_followers.following END,
       guest_by = COALESCE(record_followers.guest_by, EXCLUDED.guest_by)`,
    [companyId, kind, id, userId, on, guestBy, force]
  );
}

/**
 * A comment. Mentions and the person asked must be in the company; anyone of
 * them who cannot see the conversation is refused unless the writer, who
 * opens the record, lets them in (letIn): then they are a guest here.
 */
async function post(client, req, { kind, id, body, mentions = [], askOf = null, dueOn = null, letIn = [] }) {
  const { rec, canOpen } = await access(client, req, { kind, id });
  const text = String(body || "").trim();
  if (!text) throw ApiError.badRequest("Write something first.");
  if (text.length > 4000) throw ApiError.badRequest("Keep it under 4,000 characters.");
  const everyone = await members(client, req.companyId);
  const byId = new Map(everyone.map((m) => [m.id, m]));
  const named = [...new Set([...mentions, ...(askOf ? [askOf] : [])])].filter((u) => u !== req.user.id);
  if (named.some((u) => !byId.has(u))) throw ApiError.badRequest("Only people in this company can be mentioned.");
  if (askOf === req.user.id) throw ApiError.badRequest("Ask someone else.");
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw ApiError.badRequest("That due date is not a date.");

  const g = await guests(client, { companyId: req.companyId, kind, id });
  const outside = named.filter((u) => !(opens(byId.get(u), rec) || u === rec.owner || g.has(u)));
  const notLetIn = outside.filter((u) => !letIn.includes(u));
  if (notLetIn.length) {
    throw ApiError.conflict("Some of the people named cannot see this.", { cannotSee: notLetIn.map((u) => ({ id: u, name: byId.get(u).name })), canLetIn: canOpen });
  }
  if (outside.length && !canOpen) throw ApiError.forbidden("Only someone who can open this record can let others into its conversation.");
  for (const u of outside) await follow(client, { companyId: req.companyId, kind, id, userId: u, guestBy: req.user.id });

  const { rows } = await client.query(
    `INSERT INTO comments (company_id, kind, record_id, user_id, body, mentions, asked_of, due_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.companyId, kind, id, req.user.id, text, mentions.filter((u) => u !== req.user.id), askOf, askOf ? dueOn : null]
  );
  const commentId = rows[0].id;

  // Writing on a record where you were asked something answers it.
  const { rows: answered } = await client.query(
    `UPDATE comments SET answered_at = now()
      WHERE company_id = $1 AND kind = $2 AND record_id = $3 AND asked_of = $4 AND answered_at IS NULL AND done_at IS NULL AND id <> $5
      RETURNING user_id`,
    [req.companyId, kind, id, req.user.id, commentId]
  );
  const askers = new Set(answered.map((r) => r.user_id));

  // Who follows: the writer, the record's owner, everyone named. A switch-off stays off.
  await follow(client, { companyId: req.companyId, kind, id, userId: req.user.id });
  if (rec.owner && byId.has(rec.owner)) await follow(client, { companyId: req.companyId, kind, id, userId: rec.owner });
  for (const u of named) await follow(client, { companyId: req.companyId, kind, id, userId: u, force: true });

  const { rows: followers } = await client.query("SELECT user_id FROM record_followers WHERE company_id = $1 AND kind = $2 AND record_id = $3 AND following", [req.companyId, kind, id]);
  const me = req.user.name || byId.get(req.user.id)?.name || "Someone";
  const short = text.length > 140 ? `${text.slice(0, 139)}…` : text;
  const tell = (userIds, notificationKind, title) =>
    Promise.all(
      userIds.map((u) =>
        push.tell(client, { companyId: req.companyId, userIds: [u], kind: notificationKind, title, body: short, href: hrefFor(rec, byId.get(u)), dedupeKey: `comment:${commentId}` })
      )
    );
  const told = new Set([req.user.id]);
  const once = (list) => list.filter((u) => byId.has(u) && !told.has(u) && told.add(u));
  if (askOf) await tell(once([askOf]), "ask", `${me} asked you about ${rec.title}${dueOn ? `, by ${new Date(`${dueOn}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}`);
  await tell(once(mentions), "mention", `${me} mentioned you on ${rec.title}`);
  await tell(once([...askers]), "comment", `${me} answered you on ${rec.title}`);
  await tell(once(followers.map((r) => r.user_id)), "comment", `${me} commented on ${rec.title}`);
  return commentId;
}

async function mine(client, req, commentId) {
  if (!UUID.test(String(commentId))) throw ApiError.notFound("There is no such comment.");
  const { rows } = await client.query("SELECT * FROM comments WHERE id = $1 AND company_id = $2", [commentId, req.companyId]);
  if (!rows.length) throw ApiError.notFound("There is no such comment.");
  await access(client, req, { kind: rows[0].kind, id: rows[0].record_id });
  return rows[0];
}

/** Changing your own words: what it said before is kept. */
async function edit(client, req, commentId, body) {
  const c = await mine(client, req, commentId);
  if (c.user_id !== req.user.id) throw ApiError.forbidden("Only the person who wrote it can change it.");
  if (c.removed_at) throw ApiError.badRequest("It was taken down.");
  const text = String(body || "").trim();
  if (!text || text.length > 4000) throw ApiError.badRequest("Write something, under 4,000 characters.");
  if (text === c.body) return;
  await client.query(
    "UPDATE comments SET body = $3, earlier = earlier || jsonb_build_array(jsonb_build_object('body', body::text, 'until', now())), edited_at = now() WHERE id = $1 AND company_id = $2",
    [commentId, req.companyId, text]
  );
}

/** Taking a comment down: its writer, or whoever runs the company. The line stays. */
async function remove(client, req, commentId) {
  const c = await mine(client, req, commentId);
  if (c.user_id !== req.user.id && !req.can("manage_people")) throw ApiError.forbidden("Only the person who wrote it can take it down.");
  await client.query("UPDATE comments SET removed_at = COALESCE(removed_at, now()), removed_by = COALESCE(removed_by, $3) WHERE id = $1 AND company_id = $2", [commentId, req.companyId, req.user.id]);
}

/** An ask is done (or opened again) by whoever asked it or was asked. */
async function settle(client, req, commentId, done = true) {
  const c = await mine(client, req, commentId);
  if (!c.asked_of) throw ApiError.badRequest("That is a comment, not an ask.");
  if (![c.user_id, c.asked_of].includes(req.user.id)) throw ApiError.forbidden("Only the two people in the ask can close it.");
  await client.query(
    done
      ? "UPDATE comments SET done_at = now(), done_by = $3 WHERE id = $1 AND company_id = $2 AND done_at IS NULL"
      : "UPDATE comments SET done_at = NULL, done_by = NULL, answered_at = NULL WHERE id = $1 AND company_id = $2 AND $3::uuid IS NOT NULL",
    [commentId, req.companyId, req.user.id]
  );
}

/** Asks not yet done: the ones waiting on me, or the ones I am waiting on. */
async function asks(client, req, { view = "waiting" } = {}) {
  const who = view === "asked" ? "c.user_id" : "c.asked_of";
  const { rows } = await client.query(
    `SELECT c.id, c.kind, c.record_id, c.body, c.due_on::text AS due_on, c.answered_at, c.created_at, u.name AS by_name, a.name AS of_name
       FROM comments c JOIN users u ON u.id = c.user_id JOIN users a ON a.id = c.asked_of
      WHERE c.company_id = $1 AND ${who} = $2 AND c.asked_of IS NOT NULL AND c.done_at IS NULL AND c.removed_at IS NULL
      ORDER BY c.due_on NULLS LAST, c.created_at LIMIT 100`,
    [req.companyId, req.user.id]
  );
  const out = [];
  for (const r of rows) {
    let rec;
    try {
      rec = await about(client, { companyId: req.companyId, kind: r.kind, id: r.record_id });
    } catch {
      continue;
    }
    out.push({
      id: r.id,
      title: rec.title,
      href: req.can(rec.need) ? `${rec.href}${rec.href.includes("?") ? "&" : "?"}talk=1` : `/talk/${r.kind}/${r.record_id}`,
      body: r.body,
      by: r.by_name,
      of: r.of_name,
      dueOn: r.due_on,
      status: r.answered_at ? "answered" : "open",
      at: r.created_at,
    });
  }
  return out;
}

module.exports = { KINDS, about, access, thread, people, post, edit, remove, settle, asks, follow, members };
