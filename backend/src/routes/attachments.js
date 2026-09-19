const express = require("express");
const crypto = require("crypto");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { uploadReceipt } = require("../middleware/upload");

const router = express.Router();
router.use(requireAuth, requireCompany);

/**
 * Keeping the paper behind a record.
 *
 * A document is addressed by the hash of its own contents, so the same
 * photograph filed twice is stored once and an altered file is simply a
 * different file — there is no version of a document, only documents.
 *
 * Nothing here updates or deletes. A supporting document is not editable, and
 * removing one is removing evidence. The database withholds both permissions
 * from the application as well, so a bug cannot do it either.
 */

/** Attach a file to a bill. */
router.post(
  "/bills/:id",
  requireCan("record"),
  uploadReceipt("file"),
  asyncHandler(async (req, res) => {
    const sha = crypto.createHash("sha256").update(req.file.buffer).digest();

    const result = await asCompany(req, async (client) => {
      const { rows: bill } = await client.query(
        "SELECT id FROM bills WHERE id = $1 AND company_id = $2",
        [req.params.id, req.companyId]
      );
      if (!bill.length) return null;

      // Store the bytes once per company. A second upload of the same
      // photograph finds the row already there and adds only the reference.
      await client.query(
        `INSERT INTO attachment_blobs (company_id, sha256, bytes, byte_size, content_type)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, sha256) DO NOTHING`,
        [req.companyId, sha, req.file.buffer, req.file.size, req.file.mimetype]
      );

      const { rows } = await client.query(
        `INSERT INTO attachments
           (company_id, bill_id, filename, content_type, byte_size, sha256, storage_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, filename, content_type, byte_size, uploaded_at`,
        [
          req.companyId,
          req.params.id,
          req.file.originalname || "bill",
          req.file.mimetype,
          req.file.size,
          sha,
          // Where the bytes are. When they move, this is how anyone can tell
          // which ones already have.
          `pg:${sha.toString("hex")}`,
          req.user.id,
        ]
      );
      return rows[0];
    });

    if (!result) throw ApiError.notFound("No such bill in these books");
    res.status(201).json({ attachment: result });
  })
);

/** What paper a bill has. Never the bytes — those come one at a time. */
router.get(
  "/bills/:id",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT a.id, a.filename, a.content_type, a.byte_size, a.uploaded_at,
                u.name AS uploaded_by
           FROM attachments a
           LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE a.company_id = $1 AND a.bill_id = $2
          ORDER BY a.uploaded_at ASC`,
        [req.companyId, req.params.id]
      );
      return found;
    });
    res.json({ attachments: rows });
  })
);

/**
 * The document itself.
 *
 * Served inline so a person can look at it beside the figures rather than
 * downloading it first, and with a long cache because a document addressed by
 * its own hash can never change.
 */
router.get(
  "/:id/file",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const file = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT b.bytes, b.content_type, a.filename, b.byte_size
           FROM attachments a
           JOIN attachment_blobs b
             ON b.company_id = a.company_id AND b.sha256 = a.sha256
          WHERE a.id = $1 AND a.company_id = $2`,
        [req.params.id, req.companyId]
      );
      return rows[0] || null;
    });

    if (!file) throw ApiError.notFound("No such document in these books");

    res.setHeader("Content-Type", file.content_type);
    res.setHeader("Content-Length", file.byte_size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(file.filename).replace(/[^\w.\- ]/g, "_")}"`
    );
    // Private: this is one company's document and must never sit in a shared
    // cache. Immutable: the hash is the address, so the bytes cannot change.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(file.bytes);
  })
);

module.exports = router;
