const express = require("express");

/**
 * The documented interface for a company's own assistant and other software:
 * OpenAPI 3.1 at /api/openapi.json, public (it describes; it opens nothing).
 * The same door a person uses, held to what a key may do
 * (middleware/apiKey.js): read everything the person can read; with a "draft"
 * key, make a draft bill, a draft invoice or an order waiting for approval.
 * Nothing through this interface puts anything in the books.
 */

const get = (summary, extra = {}) => ({ get: { summary, security: [{ key: [] }], responses: { 200: { description: "OK" } }, ...extra } });
const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const money = { type: "string", description: "Money as written, e.g. \"1,250.00\"; whole laari underneath." };
const date = { type: "string", format: "date" };

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Sentryfi",
    version: "1",
    description: [
      "The books of one company, for its own assistant and other software.",
      "",
      "A key is made in Sentryfi (Settings, Assistant keys) by a person, for one company, and acts as that person: it sees what they see and never more. Send it as `Authorization: Bearer sfk_…`. The company is the key's; no company header is needed.",
      "",
      "A **read** key reads. A **draft** key also makes a draft bill (POST /bills), a draft invoice (POST /sales) or an order waiting for approval (POST /orders), each in the person's name, and nothing else: putting anything in the books, approving, paying, receiving and closing are a person's, in the app. Every write a key makes is logged, and the person can turn the key off at any time.",
      "",
      "Money is text with two decimals (\"1,250.00\"), never a float. Dates are YYYY-MM-DD. Errors are `{ error: { message } }` in plain words.",
      "",
      "An MCP server for assistants is at POST /api/mcp, with the same key and the same limits.",
    ].join("\n"),
  },
  servers: [{ url: "https://sentryfi.app/api" }],
  components: { securitySchemes: { key: { type: "http", scheme: "bearer", description: "A Sentryfi key, sfk_…" } } },
  paths: {
    "/companies/current": get("The company this key is for, and what its person may do."),
    "/companies/current/setup": get("Getting the books going: which of the first steps are done."),
    "/figures": get("Headline figures: cash, spent this month, owed both ways, GST, money out by month, recent entries."),
    "/attention": get("What needs a person, most costly first."),
    "/cfo": get("The morning brief, the four figures for the next thirty days, the health checks and the profile."),
    "/cfo/ask": { post: { summary: "Ask the CFO a question; answered from the books, with the entries and documents it rests on. Changes nothing.", security: [{ key: [] }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string", maxLength: 500 } } } } } }, responses: { 200: { description: "{ answer, sources, looked }" } } } },
    "/statements/trial-balance": get("Trial balance.", { parameters: [{ name: "to", in: "query", schema: date }] }),
    "/statements/profit-and-loss": get("Profit and loss.", { parameters: [{ name: "from", in: "query", schema: date }, { name: "to", in: "query", schema: date }] }),
    "/statements/balance-sheet": get("Balance sheet.", { parameters: [{ name: "to", in: "query", schema: date }] }),
    "/bills": {
      ...get("Bills, newest first."),
      post: {
        summary: "Draft a bill (draft key). Recorded, not in the books: a person puts it in.",
        security: [{ key: [] }],
        requestBody: { content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { supplierName: { type: "string" }, billNo: { type: "string" }, issueDate: date, dueDate: date, amount: money, gstTreatment: { type: "string", enum: ["inclusive", "exclusive", "none_unregistered", "exempt", "zero_rated", "unknown"] }, currency: { type: "string" }, fxRate: { type: "string" }, projectId: { type: "string", format: "uuid" } } } } } },
        responses: { 201: { description: "{ bill }" } },
      },
    },
    "/bills/{id}": get("One bill, with its lines and attachments.", { parameters: [id] }),
    "/sales": {
      ...get("Invoices, newest first, with what is still owed on each."),
      post: {
        summary: "Draft an invoice (draft key). A draft until a person puts it in the books.",
        security: [{ key: [] }],
        requestBody: { content: { "application/json": { schema: { type: "object", required: ["lines"], properties: { customerName: { type: "string" }, counterpartyId: { type: "string", format: "uuid" }, subject: { type: "string" }, purchaseOrder: { type: "string" }, issueDate: date, dueDate: date, gstTreatment: { type: "string", enum: ["inclusive", "exclusive", "none_unregistered", "exempt", "zero_rated"] }, lines: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, uom: { type: "string" }, unitPrice: money, amount: money } } } } } } } },
        responses: { 201: { description: "{ invoice }" } },
      },
    },
    "/sales/aged": get("What customers owe, by how late."),
    "/orders": {
      ...get("Purchase orders, sales orders and quotes.", { parameters: [{ name: "kind", in: "query", schema: { type: "string", enum: ["purchase", "sale", "quote"] } }] }),
      post: {
        summary: "Make an order or a quote (draft key). A purchase order waits for a person to approve it.",
        security: [{ key: [] }],
        requestBody: { content: { "application/json": { schema: { type: "object", required: ["kind", "lines"], properties: { kind: { type: "string", enum: ["purchase", "sale", "quote"] }, partyName: { type: "string" }, counterpartyId: { type: "string", format: "uuid" }, orderedOn: date, expectedOn: date, validUntil: date, note: { type: "string" }, lines: { type: "array", items: { type: "object", required: ["quantity", "unitPrice"], properties: { description: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" }, unitPrice: money } } } } } } } },
        responses: { 201: { description: "{ order }" } },
      },
    },
    "/orders/{id}": get("One order, its lines, deliveries and bills.", { parameters: [id] }),
    "/bank": get("Bank and cash accounts with their balances."),
    "/bank/{id}/statement": get("One account's statement lines and how each is explained.", { parameters: [id] }),
    "/cash": get("Cash tins, what each holds, and who holds it."),
    "/stock": get("Stock items, what is on hand and what it cost."),
    "/projects": get("Projects with their contract, spent, committed and forecast."),
    "/projects/{id}": get("One project in full.", { parameters: [id] }),
    "/claims": get("Expense claims."),
    "/documents/{kind}/{id}": get("A document as it is drawn (the issued copy when there is one).", { parameters: [{ name: "kind", in: "path", required: true, schema: { type: "string", enum: ["invoice", "quote", "sales_order", "purchase_order", "delivery_note", "goods_received", "credit_note"] } }, id] }),
  },
};

const router = express.Router();
router.get("/", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(spec);
});

module.exports = router;
module.exports.spec = spec;
