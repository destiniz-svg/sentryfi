const { Type } = require("@google/genai");
const { z } = require("zod");

/**
 * Reading a supplier's bill.
 *
 * The existing receipt reader was written for a freelancer's expenses: it
 * suggests categories like Meals and Software and says nothing about tax. A
 * Maldivian supplier's bill needs different things read off it, and one of
 * them decides whether the tax claim is right.
 *
 * The rule this is built around is from the product record: only ask when
 * genuinely unsure. So the model returns how confident it is about each field,
 * and the app puts in front of a person only what is actually doubtful. A
 * clear bill from a known supplier should go in without a question.
 *
 * It must never decide the GST treatment on thin evidence. Reading an
 * exclusive bill as inclusive overstates the claim by 8%, and that error is
 * invisible afterwards because both readings produce a plausible-looking
 * number. So the prompt tells it what counts as evidence and tells it to
 * answer "unknown" when it does not have any — which is a real answer here,
 * and blocks posting until a person decides.
 */

const CONFIDENCE = {
  type: Type.STRING,
  description: "How sure you are: 'high', 'medium' or 'low'. Be honest; 'low' is useful.",
};

const billSchema = {
  type: Type.OBJECT,
  required: ["supplierName", "grossAmount", "gstTreatment", "confidence"],
  properties: {
    supplierName: {
      type: Type.STRING,
      description: "The company issuing the bill, exactly as printed at the top.",
    },
    supplierTin: {
      type: Type.STRING,
      description: "The supplier's TIN or GST number if printed, else empty string.",
    },
    billNo: {
      type: Type.STRING,
      description: "Invoice or bill number as printed, else empty string.",
    },
    issueDate: {
      type: Type.STRING,
      description: "Date of the bill as YYYY-MM-DD, else empty string.",
    },
    currency: {
      type: Type.STRING,
      description: "Three-letter code. MVR unless the document clearly says otherwise.",
    },
    netAmount: {
      type: Type.STRING,
      description: "The amount before GST, as printed, digits and one dot only. Empty if not shown.",
    },
    taxAmount: {
      type: Type.STRING,
      description: "The GST amount, as printed, digits and one dot only. Empty if not shown.",
    },
    grossAmount: {
      type: Type.STRING,
      description: "The total payable, digits and one dot only. This is the figure to pay.",
    },
    gstTreatment: {
      type: Type.STRING,
      description:
        "One of: inclusive, exclusive, none_unregistered, exempt, zero_rated, unknown. " +
        "Answer 'unknown' unless the document gives you real evidence.",
    },
    gstRatePercent: {
      type: Type.STRING,
      description: "The GST rate as a number, e.g. '8'. Empty if not stated.",
    },
    billedToName: {
      type: Type.STRING,
      description: "Who the bill is addressed to, as printed. Empty if not shown.",
    },
    supplierAddress: {
      type: Type.STRING,
      description: "The supplier's address exactly as printed, on one line. Empty if not shown.",
    },
    supplierPhone: {
      type: Type.STRING,
      description: "The supplier's phone number as printed. Empty if not shown.",
    },
    supplierEmail: {
      type: Type.STRING,
      description: "The supplier's email as printed. Empty if not shown.",
    },
    supplierGstNumber: {
      type: Type.STRING,
      description: "The supplier's GST registration number, if printed separately from the TIN.",
    },
    supplierBankAccount: {
      type: Type.STRING,
      description:
        "The bank account number the bill asks to be paid into, digits only, as printed. " +
        "Empty if the bill does not give one.",
    },
    confidence: {
      type: Type.OBJECT,
      required: ["supplierName", "grossAmount", "gstTreatment"],
      properties: {
        supplierName: CONFIDENCE,
        billNo: CONFIDENCE,
        issueDate: CONFIDENCE,
        grossAmount: CONFIDENCE,
        gstTreatment: CONFIDENCE,
      },
    },
    notes: {
      type: Type.STRING,
      description: "Anything odd worth a person's attention, in one short sentence. Else empty.",
    },
  },
};

const level = z.enum(["high", "medium", "low"]).catch("low");

const billValidator = z.object({
  supplierName: z.string().default(""),
  supplierTin: z.string().default(""),
  supplierAddress: z.string().default(""),
  supplierPhone: z.string().default(""),
  supplierEmail: z.string().default(""),
  supplierGstNumber: z.string().default(""),
  supplierBankAccount: z.string().default(""),
  billNo: z.string().default(""),
  issueDate: z.string().default(""),
  currency: z.string().default("MVR"),
  netAmount: z.string().default(""),
  taxAmount: z.string().default(""),
  grossAmount: z.string().default(""),
  gstTreatment: z
    .enum(["inclusive", "exclusive", "none_unregistered", "exempt", "zero_rated", "unknown"])
    .catch("unknown"),
  gstRatePercent: z.string().default(""),
  billedToName: z.string().default(""),
  confidence: z
    .object({
      supplierName: level.default("low"),
      billNo: level.default("low"),
      issueDate: level.default("low"),
      grossAmount: level.default("low"),
      gstTreatment: level.default("low"),
    })
    .default({}),
  notes: z.string().default(""),
});

const BILL_PROMPT = [
  "You are reading a supplier's bill for a construction company in the Maldives.",
  "Read only what is printed. Do not calculate figures that are not shown, and do not infer a supplier's identity from context.",
  "",
  "The most important field is gstTreatment, and it is the one you must not guess.",
  "GST in the Maldives is generally 8%. Decide as follows:",
  "- 'exclusive' only if the document shows a subtotal, then GST added, then a higher total.",
  "- 'inclusive' only if the document says the price includes GST, or shows a GST amount that is already contained within the stated total.",
  "- 'none_unregistered' only if the document shows no GST at all AND shows no TIN or GST registration number. Many small Maldivian suppliers are not registered.",
  "- 'exempt' or 'zero_rated' only if the document says so in those words.",
  "- 'unknown' in every other case. This is a normal, correct answer. It is far better than a guess: reading an exclusive bill as inclusive overstates a tax claim by 8%, and nobody can see the mistake afterwards.",
  "",
  "For confidence, be honest. 'low' on a field is useful information, not a failure.",
  "Amounts must be digits and at most one decimal point, with no currency symbol, no commas and no spaces.",
  "Read the supplier's address, phone, email, GST number and the bank account the bill asks to be paid into, when they are printed. These are how the supplier's record fills itself in over time, so a blank is much better than a guess.",
  "The image is a photograph of a piece of paper, often taken at an angle, on a desk or a van bonnet, in poor light, with other things in the frame. Read the document in it and ignore the surroundings. If it is rotated, read it rotated.",
  "If a field is genuinely not on the paper, leave it empty. An empty field is correct and useful; an invented one is a figure somebody will pay.",
  "If the bill is handwritten, faint, cropped or in Dhivehi, say so in notes and lower your confidence.",
].join("\n");

/**
 * Anything the app should ask a person about before this goes in the books.
 * Everything else it can handle on its own, which is the whole point.
 */
function questionsFrom(extracted) {
  const questions = [];
  const c = extracted.confidence || {};

  if (extracted.gstTreatment === "unknown") {
    questions.push({
      field: "gstTreatment",
      asks: "How was the GST quoted on this bill?",
      because: "It could not be read from the paper, and guessing it would be an 8% error.",
    });
  } else if (c.gstTreatment === "low") {
    questions.push({
      field: "gstTreatment",
      asks: `It looks like GST was ${extracted.gstTreatment === "inclusive" ? "included in the price" : "added on top"}. Is that right?`,
      because: "The bill was not clear about it.",
    });
  }

  if (!extracted.grossAmount || c.grossAmount === "low") {
    questions.push({
      field: "amount",
      asks: "What is the total on this bill?",
      because: "The amount could not be read clearly.",
    });
  }

  if (!extracted.supplierName || c.supplierName === "low") {
    questions.push({
      field: "supplierName",
      asks: "Who is this bill from?",
      because: "The supplier's name could not be read clearly.",
    });
  }

  return questions;
}

module.exports = { billSchema, billValidator, BILL_PROMPT, questionsFrom };
