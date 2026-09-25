/**
 * Questions about a document: a customer asks from their portal link, the
 * company answers from the document. One thread per document; a customer's
 * question is open until someone answers, and Needs you says so meanwhile.
 */
const OWNER = {
  invoice: "SELECT counterparty_id FROM sales_invoices WHERE id = $1 AND company_id = $2 AND status = 'posted' AND voided_at IS NULL",
  quote: "SELECT counterparty_id FROM orders WHERE id = $1 AND company_id = $2 AND kind = 'quote'",
  proforma: "SELECT counterparty_id FROM advance_requests WHERE id = $1 AND company_id = $2 AND kind = 'proforma'",
  retainer: "SELECT counterparty_id FROM advance_requests WHERE id = $1 AND company_id = $2 AND kind = 'retainer'",
};
const NUMBER = {
  invoice: "SELECT invoice_no AS n FROM sales_invoices WHERE id = $1",
  quote: "SELECT number AS n FROM orders WHERE id = $1",
  proforma: "SELECT number AS n FROM advance_requests WHERE id = $1",
  retainer: "SELECT number AS n FROM advance_requests WHERE id = $1",
};
const HREF = { invoice: "invoice", quote: "quote", proforma: "proforma", retainer: "retainer" };

/** Whose document it is; refuses a kind or id that is not this company's. */
async function ownerOf(client, { companyId, kind, documentId }) {
  if (!OWNER[kind] || !/^[0-9a-f-]{36}$/i.test(String(documentId))) throw new Error("There is no such document.");
  const { rows } = await client.query(OWNER[kind], [documentId, companyId]);
  if (!rows.length) throw new Error("There is no such document.");
  return rows[0].counterparty_id;
}

const clean = (body) => {
  const t = String(body || "").trim();
  if (!t) throw new Error("Write the question first.");
  if (t.length > 2000) throw new Error("Keep it under 2,000 characters.");
  return t;
};

async function thread(client, { companyId, kind, documentId }) {
  const { rows } = await client.query(
    `SELECT q.id, q.author, q.author_name, q.body, q.created_at, q.answered_at, u.name AS user_name
       FROM document_questions q LEFT JOIN users u ON u.id = q.user_id
      WHERE q.company_id = $1 AND q.kind = $2 AND q.document_id = $3 ORDER BY q.created_at`,
    [companyId, kind, documentId]
  );
  return rows.map((r) => ({ id: r.id, from: r.author, name: r.author === "company" ? r.user_name || "The office" : r.author_name || "The customer", body: r.body, at: r.created_at, open: r.author === "customer" && !r.answered_at }));
}

/**
 * A customer's question, from their link (for that customer's documents only).
 * A note that needs no reply (a quote accepted or declined) is kept on the
 * thread already answered, so it never waits in Needs you.
 */
async function ask(client, { companyId, counterpartyId, kind, documentId, body, name, tellUserIds = [], needsReply = true }) {
  const owner = await ownerOf(client, { companyId, kind, documentId });
  // Their own, or a record since merged into theirs.
  if (owner !== counterpartyId && !(await client.query("SELECT same_party($1, $2) AS ok", [owner, counterpartyId])).rows[0].ok) throw new Error("There is no such document.");
  const text = clean(body);
  await client.query(
    "INSERT INTO document_questions (company_id, counterparty_id, kind, document_id, author, author_name, body, answered_at) VALUES ($1,$2,$3,$4,'customer',$5,$6,$7)",
    [companyId, counterpartyId, kind, documentId, String(name || "").trim().slice(0, 120) || null, text, needsReply ? null : new Date()]
  );
  const { rows: n } = await client.query(NUMBER[kind], [documentId]);
  const { rows: c } = await client.query("SELECT name FROM counterparties WHERE id = $1", [counterpartyId]);
  if (tellUserIds.length) {
    await require("../services/push").tell(client, {
      companyId, userIds: tellUserIds, kind: "waiting", title: needsReply ? `${c[0]?.name || "A customer"} asked about ${n[0]?.n || "a document"}` : `${c[0]?.name || "A customer"} answered ${n[0]?.n || "a document"}`,
      body: text.slice(0, 140), href: `/documents/${HREF[kind]}/${documentId}`,
    });
  }
  return thread(client, { companyId, kind, documentId });
}

/** The company's answer: it closes every open question on the document. */
async function answer(client, { companyId, userId, kind, documentId, body }) {
  const counterpartyId = await ownerOf(client, { companyId, kind, documentId });
  const text = clean(body);
  await client.query(
    "INSERT INTO document_questions (company_id, counterparty_id, kind, document_id, author, body, user_id) VALUES ($1,$2,$3,$4,'company',$5,$6)",
    [companyId, counterpartyId, kind, documentId, text, userId]
  );
  await client.query("UPDATE document_questions SET answered_at = now() WHERE company_id = $1 AND kind = $2 AND document_id = $3 AND author = 'customer' AND answered_at IS NULL", [companyId, kind, documentId]);
  return thread(client, { companyId, kind, documentId });
}

/** Documents with a customer's question nobody has answered, oldest first. */
async function waiting(client, { companyId }) {
  const { rows } = await client.query(
    `SELECT q.kind, q.document_id, MIN(q.created_at) AS since, count(*)::int AS n, c.name AS customer
       FROM document_questions q JOIN counterparties c ON c.id = q.counterparty_id
      WHERE q.company_id = $1 AND q.author = 'customer' AND q.answered_at IS NULL
      GROUP BY q.kind, q.document_id, c.name ORDER BY since`,
    [companyId]
  );
  const out = [];
  for (const r of rows) {
    const { rows: n } = await client.query(NUMBER[r.kind], [r.document_id]);
    out.push({ ...r, number: n[0]?.n || "", href: `/documents/${HREF[r.kind]}/${r.document_id}` });
  }
  return out;
}

module.exports = { thread, ask, answer, waiting, ownerOf };
