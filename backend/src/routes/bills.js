const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { reverseEntry } = require("../ledger/post");
const { splitTax, findPossibleDuplicates, postBill } = require("../ledger/bills");
const { findOrCreate, observe } = require("../ledger/counterparties");
const { toLaari, formatLaari } = require("../ledger/money");
const { uploadReceipt } = require("../middleware/upload");
const gemini = require("../services/geminiService");
const { aiLimiter } = require("../middleware/rateLimit");

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
  // Generated on the phone before there is any signal, so a send that is
  // retried after a lost response makes one bill rather than two.
  clientRef: z.string().uuid().nullish(),
  // What the document said about whoever sent it. All optional: a supplier is
  // never blocked on details it did not print.
  supplier: z
    .object({
      tin: z.string().trim().max(60).optional(),
      gst_number: z.string().trim().max(60).optional(),
      address: z.string().trim().max(400).optional(),
      phone: z.string().trim().max(60).optional(),
      email: z.string().trim().max(200).optional(),
      bank_account: z.string().trim().max(60).optional(),
      also_seen_as: z.string().trim().max(160).optional(),
    })
    .optional(),
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
  // Every scan is a paid call to the reader. The limiter used to sit only on
  // the purchased AI routes, so this one — the one actually in use — had none.
  aiLimiter,
  uploadReceipt("file"),
  asyncHandler(async (req, res) => {
    let read;
    try {
      read = await gemini.parseBill({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        // So it can tell which of the two businesses on the page is the
        // customer. Without this it has to guess, and it abstains instead.
        companyName: req.company?.name,
      });
    } catch (err) {
      // Every failure used to become "that could not be read", which is
      // useless advice when the photograph was fine, and the cause was never
      // logged — so a production failure left no trace at all. Log the real
      // thing, and say which kind of failure it was.
      const raw = String(err?.message || err);
      console.error(
        JSON.stringify({
          at: "bills/scan",
          company: req.companyId,
          mime: req.file?.mimetype,
          bytes: req.file?.size,
          error: raw.slice(0, 500),
        })
      );

      if (/GEMINI_API_KEY/i.test(raw)) {
        throw ApiError.badRequest(
          "Reading bills from a photo is not switched on yet. Type it in for now."
        );
      }
      if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(raw)) {
        throw ApiError.badRequest(
          "The key for reading bills was refused. Somebody needs to check it in the settings — the photograph is fine."
        );
      }
      if (/\b503\b|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
        throw ApiError.badRequest(
          "The reader is busy just now — nothing wrong with your photograph. Try again in a moment, or type it in."
        );
      }
      if (/quota|RESOURCE_EXHAUSTED|\b429\b|rate limit/i.test(raw)) {
        throw ApiError.badRequest(
          "Reading bills has hit its limit for now. Type this one in; it will work again shortly."
        );
      }
      if (/not found|NOT_FOUND|404|is not supported/i.test(raw)) {
        throw ApiError.badRequest(
          "The reader is misconfigured — the model it was told to use does not exist. Type it in for now."
        );
      }
      if (/SAFETY|blocked|recitation/i.test(raw)) {
        throw ApiError.badRequest(
          "The reader would not answer on that image. Type it in for now."
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
      // Sent before? Then this is the same bill arriving twice, not a second
      // one, and the answer is the bill that already exists.
      if (b.clientRef) {
        const { rows: already } = await client.query(
          `SELECT b.*, c.name AS supplier_name
             FROM bills b LEFT JOIN counterparties c ON c.id = b.counterparty_id
            WHERE b.company_id = $1 AND b.client_ref = $2`,
          [req.companyId, b.clientRef]
        );
        if (already.length) {
          return { bill: already[0], duplicates: [], learned: [], conflicts: [], alreadyHad: true };
        }
      }

      let counterpartyId = b.counterpartyId || null;
      let learned = [];
      let conflicts = [];

      // A name with nothing else is a perfectly good supplier. Getting the
      // bill recorded matters more than knowing everything about who sent it,
      // and merging two records later is cheap while losing the bill is not.
      if (!counterpartyId && (b.supplierName || b.supplier?.tin)) {
        const found = await findOrCreate(client, {
          companyId: req.companyId,
          userId: req.user.id,
          name: b.supplierName,
          tin: b.supplier?.tin,
        });
        counterpartyId = found.party.id;
      }

      // Whatever this document knew, the supplier's record now knows too.
      // Empty fields fill in silently; anything that disagrees with what is
      // already on file waits for a person rather than overwriting it.
      if (counterpartyId) {
        const taught = await observe(client, {
          companyId: req.companyId,
          userId: req.user.id,
          partyId: counterpartyId,
          facts: {
            name: b.supplierName,
            ...(b.supplier || {}),
            // Recorded as another name it answers to, not as its name.
            name_alias: b.supplier?.also_seen_as,
          },
          source: { kind: "bill" },
        });
        learned = taught.learned;
        conflicts = taught.conflicts;
      }

      const { rows } = await client.query(
        `INSERT INTO bills
           (company_id, counterparty_id, bill_no, issue_date, due_date,
            net_laari, tax_laari, gross_laari, gst_treatment, gst_rate_bp,
            project_id, billed_to_company, received_by, client_ref, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::gst_t,$10,$11,$12,$13,$14,
                 CASE WHEN $9 = 'unknown' THEN 'awaiting_review'::bill_t ELSE 'draft'::bill_t END)
         RETURNING *`,
        [
          req.companyId, counterpartyId, b.billNo || null, b.issueDate || null, b.dueDate || null,
          String(split.net), String(split.tax), String(split.gross),
          b.gstTreatment, b.gstRateBp ?? (b.gstTreatment === "inclusive" || b.gstTreatment === "exclusive" ? 800 : null),
          b.projectId || null, b.billedToCompany || null, req.user.id, b.clientRef || null,
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

      return { bill, duplicates, learned, conflicts };
    });

    // 200, not 201, when nothing was created. A phone retrying a send it was
    // never told the outcome of deserves a straight answer about which of the
    // two happened.
    res.status(result.alreadyHad ? 200 : 201).json({
      bill: serialize(result.bill),
      alreadyHad: Boolean(result.alreadyHad),
      duplicates: result.duplicates,
      // What the supplier's record learned from this bill, and anything it
      // refused to change on its own.
      learned: result.learned,
      conflicts: result.conflicts,
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
        // The entry itself, so the screen that just posted it can offer to
        // take it back without having to go looking for what it made.
        entryId: result.entry.id,
        entryNo: String(result.entry.entryNo),
        total: formatLaari(result.entry.totalLaari),
      });
    } catch (err) {
      // These are decisions a person has to make, not server faults.
      throw ApiError.badRequest(err.message);
    }
  })
);

/**
 * Takes a posted bill back out of the books.
 *
 * Not a delete and not an edit. The original entry stays exactly where it is
 * and a second, opposite entry is written next to it with a reason attached,
 * so the books show what happened and what was done about it. That is the
 * only honest way to undo money: an entry that disappears is an entry nobody
 * can audit, and the hash chain would notice anyway.
 *
 * This is what the ten-second undo on the phone calls. Ten seconds is short
 * enough that the reason is genuinely "that was the wrong bill", and the
 * reversal says so rather than inventing something.
 */
router.post(
  "/:id/reverse",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    const given = z.string().trim().min(3).max(500).safeParse(req.body?.reason);
    const reason = given.success ? given.data : null;

    const result = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT id, entry_id, status FROM bills WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.companyId]
      );
      const bill = rows[0];
      if (!bill) throw ApiError.notFound("Bill not found");
      if (!bill.entry_id) {
        throw ApiError.badRequest("This bill is not in the books, so there is nothing to reverse.");
      }

      const reversal = await reverseEntry(client, {
        companyId: req.companyId,
        userId: req.user.id,
        entryId: bill.entry_id,
        reason: reason || "Undone on the phone, within ten seconds of being recorded.",
      });

      // The bill goes back to being a document waiting on a decision. It is
      // not discarded: the paper is still real and somebody may well post it
      // again once whatever was wrong is fixed.
      await client.query(
        `UPDATE bills SET status = 'reversed', entry_id = NULL, updated_at = now()
          WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.companyId]
      );

      return reversal;
    });

    res.json({
      ok: true,
      entryNo: String(result.entryNo),
      note: "Taken back out of the books. Both entries stay in the journal.",
    });
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
      // A bill that is in the books cannot simply be marked void.
      //
      // It used to void the document and return a note saying "now go and
      // reverse its entry". Nobody did. The bill showed as void while its
      // expense and its payable were still in the books, so the list and the
      // ledger said different things about the same money — and what is owed
      // was overstated by exactly the bills somebody thought they had
      // cancelled. Found in Altura's own figures, put there by this route.
      //
      // Voiding is for a document that never touched the books. Money that
      // has moved comes back out the only honest way, through a reversal.
      const { rows: found } = await client.query(
        `SELECT id, entry_id, voided_at FROM bills WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.companyId]
      );
      const bill = found[0];
      if (!bill) throw ApiError.notFound("Bill not found");
      if (bill.voided_at) throw ApiError.badRequest("This bill was voided already.");
      if (bill.entry_id) {
        throw ApiError.badRequest(
          "This bill is in the books. Reverse it first — that writes the opposite " +
            "entry and takes the money back out — and then it can be voided."
        );
      }

      const { rows } = await client.query(
        `UPDATE bills
            SET voided_at = now(), void_reason = $3, status = 'discarded', updated_at = now()
          WHERE id = $1 AND company_id = $2 AND voided_at IS NULL
          RETURNING id, status`,
        [req.params.id, req.companyId, reason.data]
      );
      return rows[0];
    });

    if (!voided) throw ApiError.notFound("Bill not found, or it was voided already");
    res.json({ ok: true });
  })
);

module.exports = router;
