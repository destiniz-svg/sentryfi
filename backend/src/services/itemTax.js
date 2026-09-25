const { Type } = require("@google/genai");
const { z } = require("zod");

/**
 * An item's GST class from its name: standard, zero-rated or exempt.
 *
 * Same rule as reading a bill: it must not guess. Rice is zero-rated in the
 * Maldives and kerosene is not, though both look like essentials; a wrong
 * class under-charges or over-charges every invoice the item goes on. So the
 * prompt names what counts, and "unknown" is a normal answer that leaves the
 * question for a person.
 */

const itemTaxSchema = {
  type: Type.OBJECT,
  required: ["tax", "why", "confidence"],
  properties: {
    tax: { type: Type.STRING, description: "One of: standard, zero_rated, exempt, unknown." },
    why: { type: Type.STRING, description: "One short sentence a shopkeeper would understand, naming the rule." },
    confidence: { type: Type.STRING, description: "'high', 'medium' or 'low'. Be honest; 'low' is useful." },
  },
};

const itemTaxValidator = z.object({
  tax: z.enum(["standard", "zero_rated", "exempt", "unknown"]).catch("unknown"),
  why: z.string().catch(""),
  confidence: z.enum(["high", "medium", "low"]).catch("low"),
});

// MIRA's lists, as in docs/domain/maldives-tax-and-statutory.md section 4.
const RULES = {
  MV: [
    "The business is in the Maldives. GST under the GST Act 10/2011, as MIRA applies it.",
    "Zero-rated: the essential goods in Schedule 1 — rice, sugar and flour; salt; milk; cooking oil; eggs; tea leaves; deep-sea and reef fish, fish packed in the Maldives, rihaakuru; potatoes and onions; curry-paste ingredients (cumin, fennel, coriander seed, turmeric, garlic, ginger, chilli, chilli powder, cinnamon, cardamom, peppercorn and similar); dhiyaahakuru, kaashi, kurun'baa, rukuraa and kurolhi; carrots, cabbage, beans and tomatoes; fruits; bread, buns and rusk; baby food; baby and adult diapers; cooking gas, diesel and petrol; sanitary napkins, tampons, menstrual cups and similar. Also exports, and a business sold as a going concern.",
    "Not zero-rated although they look like it: kerosene, jet fuel and lubricating oils are standard.",
    "Exempt: electricity, water and sewerage; postal service; education by a registered institution; health services by a registered provider; approved drugs and medical devices sold by a registered pharmacy; financial services; rent from leasing land or buildings; international transport; fines; daycare by registered providers.",
    "Everything else is standard: building materials, hire of equipment, construction work, labour, professional services, most goods.",
  ],
  AE: [
    "The business is in the United Arab Emirates. VAT under Federal Decree-Law 8 of 2017, as the FTA applies it.",
    "Zero-rated: exports, international transport, investment-grade precious metals, first supply of new residential buildings, certain education and healthcare, crude oil and natural gas.",
    "Exempt: some financial services, residential rent after the first supply, bare land, local passenger transport.",
    "Everything else is standard.",
  ],
};

function itemTaxPrompt({ name, code, unit, kind, pack }) {
  return [
    ...(RULES[pack] || ["The country's tax rules are not known here: answer unknown."]),
    "",
    `The item: "${name}"${code ? ` (code ${code})` : ""}, a ${kind === "service" ? "service" : "product"}, counted by ${unit}.`,
    "Say which class it falls in: standard, zero_rated or exempt.",
    "Answer unknown when the name could be either — 'oil' could be cooking oil or lubricating oil — or when it depends on who supplies it (a registered pharmacy, a registered school). Unknown is a correct answer and far better than a guess.",
  ].join("\n");
}

module.exports = { itemTaxSchema, itemTaxValidator, itemTaxPrompt };
