const express = require("express");
const env = require("../config/env");
const { keyOf } = require("../middleware/apiKey");

/**
 * An MCP server for a company's own assistant (Claude, or any MCP client), at
 * POST /api/mcp, JSON-RPC over plain HTTP. Authorised by the same key as the
 * REST interface (Authorization: Bearer sfk_...), and every tool calls that
 * interface through the same door with the same key, so it is held to exactly
 * the same limits (middleware/apiKey.js): read everything the person can
 * read; with a draft key, make drafts; never put anything in the books.
 */

const q = (o) => {
  const s = new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v != null && v !== ""));
  return s.toString() ? `?${s}` : "";
};
const obj = (properties = {}, required = []) => ({ type: "object", properties, required });
const str = (description) => ({ type: "string", description });

const TOOLS = [
  { name: "company", description: "The company this key is for, and what its person may do.", inputSchema: obj(), call: () => ["GET", "/companies/current"] },
  { name: "figures", description: "Headline figures: cash, spent this month, owed both ways, GST, money out by month, recent entries.", inputSchema: obj(), call: () => ["GET", "/figures"] },
  { name: "needs_attention", description: "What needs a person, most costly first.", inputSchema: obj(), call: () => ["GET", "/attention"] },
  { name: "cfo_brief", description: "The morning brief, cash over the next thirty days, the health checks and what is known about the business.", inputSchema: obj(), call: () => ["GET", "/cfo"] },
  { name: "ask_cfo", description: "Ask a question about the books; answered from them, citing entries and documents. Changes nothing.", inputSchema: obj({ question: str("The question, in plain words") }, ["question"]), call: (a) => ["POST", "/cfo/ask", { question: a.question }] },
  {
    name: "statement",
    description: "A financial statement.",
    inputSchema: obj({ which: { type: "string", enum: ["trial-balance", "profit-and-loss", "balance-sheet"] }, from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD") }, ["which"]),
    call: (a) => ["GET", `/statements/${encodeURIComponent(a.which)}${q({ from: a.from, to: a.to })}`],
  },
  { name: "bills", description: "Bills, newest first.", inputSchema: obj(), call: () => ["GET", "/bills"] },
  { name: "bill", description: "One bill in full.", inputSchema: obj({ id: str("The bill's id") }, ["id"]), call: (a) => ["GET", `/bills/${encodeURIComponent(a.id)}`] },
  { name: "invoices", description: "Invoices, newest first, with what is still owed on each.", inputSchema: obj(), call: () => ["GET", "/sales"] },
  { name: "owed_to_us", description: "What customers owe, by how late.", inputSchema: obj(), call: () => ["GET", "/sales/aged"] },
  { name: "orders", description: "Purchase orders, sales orders and quotes.", inputSchema: obj({ kind: { type: "string", enum: ["purchase", "sale", "quote"] } }), call: (a) => ["GET", `/orders${q({ kind: a.kind })}`] },
  { name: "order", description: "One order, its lines, deliveries and bills.", inputSchema: obj({ id: str("The order's id") }, ["id"]), call: (a) => ["GET", `/orders/${encodeURIComponent(a.id)}`] },
  { name: "bank", description: "Bank and cash accounts with their balances.", inputSchema: obj(), call: () => ["GET", "/bank"] },
  { name: "cash_tins", description: "Cash tins, what each holds, and who holds it.", inputSchema: obj(), call: () => ["GET", "/cash"] },
  { name: "stock", description: "Stock items, on hand and cost.", inputSchema: obj(), call: () => ["GET", "/stock"] },
  { name: "projects", description: "Projects with contract, spent, committed and forecast.", inputSchema: obj(), call: () => ["GET", "/projects"] },
  {
    name: "draft_bill",
    description: "Draft a supplier's bill in the person's name (draft key). It is recorded, not in the books; a person puts it in.",
    inputSchema: obj(
      { supplierName: str("Who it is from"), amount: str("The total as printed, e.g. 1,250.00"), billNo: str("Their number"), issueDate: str("YYYY-MM-DD"), dueDate: str("YYYY-MM-DD"), gstTreatment: { type: "string", enum: ["inclusive", "exclusive", "none_unregistered", "exempt", "zero_rated", "unknown"] } },
      ["supplierName", "amount"]
    ),
    call: (a) => ["POST", "/bills", a],
  },
  {
    name: "draft_invoice",
    description: "Draft an invoice in the person's name (draft key). A draft until a person puts it in the books.",
    inputSchema: obj(
      { customerName: str("Who it is to"), subject: str("What it is for"), dueDate: str("YYYY-MM-DD"), lines: { type: "array", items: obj({ description: str("What it is"), quantity: { type: "number" }, unitPrice: str("Price for one, e.g. 250.00") }, ["description"]) } },
      ["customerName", "lines"]
    ),
    call: (a) => ["POST", "/sales", a],
  },
  {
    name: "draft_order",
    description: "Make a purchase order, sales order or quote in the person's name (draft key). A purchase order waits for a person to approve it.",
    inputSchema: obj(
      { kind: { type: "string", enum: ["purchase", "sale", "quote"] }, partyName: str("The supplier or customer"), expectedOn: str("YYYY-MM-DD"), lines: { type: "array", items: obj({ description: str("What it is"), quantity: str("How many"), unitPrice: str("Price for one") }, ["quantity", "unitPrice"]) } },
      ["kind", "partyName", "lines"]
    ),
    call: (a) => ["POST", "/orders", a],
  },
];

const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg, auth) {
  const { id, method, params } = msg || {};
  if (method === "initialize")
    return reply(id, {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "sentryfi", version: "1" },
      instructions: "The books of one company. Read freely. With a draft key you may make drafts; nothing you do puts anything in the books: tell the person what you drafted, and they put it in from Sentryfi.",
    });
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return fail(id, -32602, `No tool called ${params?.name}.`);
    const [verb, path, body] = tool.call(params.arguments || {});
    // Through the same door, with the same key: the same limits apply.
    const r = await fetch(`http://127.0.0.1:${env.port}/api${path}`, {
      method: verb,
      headers: { Authorization: auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    return reply(id, { content: [{ type: "text", text }], isError: !r.ok });
  }
  if (id === undefined) return null; // a notification: nothing to answer
  return fail(id, -32601, `Unknown method ${method}.`);
}

const router = express.Router();
router.post("/", async (req, res, next) => {
  try {
    const key = await keyOf(req);
    if (!key) return res.status(401).json(fail(null, -32001, "Send a Sentryfi key: Authorization: Bearer sfk_..."));
    const batch = Array.isArray(req.body);
    const out = (await Promise.all((batch ? req.body : [req.body]).map((m) => handle(m, req.get("authorization"))))).filter(Boolean);
    if (!out.length) return res.status(202).end();
    res.json(batch ? out : out[0]);
  } catch (err) {
    next(err);
  }
});
router.get("/", (req, res) => res.status(405).set("Allow", "POST").json({ error: { message: "POST JSON-RPC here." } }));

module.exports = router;
module.exports.TOOLS = TOOLS;
