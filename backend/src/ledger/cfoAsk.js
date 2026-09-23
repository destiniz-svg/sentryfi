/**
 * Ask the CFO: a question in plain words, answered from the books.
 *
 * The model is given read-only tools and nothing else: it cannot post, and it
 * sees only what the tools return, which is this company's books under its
 * own row security. It is told to answer only from what the tools gave it and
 * to cite entry and document numbers. The answer comes back with what it
 * looked at, and the entries and documents it cited that the tools really
 * returned, so every figure can be followed back.
 */
const { formatLaari } = require("./money");

const f = formatLaari;
const big = (v) => BigInt(v ?? 0);
const ROUNDS = 6;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOr = (v, d) => (DATE.test(String(v || "")) ? String(v) : d);

const TOOLS = [
  { name: "figures", description: "Cash now, money due in and out over the next 30 days, and what makes each up.", parameters: { type: "object", properties: {} } },
  { name: "health", description: "The CFO's checks: runway, liquidity, days to get paid and to pay, margins, growth, customer concentration, currencies, debt cover, GST, slow stock, projects, and whether the books are up to date. Each with a verdict and the figures behind it.", parameters: { type: "object", properties: {} } },
  { name: "profile", description: "The last year: revenue, costs, what is sold, top customers and suppliers, where the money goes, busiest and quietest months, loans, and notes the owners wrote.", parameters: { type: "object", properties: {} } },
  {
    name: "account_balance",
    description: "Find accounts by code or by words in their name, and give each one's balance at `to`, its movement between `from` and `to`, and the latest entries on it.",
    parameters: { type: "object", properties: { account: { type: "string", description: "An account code such as 1100, or words such as 'fuel'" }, from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, required: ["account"] },
  },
  {
    name: "documents",
    description: "Sales invoices or supplier bills, newest first, with what is still owed on each.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["invoices", "bills"] },
        party: { type: "string", description: "Words in the customer's or supplier's name" },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        unpaid: { type: "boolean", description: "Only those with something still owed" },
      },
      required: ["kind"],
    },
  },
  {
    name: "monthly",
    description: "Revenue, costs and profit month by month.",
    parameters: { type: "object", properties: { months: { type: "integer", description: "How many months back, up to 24" } } },
  },
  {
    name: "search_entries",
    description: "Journal entries whose description or line notes contain the words.",
    parameters: { type: "object", properties: { text: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["text"] },
  },
];

const SYSTEM = (today, company) =>
  `You are the CFO inside ${company}'s books, in the Maldives, money in MVR. Today is ${today}. ` +
  "Answer the question using only what your tools return: never invent a figure, name, date or entry. Call tools as often as you need. " +
  "Cite the entry numbers (as #123) and document numbers behind each figure you give. If the books cannot answer it, say what is missing. " +
  "Answer in plain English, short, figures as MVR 1,234.56, no jargon, no hedging, no exclamation marks. You advise; you never change the books.";

/** Runs one tool. Everything here only reads. */
async function run(client, ctx, name, args = {}) {
  const cfo = require("./cfo");
  const { companyId, today } = ctx;
  const cite = (list) => ctx.seen.push(...list);
  if (name === "figures") {
    const { raw, ...x } = await cfo.figures(client, { companyId, today });
    return x;
  }
  if (name === "health") return { checks: await cfo.health(client, { companyId, today }) };
  if (name === "profile") {
    const { raw, ...x } = await cfo.profile(client, { companyId, today });
    return x;
  }
  if (name === "account_balance") {
    const from = dateOr(args.from, cfo.plus(today, -365));
    const to = dateOr(args.to, today);
    const q = String(args.account || "").trim().slice(0, 60);
    const { rows: accounts } = await client.query(
      `SELECT id, code, name, type FROM accounts WHERE company_id = $1 AND (code = $2 OR name ILIKE '%' || $2 || '%') ORDER BY code LIMIT 5`,
      [companyId, q]
    );
    const out = [];
    for (const a of accounts) {
      const { rows: s } = await client.query(
        `SELECT COALESCE(SUM(l.debit_laari - l.credit_laari) FILTER (WHERE e.entry_date <= $3), 0) AS at_end,
                COALESCE(SUM(l.debit_laari - l.credit_laari) FILTER (WHERE e.entry_date BETWEEN $2 AND $3), 0) AS moved
           FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE l.account_id = $1`,
        [a.id, from, to]
      );
      const { rows: latest } = await client.query(
        `SELECT e.entry_no, e.entry_date::text AS on, e.narrative, l.debit_laari - l.credit_laari AS amount
           FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
          WHERE l.account_id = $1 AND e.entry_date BETWEEN $2 AND $3 ORDER BY e.entry_date DESC, e.entry_no DESC LIMIT 15`,
        [a.id, from, to]
      );
      const flip = a.type === "income" || a.type === "liability" || a.type === "equity" ? -1n : 1n;
      const entries = latest.map((r) => ({ entry: `#${r.entry_no}`, on: r.on, narrative: r.narrative, amount: f(big(r.amount) * flip) }));
      cite(entries.map((e) => ({ kind: "entry", ref: e.entry, label: `${e.on} ${e.narrative}` })));
      out.push({ code: a.code, name: a.name, type: a.type, balanceAtTo: f(big(s[0].at_end) * flip), movementFromTo: f(big(s[0].moved) * flip), from, to, latestEntries: entries });
    }
    return out.length ? { accounts: out } : { accounts: [], note: `No account matches "${q}".` };
  }
  if (name === "documents") {
    const invoices = args.kind === "invoices";
    const from = dateOr(args.from, "1900-01-01");
    const to = dateOr(args.to, today);
    const party = String(args.party || "").slice(0, 60);
    const owed = invoices
      ? `d.gross_laari - COALESCE((SELECT SUM(a.amount_laari) FROM receipt_allocations a JOIN receipts r ON r.id = a.receipt_id AND r.voided_at IS NULL WHERE a.invoice_id = d.id), 0)
                        - COALESCE((SELECT SUM(n.gross_laari) FROM credit_notes n WHERE n.invoice_id = d.id), 0)`
      : "d.gross_laari - COALESCE((SELECT SUM(p.amount_laari) FROM payment_items p WHERE p.bill_id = d.id), 0)";
    const { rows } = await client.query(
      `SELECT * FROM (
         SELECT d.${invoices ? "invoice_no" : "bill_no"} AS number, c.name AS party, d.issue_date::text AS issued, d.due_date::text AS due,
                d.gross_laari, ${owed} AS owed
           FROM ${invoices ? "sales_invoices" : "bills"} d JOIN counterparties c ON c.id = d.counterparty_id
          WHERE d.company_id = $1 AND d.status = 'posted' AND d.voided_at IS NULL AND d.issue_date BETWEEN $2 AND $3 AND c.name ILIKE '%' || $4 || '%'
       ) x WHERE NOT $5 OR owed > 0 ORDER BY issued DESC LIMIT 30`,
      [companyId, from, to, party, Boolean(args.unpaid)]
    );
    const docs = rows.map((r) => ({ number: r.number || "(no number)", party: r.party, issued: r.issued, due: r.due, total: f(big(r.gross_laari)), stillOwed: f(big(r.owed)) }));
    cite(docs.filter((d) => d.number !== "(no number)").map((d) => ({ kind: invoices ? "invoice" : "bill", ref: d.number, label: `${d.party}, ${d.issued}, MVR ${d.total}` })));
    const total = rows.reduce((a, r) => a + big(r.owed), 0n);
    return { kind: args.kind, count: docs.length, stillOwedOnThese: f(total), documents: docs };
  }
  if (name === "monthly") {
    const months = Math.min(24, Math.max(1, Number(args.months) || 12));
    const { rows } = await client.query(
      `SELECT to_char(e.entry_date, 'YYYY-MM') AS month,
              COALESCE(SUM(l.credit_laari - l.debit_laari) FILTER (WHERE a.type = 'income'), 0) AS revenue,
              COALESCE(SUM(l.debit_laari - l.credit_laari) FILTER (WHERE a.type = 'expense'), 0) AS costs
         FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journal_entries e ON e.id = l.entry_id
        WHERE a.company_id = $1 AND a.type IN ('income','expense') AND e.entry_date > ($2::date - make_interval(months => $3)) AND e.entry_date <= $2
        GROUP BY 1 ORDER BY 1`,
      [companyId, today, months]
    );
    return { months: rows.map((r) => ({ month: r.month, revenue: f(big(r.revenue)), costs: f(big(r.costs)), profit: f(big(r.revenue) - big(r.costs)) })) };
  }
  if (name === "search_entries") {
    const text = String(args.text || "").trim().slice(0, 60);
    if (!text) return { entries: [] };
    const { rows } = await client.query(
      `SELECT e.entry_no, e.entry_date::text AS on, e.narrative,
              SUM(l.debit_laari) AS total, string_agg(DISTINCT a.name, ', ') AS accounts
         FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id JOIN accounts a ON a.id = l.account_id
        WHERE e.company_id = $1 AND e.entry_date BETWEEN $2 AND $3
          AND (e.narrative ILIKE '%' || $4 || '%' OR EXISTS (SELECT 1 FROM journal_lines m WHERE m.entry_id = e.id AND m.memo ILIKE '%' || $4 || '%'))
        GROUP BY e.id ORDER BY e.entry_date DESC, e.entry_no DESC LIMIT 25`,
      [companyId, dateOr(args.from, "1900-01-01"), dateOr(args.to, today), text]
    );
    const entries = rows.map((r) => ({ entry: `#${r.entry_no}`, on: r.on, narrative: r.narrative, total: f(big(r.total)), accounts: r.accounts }));
    cite(entries.map((e) => ({ kind: "entry", ref: e.entry, label: `${e.on} ${e.narrative}` })));
    return { entries };
  }
  return { error: `There is no tool called ${name}.` };
}

/**
 * Asks. `generate` is the model call (services/geminiService generate with
 * raw: true); passed in so the loop can be tested without a model.
 */
async function ask(client, { companyId, today, company, question }, generate) {
  const ctx = { companyId, today, seen: [] };
  const looked = [];
  const contents = [{ role: "user", parts: [{ text: question }] }];
  const config = { systemInstruction: SYSTEM(today, company), tools: [{ functionDeclarations: TOOLS }], temperature: 0.1 };
  for (let round = 0; round < ROUNDS; round++) {
    const result = await generate({ contents, config, raw: true });
    const calls = result.functionCalls || [];
    if (!calls.length) {
      const answer = String(result.text || "").trim();
      return { answer: answer || "It could not find an answer in the books.", looked, sources: citedIn(answer, ctx.seen) };
    }
    contents.push(result.candidates[0].content);
    const parts = [];
    for (const c of calls) {
      looked.push({ tool: c.name, args: c.args || {} });
      let response;
      try {
        response = await run(client, ctx, c.name, c.args || {});
      } catch (err) {
        response = { error: err.message };
      }
      parts.push({ functionResponse: { id: c.id, name: c.name, response: { result: response } } });
    }
    contents.push({ role: "user", parts });
  }
  return { answer: "That took more looking than it allows at once. Ask something narrower.", looked, sources: citedIn("", ctx.seen) };
}

/** The entries and documents the answer names that the tools really returned. */
function citedIn(answer, seen) {
  const out = new Map();
  for (const s of seen) {
    const at = answer.indexOf(s.ref);
    // "#12" must not match inside "#123".
    if (at >= 0 && !/\d/.test(answer[at + s.ref.length] || "")) out.set(s.kind + s.ref, s);
  }
  return [...out.values()];
}

module.exports = { ask, run, citedIn, TOOLS };
