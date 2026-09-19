const { GoogleGenAI, Type } = require("@google/genai");
const { z } = require("zod");

const env = require("../config/env");
const { billSchema, billValidator, billPrompt, questionsFrom } = require("./billExtraction");
const ApiError = require("../utils/ApiError");

const ai = env.geminiApiKey
  ? new GoogleGenAI({ apiKey: env.geminiApiKey })
  : null;

function requireAI() {
  if (!ai) {
    throw ApiError.internal("GEMINI_API_KEY is not configured on the server.");
  }
}

/**
 * Busy and rate-limited are not failures, they are "not now".
 *
 * A 503 means the model is under load and a 429 means we asked too fast.
 * Neither says anything about the photograph, and surfacing either one to
 * somebody standing on a site is asking them to solve a problem that is not
 * theirs. So they are retried, briefly, before anyone is told anything.
 *
 * Everything else — a bad key, a retired model, an unreadable image — fails
 * immediately, because retrying those only makes the person wait longer for
 * the same answer.
 */
const TRANSIENT = /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i;
const GONE = /\b404\b|NOT_FOUND|no longer available|is not supported|not found/i;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Which model to use, discovered rather than guessed.
 *
 * Two things went wrong in one afternoon that this answers. A model was
 * retired for newly-created keys and the configured name 404'd; then the
 * replacement came back 503 "experiencing high demand" often enough to be
 * unusable. Hard-coding a second name would only move the problem, because
 * which models a key can reach is a property of the key and the day.
 *
 * So when the configured model fails, the list of models the key can actually
 * reach is fetched once and the usable ones are tried in order. The working
 * one is remembered for the life of the process, so this costs one extra call
 * on the first bad day and nothing afterwards.
 */
let discovered = null;
/** The model that last worked, remembered for the life of the process. */
let chosen = null;

async function reachableModels() {
  if (discovered) return discovered;
  const names = [];
  try {
    const page = await ai.models.list();
    for await (const m of page) {
      const name = String(m.name || "").replace(/^models\//, "");
      const canGenerate =
        !m.supportedActions || m.supportedActions.includes("generateContent");
      // Vision and structured output are both required here, and the small
      // fast models are the right shape for reading one page of paper.
      if (canGenerate && /gemini/i.test(name) && !/embedding|aqa|imagen|veo|tts/i.test(name)) {
        names.push(name);
      }
    }
  } catch {
    // If even listing fails there is nothing more to try than what we were told.
  }
  // Prefer flash — cheaper and quicker for a page of paper — then anything else.
  names.sort((a, b) => (/flash/i.test(b) ? 1 : 0) - (/flash/i.test(a) ? 1 : 0));
  discovered = names;
  return discovered;
}

async function callModel(model, { contents, config }) {
  const result = await ai.models.generateContent({ model, contents, config });
  const text = typeof result.text === "function" ? result.text() : result.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

async function generate({ contents, config }) {
  let last;

  // The configured model first, retried through a short spike.
  const preferred = chosen || env.geminiModel;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const text = await callModel(preferred, { contents, config });
      chosen = preferred;
      return text;
    } catch (err) {
      last = err;
      const raw = String(err?.message || err);
      if (GONE.test(raw)) break;                 // wrong name: retrying will not help
      if (!TRANSIENT.test(raw)) throw err;       // a real failure
      if (attempt < 2) await pause(700 * (attempt + 1));
    }
  }

  // Still stuck. Find out what this key can actually reach and work down it.
  for (const model of await reachableModels()) {
    if (model === preferred) continue;
    try {
      const text = await callModel(model, { contents, config });
      // Remember it: the next bill should not pay for this search again.
      chosen = model;
      console.warn(
        JSON.stringify({
          at: "gemini",
          note: "configured model unavailable; using another the key can reach",
          configured: env.geminiModel,
          using: model,
        })
      );
      return text;
    } catch (err) {
      last = err;
      const raw = String(err?.message || err);
      if (!TRANSIENT.test(raw) && !GONE.test(raw)) throw err;
    }
  }

  throw last;
}


const receiptResponseSchema = {
  type: Type.OBJECT,
  required: ["vendor", "total", "lineItems"],
  properties: {
    vendor: { type: Type.STRING, description: "Merchant / vendor name" },
    date: { type: Type.STRING, description: "ISO date YYYY-MM-DD if visible, else empty" },
    currency: { type: Type.STRING, description: "3-letter code like USD, else empty" },
    subtotal: { type: Type.NUMBER },
    tax: { type: Type.NUMBER },
    total: { type: Type.NUMBER },
    category: { type: Type.STRING, description: "Expense category e.g. Meals, Software, Travel" },
    notes: { type: Type.STRING },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["description", "quantity", "rate"],
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          rate: { type: Type.NUMBER, description: "Unit price" },
        },
      },
    },
  },
};

const receiptValidator = z.object({
  vendor: z.string().default(""),
  date: z.string().default(""),
  currency: z.string().default(""),
  subtotal: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  category: z.string().default(""),
  notes: z.string().default(""),
  lineItems: z
    .array(
      z.object({
        description: z.string().default(""),
        quantity: z.coerce.number().default(1),
        rate: z.coerce.number().default(0),
      })
    )
    .default([]),
});

/**
 * Reads a supplier bill, and says what it is unsure about.
 *
 * Separate from parseReceipt because a supplier bill and a freelancer expense
 * receipt are not the same document: this one has to establish how the GST was
 * quoted, and must refuse to guess it. See services/billExtraction.js.
 */
async function parseBill({ buffer, mimeType, companyName }) {
  requireAI();
  const text = await generate({
    contents: [
      {
        role: "user",
        parts: [
          { text: billPrompt({ companyName }) },
          { inlineData: { mimeType, data: buffer.toString("base64") } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: billSchema,
      // Reading a document is not a task that benefits from invention.
      temperature: 0,
    },
  });

  const extracted = billValidator.parse(JSON.parse(text));
  return { extracted, questions: questionsFrom(extracted) };
}

async function parseReceipt({ buffer, mimeType }) {
  requireAI();
  const prompt = [
    "You are an accounts-payable assistant. Extract structured data from this receipt or invoice image/PDF.",
    "Return the vendor, date, currency, each line item (description, quantity, unit rate), subtotal, tax, and grand total.",
    "If a value is not visible, use an empty string or 0. Quantities default to 1 when not shown.",
    "Suggest a sensible expense category.",
  ].join("\n");

  const text = await generate({
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: buffer.toString("base64") } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: receiptResponseSchema,
      temperature: 0.1,
    },
  });

  return receiptValidator.parse(JSON.parse(text));
}

async function businessSummary(data) {
  requireAI();
  const prompt = [
    "You are a friendly financial analyst for a small business owner.",
    "Given this month's billing data (JSON), write a concise 2-3 sentence plain-English summary.",
    "Mention revenue trend vs last month with a percentage if computable, count and dollar total of overdue invoices,",
    "and one actionable suggestion (e.g. follow up with a specific client). Be specific with numbers. No markdown, no bullet points.",
    "",
    "DATA:",
    JSON.stringify(data),
  ].join("\n");

  const text = await generate({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.5 },
  });
  return text.trim();
}

async function paymentReminder({ tone, invoice, client, company, daysOverdue }) {
  requireAI();
  const toneGuide =
    tone === "firm"
      ? "firm but professional — this invoice is significantly overdue"
      : tone === "final"
      ? "serious and direct — a final notice before escalation, still courteous"
      : "warm, polite and friendly — a gentle nudge";

  const prompt = [
    `Write a payment reminder email. Tone: ${toneGuide}.`,
    "Return a short subject line, then a blank line, then the email body.",
    "Use the merchant/company name as the signature. Keep it under 130 words. Plain text, no markdown.",
    "",
    "CONTEXT:",
    JSON.stringify({ invoice, client, company, daysOverdue }),
  ].join("\n");

  const text = await generate({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.6 },
  });

  const trimmed = text.trim();
  const nl = trimmed.indexOf("\n");
  let subject = "";
  let body = trimmed;
  if (nl > -1) {
    subject = trimmed.slice(0, nl).replace(/^subject:\s*/i, "").trim();
    body = trimmed.slice(nl + 1).trim();
  }
  return { subject, body };
}

async function writeNote({ kind, prompt, items, client }) {
  requireAI();
  const target =
    kind === "terms"
      ? "professional payment-terms / notes text for the bottom of an invoice"
      : "a concise, professional service description for an invoice line item or summary";

  const full = [
    `Write ${target}.`,
    prompt ? `The user's request: ${prompt}` : "",
    "Keep it polished and brief (1-3 sentences). Plain text only, no markdown, no preamble.",
    items?.length ? `Line items for context: ${JSON.stringify(items)}` : "",
    client ? `Client: ${JSON.stringify(client)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await generate({
    contents: [{ role: "user", parts: [{ text: full }] }],
    config: { temperature: 0.7 },
  });
  return text.trim();
}

module.exports = {
  parseBill,
  parseReceipt,
  businessSummary,
  paymentReminder,
  writeNote,
};
