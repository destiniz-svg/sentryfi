const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { splitTax, findPossibleDuplicates, postBill } = require("../ledger/bills");
const { toLaari, formatLaari } = require("../ledger/money");
const { uploadReceipt } = require("../middleware/upload");
const gemini = require("../services/geminiService");

const router = express.Router();
router.use(requireAuth, requireCompany);

const GST_TREATMENTS = [
  "inclusive",
  "exclusive",
  "none_unregistered",
  "exempt",
  "zero_rated",
  "unknown",
];

const billBody = z.object({
  counterpartyId: z.string().uuid().nullish(),
  supplierName: z.string().trim().max(160).optional(),
  billNo: z.string().trim().max(60).nullish(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  // Whatever the supplier printed. What it means is decided by gstTreatment.
  amount: z.union([z.string(), z.number()]),
  gstTreatment: z.enum(GST_TREATMENTS).default("unknown"),
  gstRateBp: z.number().int().min(0).max(10000).nullish(),
  projectId: z.string().uuid().nullish(),
  billedToCompany: z.string().uuid().nullish(),
});

const serialize = (row) => ({
  ...row,
  net_laari: String(row.net_laari),
  tax_laari: String(row.tax_laari),
  gross_laari: String(row.gross_laari),
  net: formatLaari(BigInt(row.net_laari)),
  tax: formatLaari(BigInt(row.tax_laari)),
  gross: formatLaari(BigInt(row.gross_laari)),
});

/**
 * Reads a photographed bill and says what it is unsure about.
 *
 * Reads only. Nothing is recorded here, because the person should see what was
 * read off their bill before it becomes a record — and because a scan that
 * silently created something would make a bad read expensive to undo.
 *
 * The supplier is matched against the names already known, including the other
 * spellings each one goes by, since one real invoice spells its own issuer two
 * ways on a single page.
 */
router.post(
  "/scan",
  requireCan("record"),
  uploadReceipt("file"),
  asyncHandler(async (req, res) => {
    let read;
    try {
      read = await gemini.parseBill({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
    } catch (err) {
      // Tell the truth about which failure this is. "Try a clearer
      // photograph" is useless advice when the real problem is that reading
      // is not switched on, and it sends somebody off to re-take a photo that
      // was fine.
      if (/GEMINI_API_KEY/i.test(err.message || "")) {
        throw ApiError.badRequest(
          "Reading bills from a photo is not switched on yet. Type it in for now."
        );
      }
      throw ApiError.badRequest(
        "That could not be read. Try a clearer photograph, or type it in."
      );
    }

    const { extracted, questions } = read;

    // Who this might be, among suppliers already known.
    let matched = null;
    if (extracted.supplierName) {
      matched = await asCompany(req, async (client) => {
        const { rows } = await client.query(
          `SELECT id, name, gst_registered,
                  similarity(name, $2) AS score
             FROM counterparties
            WHERE company_id = $1
              AND archived_at IS NULL
              AND (name % $2 OR lower($2) = ANY (SELECT lower(x) FROM unnest(also_known_as) x))
            ORDER BY score DESC NULLS LAST
            LIMIT 1`,
          [req.companyId, extracted.supplierName]
        );
        return rows[0] || null;
      });
    }

    // A supplier we know is not registered cannot have charged GST, whatever
    // the paper seems to say. Knowing something is better than reading it.
    let treatment = extracted.gstTreatment;
    let questionList = questions;
    if (matched && matched.gst_registered === false && treatment === "unknown") {
      treatment = "none_unregistered";
      questionList = questions.filter((q) => q.field !== "gstTreatment");
    }

    res.json({
      read: { ...extracted, gstTreatment: treatment },
      supplier: matched
        ? { id: matched.id, name: matched.name, gstRegistered: matched.gst_registered }
        : null,
      questions: questionList,
    });
  })
);

/** Bills, newest first. Voided ones stay in the list, marked. */
router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const bills = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT b.*, c.name AS supplier_name
           FROM bills b
           LEFT JOIN counterparties c ON c.id = b.counterparty_id
          WHERE b.company_id = $1
          ORDER BY COALESCE(b.issue_date, b.received_at::date) DESC, b.received_at DESC
          LIMIT 200`,
        [req.companyId]
      );
      return rows;
    });
    res.json({ bills: bills.map(serialize) });
  })
);

/**
 * Records a bill, without posting it.
 *
 * Two separate acts on purpose. Getting the bill in must be fast and must
 * never be blocked by a question, because the person holding it is standing on
 * a site. Deciding what it means — which supplier, how the tax was quoted — can
 * happen afterwards, at a desk, by somebody whose job that is.
 */
router.post(
  "/",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const parsed = billBody.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const b = parsed.data;

    let split;
    try {
      // An unknown treatment cannot be split yet, so the figure is held as the
      // gross until someone says what it means.
      split =
        b.gstTreatment === "unknown"
          ? { net: toLaari(b.amount), tax: 0n, gross: toLaari(b.amount) }
          : splitTax(b.amount, b.gstTreatment, b.gstRateBp ?? 800);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }

    const result = await asCompany(req, async (client) => {
      let counterpartyId = b.counterpartyId || null;

      // A name with no match becomes a supplier rather than blocking the
      // capture. Merging duplicates later is cheap; losing the bill is not.
      if (!counterpartyId && b.supplierName) {
        const { rows: match } = await client.query(
          `SELECT id FROM counterparties
            WHERE company_id = $1
              AND (lower(name) = lower($2) OR lower($2) = ANY (SELECT lower(x) FROM unnest(also_known_as) x))
            LIMIT 1`,
          [req.companyId, b.supplierName]
        );
        if (match.length) {
          counterpartyId = match[0].id;
        } else {
          const { rows: made } = await client.query(
            `INSERT INTO counterparties (company_id, name, kind)
             VALUES ($1,$2,'{supplier}') RETURNING id`,
            [req.companyId, b.supplierName]
          );
          counterpartyId = made[0].id;
        }
      }

      const { rows } = await client.query(
        `INSERT INTO bills
           (company_id, counterparty_id, bill_no, issue_date, due_date,
            net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp,
            project_id, billed_to_company, received_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::gst_t,$10,$11,$12,$13,
                 CASE WHEN $9 = 'unknown' THEN 'awaiting_review'::bill_t ELSE 'draft'::bill_t END)
         RETURNING *`,
        [
          req.companyId, counterpartyId, b.billNo || null, b.issueDate || null, b.dueDate || null,
          String(split.net), String(split.tax), String(split.gross),
          b.gstTreatment, b.gstRateBp ?? (b.gstTreatment === "inclusive" || b.gstTreatment === "exclusive" ? 800 : null),
          b.projectId || null, b.billedToCompany || null, req.user.id,
        ]
      );
      const bill = rows[0];

      // Warn now, while it can still be dealt with cheaply.
      const duplicates = await findPossibleDuplicates(client, {
        companyId: req.companyId,
        userId: req.user.id,
        bill: {
          id: bill.id,
          counterpartyId,
          billNo: bill.bill_no,
          grossLaari: BigInt(bill.gross_laari),
          issueDate: bill.issue_date,
        },
      });

      return { bill, duplicates };
    });

    res.status(201).json({
      bill: serialize(result.bill),
      duplicates: result.duplicates,
    });
  })
);

/** Puts a recorded bill into the books. */
router.post(
  "/:id/post",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const accounts = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT code, id FROM accounts WHERE company_id = $1 AND code IN ('5100','1400','2100')`,
        [req.companyId]
      );
      return Object.fromEntries(rows.map((r) => [r.code, r.id]));
    });

    if (!accounts["5100"] || !accounts["2100"]) {
      throw ApiError.badRequest(
        "This company has no chart of accounts yet, so there is nowhere to post to."
      );
    }

    try {
      const result = await asCompany(req, (client) =>
        postBill(client, {
          companyId: req.companyId,
          userId: req.user.id,
          billId: req.params.id,
          accounts: {
            expense: accounts["5100"],
            taxReclaimable: accounts["1400"],
            payable: accounts["2100"],
          },
        })
      );
      res.json({
        ok: true,
        entryNo: String(result.entry.entryNo),
        total: formatLaari(result.entry.totalLaari),
      });
    } catch (err) {
      // These are decisions a person has to make, not server faults.
      throw ApiError.badRequest(err.message);
    }
  })
);

/** Voided, never deleted — the same rule as every other money record. */
router.delete(
  "/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const reason = z.string().trim().min(3).max(500).safeParse(req.body?.reason);
    if (!reason.success) {
      throw ApiError.badRequest("Say why this bill is being voided.");
    }

    const voided = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `UPDATE bills
            SET voided_at = now(), void_reason = $3, status = 'discarded', updated_at = now()
          WHERE id = $1 AND company_id = $2 AND voided_at IS NULL
          RETURNING id, status, entry_id`,
        [req.params.id, req.companyId, reason.data]
      );
      return rows[0];
    });

    if (!voided) throw ApiError.notFound("Bill not found, or it was voided already");
    if (voided.entry_id) {
      // A posted bill's entry has to be reversed as well, and that is a
      // separate, deliberate act with its own entry in the journal.
      return res.json({
        ok: true,
        note: "This bill was already in the books. Reverse its journal entry to undo the money.",
        entryId: voided.entry_id,
      });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
