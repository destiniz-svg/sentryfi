/**
 * External confirmations (ISA 505): a customer or supplier confirms, straight
 * to the auditor, what they owe the company or are owed at the period end.
 *
 * The auditor keeps control throughout. The auditor chooses whom to ask,
 * checks the address independently of the company's records, and sends; the
 * company only authorises the request (or refuses, with its reason, which the
 * auditor must weigh). The request goes by a private link kept only as a
 * hash, outside the company's walls; the reply is written where only someone
 * holding the Auditor role can read it (a database policy, not a screen), and
 * a trigger keeps it exactly as it came.
 */
const crypto = require("crypto");
const { pool } = require("../config/db");
const { formatLaari, toLaari } = require("./money");
const { assumeIdentity } = require("./post");
const push = require("../services/push");

const AR = "1300";
const AP = "2100";
const LINK_DAYS = 60;
const f = (laari) => formatLaari(BigInt(laari));
const hash = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");
const abs = (x) => (x < 0n ? -x : x);

async function periodRow(client, companyId, periodId) {
  const { rows } = await client.query("SELECT *, from_date::text AS from_text, to_date::text AS to_text FROM audit_periods WHERE id = $1 AND company_id = $2", [periodId, companyId]);
  if (!rows[0]) throw new Error("No such period under audit here.");
  return rows[0];
}

/** Each party's balance on the day, and what went through their account in the period, from the ledger. */
async function ledgerFor(client, { companyId, from, to }) {
  const { rows } = await client.query(
    `SELECT COALESCE(cp.merged_into, cp.id) AS id,
            SUM(CASE WHEN a.code = $2 AND e.entry_date <= $5 THEN l.debit_laari - l.credit_laari ELSE 0 END) AS receivable,
            SUM(CASE WHEN a.code = $3 AND e.entry_date <= $5 THEN l.credit_laari - l.debit_laari ELSE 0 END) AS payable,
            SUM(CASE WHEN a.code = $2 AND e.entry_date BETWEEN $4 AND $5 THEN l.debit_laari ELSE 0 END) AS billed,
            SUM(CASE WHEN a.code = $3 AND e.entry_date BETWEEN $4 AND $5 THEN l.credit_laari ELSE 0 END) AS bought
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
       JOIN counterparties cp ON cp.id = l.counterparty_id
      WHERE l.company_id = $1 AND l.counterparty_id IS NOT NULL AND a.code IN ($2, $3)
      GROUP BY COALESCE(cp.merged_into, cp.id)`,
    [companyId, AR, AP, from, to]
  );
  return new Map(rows.map((r) => [r.id, { receivable: BigInt(r.receivable), payable: BigInt(r.payable), billed: BigInt(r.billed), bought: BigInt(r.bought) }]));
}

/**
 * Whom to confirm, and why: the largest balances; balances on the wrong side;
 * large suppliers showing nothing owed (payables are confirmed for
 * completeness, not only for what is shown); new parties with a balance.
 */
async function suggest(client, { companyId, periodId }) {
  const p = await periodRow(client, companyId, periodId);
  const money = await ledgerFor(client, { companyId, from: p.from_text, to: p.to_text });
  const { rows: parties } = await client.query("SELECT id, name, email, created_at::date::text AS since FROM counterparties WHERE company_id = $1 AND merged_into IS NULL", [companyId]);
  const { rows: done } = await client.query("SELECT counterparty_id, side FROM audit_confirmations WHERE period_id = $1", [periodId]);
  const asked = new Set(done.map((d) => `${d.counterparty_id}:${d.side}`));
  const out = [];
  const top = (side) => new Set([...money].filter(([, m]) => m[side] > 0n).sort((a, b) => (b[1][side] > a[1][side] ? 1 : -1)).slice(0, 10).map(([id]) => id));
  const bigAR = top("receivable");
  const bigAP = top("payable");
  const busy = new Set([...money].sort((a, b) => (b[1].bought > a[1].bought ? 1 : -1)).slice(0, 10).filter(([, m]) => m.bought > 0n).map(([id]) => id));
  for (const party of parties) {
    const m = money.get(party.id);
    if (!m) continue;
    for (const side of ["receivable", "payable"]) {
      if (asked.has(`${party.id}:${side}`)) continue;
      const bal = m[side];
      const why = [];
      if ((side === "receivable" ? bigAR : bigAP).has(party.id)) why.push("Among the ten largest balances");
      if (bal < 0n) why.push(side === "receivable" ? "A customer we owe: paid more than billed" : "A supplier who owes us: paid more than billed");
      if (side === "payable" && busy.has(party.id) && abs(bal) < 100n * 100n) why.push(`A large supplier (MVR ${f(m.bought)} this period) showing nothing owed`);
      if (bal > 0n && party.since >= p.from_text) why.push("New this period");
      if (!why.length) continue;
      out.push({ counterpartyId: party.id, name: party.name, side, book: f(bal), bookLaari: bal, email: party.email, why, weight: why.length * 10 + Number(abs(bal) / 100000n) });
    }
  }
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, 40).map(({ bookLaari, weight, ...r }) => r);
}

/** Adds parties to confirm, as drafts, with their balance in the books at the period end. */
async function create(client, { companyId, userId, periodId, items }) {
  await assumeIdentity(client, { companyId, userId });
  const p = await periodRow(client, companyId, periodId);
  const money = await ledgerFor(client, { companyId, from: p.from_text, to: p.to_text });
  let made = 0;
  for (const it of items || []) {
    if (!["receivable", "payable"].includes(it.side)) throw new Error("Confirm what a customer owes, or what a supplier is owed.");
    const { rows } = await client.query("SELECT id, email FROM counterparties WHERE id = $1 AND company_id = $2", [it.counterpartyId, companyId]);
    if (!rows[0]) throw new Error("That customer or supplier is not in these books.");
    const bal = money.get(rows[0].id)?.[it.side] || 0n;
    const { rowCount } = await client.query(
      `INSERT INTO audit_confirmations (company_id, period_id, counterparty_id, side, form, book_laari, email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (period_id, counterparty_id, side) DO NOTHING`,
      [companyId, periodId, rows[0].id, it.side, it.form === "balance" ? "balance" : "blank", bal.toString(), rows[0].email || null, userId]
    );
    made += rowCount;
  }
  if (made) {
    const { rows: approvers } = await client.query("SELECT DISTINCT user_id FROM memberships WHERE company_id = $1 AND role IN ('administrator','accountant')", [companyId]);
    await push.tell(client, {
      companyId, userIds: approvers.map((r) => r.user_id), kind: "ask",
      title: `Your auditor asks to confirm ${made === 1 ? "a balance" : `${made} balances`} with customers and suppliers`,
      body: "Authorise the requests; the replies go to the auditor.", href: `/audit/${periodId}?tab=confirmations`, dedupeKey: `audit-conf:${periodId}:${Date.now()}`,
    });
  }
  return { made };
}

/** The auditor's settings on a request before it is sent: the address (checked independently) and the form. */
async function update(client, { companyId, userId, id, email, emailChecked, emailCheckNote, form }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query("SELECT status FROM audit_confirmations WHERE id = $1 AND company_id = $2 FOR NO KEY UPDATE", [id, companyId]);
  if (!rows[0]) throw new Error("No such confirmation here.");
  if (!["draft", "authorised", "refused"].includes(rows[0].status)) throw new Error("It has been sent; send a new request instead of changing this one.");
  const address = email === undefined ? undefined : String(email || "").trim().toLowerCase();
  if (address && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error("That is not an email address.");
  if (emailChecked && String(emailCheckNote || "").trim().length < 3) throw new Error("Say how the address was checked: their letterhead, website, or a call to a number found independently.");
  await client.query(
    `UPDATE audit_confirmations SET
        email = COALESCE($3, email),
        email_checked = CASE WHEN $3 IS NOT NULL AND $3 IS DISTINCT FROM email THEN COALESCE($4, false) ELSE COALESCE($4, email_checked) END,
        email_check_note = CASE WHEN $4 IS TRUE THEN $5 WHEN $4 IS FALSE THEN NULL ELSE email_check_note END,
        form = COALESCE($6, form)
      WHERE id = $1 AND company_id = $2`,
    [id, companyId, address || null, emailChecked === undefined ? null : Boolean(emailChecked), String(emailCheckNote || "").trim().slice(0, 300) || null, form === "balance" || form === "blank" ? form : null]
  );
  return { ok: true };
}

/** The company authorises its auditor to ask (or refuses, with the reason the auditor must weigh). */
async function authorise(client, { companyId, userId, ids, allow, reason }) {
  await assumeIdentity(client, { companyId, userId });
  const why = String(reason || "").trim();
  if (!allow && why.length < 3) throw new Error("Say why the auditor may not ask; they must weigh it.");
  const { rowCount } = await client.query(
    `UPDATE audit_confirmations SET status = $3, authorised_by = $4, authorised_at = now(), refused_reason = $5
      WHERE company_id = $1 AND id = ANY($2::uuid[]) AND status IN ('draft','refused','authorised')`,
    [companyId, ids, allow ? "authorised" : "refused", userId, allow ? null : why.slice(0, 500)]
  );
  return { changed: rowCount };
}

/**
 * Sends the request (or a reminder) by email from the auditor, with a new
 * private link; any earlier link stops working. Returns the link to the
 * auditor only when no email could be sent, so they can send it themselves.
 */
async function send(client, { companyId, userId, id, publicUrl, mail }) {
  await assumeIdentity(client, { companyId, userId });
  const { rows } = await client.query(
    `SELECT c.*, cp.name AS party, co.name AS company, p.to_date::text AS as_at, u.name AS auditor, u.email AS auditor_email
       FROM audit_confirmations c JOIN counterparties cp ON cp.id = c.counterparty_id JOIN companies co ON co.id = c.company_id
       JOIN audit_periods p ON p.id = c.period_id JOIN users u ON u.id = $3
      WHERE c.id = $1 AND c.company_id = $2 FOR NO KEY UPDATE OF c`,
    [id, companyId, userId]
  );
  const c = rows[0];
  if (!c) throw new Error("No such confirmation here.");
  if (!["authorised", "sent"].includes(c.status)) throw new Error(c.status === "refused" ? "The company refused this one: weigh its reason, and use other procedures." : c.status === "replied" || c.status === "closed" ? "They have replied already." : "The company has not authorised it yet.");
  if (!c.email) throw new Error("Give the address to send it to.");
  if (!c.email_checked) throw new Error("Check the address independently of the company's records first, and say how.");
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query("UPDATE audit_confirmation_links SET expires_at = now() WHERE confirmation_id = $1 AND used_at IS NULL AND expires_at > now()", [id]);
  await pool.query(
    "INSERT INTO audit_confirmation_links (confirmation_id, company_id, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4))",
    [id, companyId, hash(token), LINK_DAYS]
  );
  const url = `${publicUrl}/confirm/${token}`;
  const reminder = c.status === "sent";
  const owe = c.side === "receivable" ? `you owed ${c.company}` : `${c.company} owed you`;
  const emailed = await mail({
    to: c.email,
    subject: `${reminder ? "Reminder: " : ""}Balance confirmation for the audit of ${c.company}`,
    lines: [
      `Dear ${c.party},`,
      `${c.auditor} is auditing the accounts of ${c.company} and asks you to confirm, directly to the auditor, what ${owe} on ${new Date(`${c.as_at}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`,
      c.form === "blank" ? "Please give the balance from your own records." : `Their records show MVR ${f(c.book_laari)}. Please say whether this agrees with yours.`,
      `Your reply goes only to the auditor. ${c.company} has authorised this request and does not see your answer.`,
      `The link below is private to you and works for ${LINK_DAYS} days.`,
    ],
    link: { url, label: "Confirm the balance" },
    replyTo: c.auditor_email,
  });
  await client.query("UPDATE audit_confirmations SET status = 'sent', sent_by = $3, sent_at = now(), requests = requests + 1 WHERE id = $1 AND company_id = $2", [id, companyId, userId]);
  return { emailed, reminder, link: emailed ? null : url };
}

// ------------------------------------------------------------------ the public side

async function byToken(token) {
  const { rows } = await pool.query(
    "SELECT id, confirmation_id, company_id, expires_at, used_at FROM audit_confirmation_links WHERE token_hash = $1",
    [hash(token)]
  );
  const link = rows[0];
  if (!link || new Date(link.expires_at) < new Date()) throw Object.assign(new Error("This link has expired or is not complete. Ask the auditor for a new one."), { status: 404 });
  return link;
}

/** Someone in the company holding the Auditor role, to act as when the reply is written. */
async function anAuditor(companyId, prefer) {
  const { rows } = await pool.query("SELECT user_id FROM memberships WHERE company_id = $1 AND role = 'auditor' AND (access_until IS NULL OR access_until > now()) ORDER BY (user_id = $2) DESC LIMIT 1", [companyId, prefer]);
  if (!rows[0]) throw Object.assign(new Error("The auditor no longer has access to these books, so the reply cannot be taken. Contact the auditor."), { status: 409 });
  return rows[0].user_id;
}

/** What the counterparty sees: who asks, about what, as at when. The company's figure only on a "balance" form. */
async function view({ token, asCompany }) {
  const link = await byToken(token);
  const { rows: c0 } = await pool.query("SELECT created_by FROM audit_confirmation_links l JOIN audit_confirmations c ON c.id = l.confirmation_id WHERE l.id = $1", [link.id]).catch(() => ({ rows: [] }));
  const auditorId = await anAuditor(link.company_id, c0[0]?.created_by || null);
  if (!link.used_at) await pool.query("UPDATE audit_confirmation_links SET opened_at = COALESCE(opened_at, now()) WHERE id = $1", [link.id]);
  return asCompany({ companyId: link.company_id, user: { id: auditorId } }, async (client) => {
    const { rows } = await client.query(
      `SELECT c.side, c.form, c.book_laari, cp.name AS party, co.name AS company, p.to_date::text AS as_at, u.name AS auditor
         FROM audit_confirmations c JOIN counterparties cp ON cp.id = c.counterparty_id JOIN companies co ON co.id = c.company_id
         JOIN audit_periods p ON p.id = c.period_id JOIN users u ON u.id = c.sent_by
        WHERE c.id = $1`,
      [link.confirmation_id]
    );
    const c = rows[0];
    return {
      company: c.company, party: c.party, side: c.side, form: c.form, asAt: c.as_at, auditor: c.auditor,
      theirs: c.form === "balance" ? f(c.book_laari) : null,
      answered: Boolean(link.used_at),
    };
  });
}

/** The reply, written once, where only the auditor reads it. */
async function reply({ token, asCompany, body, ip, userAgent }) {
  const link = await byToken(token);
  if (link.used_at) throw Object.assign(new Error("A reply has been given on this link already. Thank you."), { status: 409 });
  const name = String(body.name || "").trim();
  if (name.length < 2) throw new Error("Say who is replying.");
  const form = body.agrees === undefined || body.agrees === null ? "blank" : "balance";
  let their = null;
  if (body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== "") their = toLaari(String(body.amount).replace(/,/g, ""));
  if (form === "blank" && their === null) throw new Error("Give the balance from your records.");
  if (body.agrees === false && their === null) throw new Error("Give the balance from your records, so the difference can be traced.");
  let file = null;
  if (body.file) {
    const m = /^data:([\w/.+-]+);base64,(.+)$/.exec(String(body.file));
    if (!m || !/^(application\/pdf|image\/(png|jpeg|webp))$/.test(m[1])) throw new Error("Attach a PDF or a photo.");
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Attach a file under 5 MB.");
    file = { type: m[1], bytes, name: String(body.fileName || "statement").replace(/[^\w.\- ]/g, "_").slice(0, 120) };
  }
  const { rows: c0 } = await pool.query("SELECT c.created_by, c.period_id FROM audit_confirmations c WHERE c.id = $1", [link.confirmation_id]);
  const auditorId = await anAuditor(link.company_id, c0[0]?.created_by || null);
  // Taken once: the link is spent before the reply is written, so two sends cannot both land.
  const { rowCount } = await pool.query("UPDATE audit_confirmation_links SET used_at = now() WHERE id = $1 AND used_at IS NULL", [link.id]);
  if (!rowCount) throw Object.assign(new Error("A reply has been given on this link already. Thank you."), { status: 409 });
  try {
    await asCompany({ companyId: link.company_id, user: { id: auditorId } }, async (client) => {
      await client.query(
        `INSERT INTO audit_confirmation_replies (company_id, confirmation_id, agrees, their_laari, note, responder_name, responder_role, file_name, file_type, file_bytes, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [link.company_id, link.confirmation_id, form === "balance" ? Boolean(body.agrees) : null, their === null ? null : their.toString(), String(body.note || "").trim().slice(0, 2000) || null,
          name.slice(0, 120), String(body.role || "").trim().slice(0, 120) || null, file?.name || null, file?.type || null, file?.bytes || null, String(ip || "").slice(0, 64), String(userAgent || "").slice(0, 300)]
      );
      await client.query("UPDATE audit_confirmations SET status = 'replied' WHERE id = $1", [link.confirmation_id]);
      const { rows: auditors } = await client.query("SELECT user_id FROM memberships WHERE company_id = $1 AND role = 'auditor' AND (access_until IS NULL OR access_until > now())", [link.company_id]);
      const { rows: party } = await client.query("SELECT cp.name FROM audit_confirmations c JOIN counterparties cp ON cp.id = c.counterparty_id WHERE c.id = $1", [link.confirmation_id]);
      await push.tell(client, {
        companyId: link.company_id, userIds: auditors.map((a) => a.user_id), kind: "done",
        title: `${party[0]?.name || "A party"} replied to your confirmation`, body: "Only you can read the reply.",
        href: `/audit/${c0[0].period_id}?tab=confirmations`, dedupeKey: `audit-conf-reply:${link.confirmation_id}`,
      });
    });
  } catch (err) {
    await pool.query("UPDATE audit_confirmation_links SET used_at = NULL WHERE id = $1", [link.id]);
    throw err;
  }
  return { received: true };
}

// ------------------------------------------------------------------ reading and concluding

/**
 * The period's confirmations. The reply columns come through only for
 * someone holding the Auditor role: the database policy returns nothing to
 * anyone else, whatever the screen asks for.
 */
async function list(client, { companyId, periodId, auditor }) {
  const p = await periodRow(client, companyId, periodId);
  const { rows } = await client.query(
    `SELECT c.*, cp.name AS party, au.name AS authorised_name, sb.name AS sent_name, ob.name AS outcome_name,
            r.agrees, r.their_laari, r.note AS reply_note, r.responder_name, r.responder_role, r.file_name, r.received_at,
            audit_confirmation_opened(c.id) AS opened_at
       FROM audit_confirmations c JOIN counterparties cp ON cp.id = c.counterparty_id
       LEFT JOIN users au ON au.id = c.authorised_by LEFT JOIN users sb ON sb.id = c.sent_by LEFT JOIN users ob ON ob.id = c.outcome_by
       LEFT JOIN audit_confirmation_replies r ON r.confirmation_id = c.id
      WHERE c.company_id = $1 AND c.period_id = $2 ORDER BY cp.name, c.side`,
    [companyId, periodId]
  );
  // What came in or went out after the period end: evidence when nobody replies.
  const { rows: after } = await client.query(
    `SELECT COALESCE(cp.merged_into, cp.id) AS id,
            SUM(CASE WHEN a.code = $2 THEN l.credit_laari ELSE 0 END) AS paid_in,
            SUM(CASE WHEN a.code = $3 THEN l.debit_laari ELSE 0 END) AS paid_out
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id JOIN counterparties cp ON cp.id = l.counterparty_id
      WHERE l.company_id = $1 AND e.entry_date > $4 AND a.code IN ($2, $3)
      GROUP BY COALESCE(cp.merged_into, cp.id)`,
    [companyId, AR, AP, p.to_text]
  );
  const later = new Map(after.map((r) => [r.id, r]));
  return rows.map((c) => {
    const book = BigInt(c.book_laari);
    const replied = Boolean(c.received_at);
    const out = {
      id: c.id, counterpartyId: c.counterparty_id, party: c.party, side: c.side, form: c.form, book: f(book), email: c.email,
      emailChecked: c.email_checked, emailCheckNote: c.email_check_note, status: c.status, requests: c.requests,
      authorisedBy: c.authorised_name, authorisedAt: c.authorised_at, refusedReason: c.refused_reason, sentBy: c.sent_name, sentAt: c.sent_at,
      outcome: c.outcome, outcomeNote: c.outcome_note, outcomeBy: c.outcome_name, outcomeAt: c.outcome_at,
    };
    if (!auditor) return out;
    out.openedAt = c.opened_at;
    const settled = later.get(c.counterparty_id);
    const their = c.their_laari === null ? null : BigInt(c.their_laari);
    return {
      ...out,
      reply: replied
        ? { agrees: c.agrees, theirs: their === null ? null : f(their), difference: their === null ? null : f(their - book), note: c.reply_note, by: c.responder_name, role: c.responder_role, file: c.file_name, at: c.received_at }
        : null,
      afterPeriod: settled ? f(c.side === "receivable" ? settled.paid_in : settled.paid_out) : "0.00",
    };
  });
}

/** The auditor's conclusion on one: agreed, the difference explained, or other procedures used instead. */
async function conclude(client, { companyId, userId, id, outcome, note }) {
  await assumeIdentity(client, { companyId, userId });
  if (!["agreed", "explained", "alternative"].includes(outcome)) throw new Error("Agreed, explained, or other procedures.");
  const why = String(note || "").trim();
  if (outcome !== "agreed" && why.length < 3) throw new Error(outcome === "explained" ? "Say what explains the difference." : "Say what was done instead: receipts after the period, invoices and delivery notes.");
  const { rows } = await client.query(
    "SELECT status, requests, sent_at < now() - interval '14 days' AS waited FROM audit_confirmations WHERE id = $1 AND company_id = $2 FOR NO KEY UPDATE",
    [id, companyId]
  );
  if (!rows[0]) throw new Error("No such confirmation here.");
  if (outcome !== "alternative" && rows[0].status !== "replied") throw new Error("There is no reply yet to agree or explain.");
  if (outcome === "alternative" && !["sent", "refused"].includes(rows[0].status)) throw new Error("Other procedures are for requests with no reply, or ones the company refused.");
  // No reply is concluded only after following up: a reminder sent, or two weeks gone.
  if (outcome === "alternative" && rows[0].status === "sent" && rows[0].requests < 2 && !rows[0].waited) throw new Error("Send a reminder first, or give them two weeks: other procedures are for when no reply comes.");
  await client.query("UPDATE audit_confirmations SET status = 'closed', outcome = $3, outcome_note = $4, outcome_by = $5, outcome_at = now() WHERE id = $1 AND company_id = $2", [id, companyId, outcome, why.slice(0, 1000) || null, userId]);
  return { outcome };
}

/** The reply's attachment, for the auditor. */
async function replyFile(client, { companyId, id }) {
  const { rows } = await client.query("SELECT file_name, file_type, file_bytes FROM audit_confirmation_replies WHERE confirmation_id = $1 AND company_id = $2 AND file_bytes IS NOT NULL", [id, companyId]);
  return rows[0] || null;
}

module.exports = { suggest, create, update, authorise, send, view, reply, list, conclude, replyFile, hash };
