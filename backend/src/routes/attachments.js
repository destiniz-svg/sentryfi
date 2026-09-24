const express = require("express");
const crypto = require("crypto");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { uploadReceipt, uploadDocument } = require("../middleware/upload");

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
  requireCan("record", "capture"),
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

/**
 * A receipt on an expense claim. The person who made the claim may add them
 * (the companion app sends them with the claim); so may anyone who records.
 */
router.post(
  "/claims/:id",
  requireCan("capture", "record", "spend_cash", "order", "read"),
  uploadReceipt("file"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such claim in these books");
    const sha = crypto.createHash("sha256").update(req.file.buffer).digest();
    const result = await asCompany(req, async (client) => {
      const { rows: claim } = await client.query("SELECT claimant_id FROM expense_claims WHERE id = $1 AND company_id = $2", [req.params.id, req.companyId]);
      if (!claim.length) return null;
      if (claim[0].claimant_id !== req.user.id && !req.can("record")) throw ApiError.forbidden("Only the person who made the claim adds its receipts.");
      await client.query(
        `INSERT INTO attachment_blobs (company_id, sha256, bytes, byte_size, content_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id, sha256) DO NOTHING`,
        [req.companyId, sha, req.file.buffer, req.file.size, req.file.mimetype]
      );
      const { rows } = await client.query(
        `INSERT INTO attachments (company_id, claim_id, filename, content_type, byte_size, sha256, storage_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, filename, content_type, byte_size, uploaded_at`,
        [req.companyId, req.params.id, req.file.originalname || "receipt", req.file.mimetype, req.file.size, sha, `pg:${sha.toString("hex")}`, req.user.id]
      );
      return rows[0];
    });
    if (!result) throw ApiError.notFound("No such claim in these books");
    res.status(201).json({ attachment: result });
  })
);

/** A claim's receipts: to the person who claimed, and to anyone who reads the books. */
router.get(
  "/claims/:id",
  requireCan("capture", "record", "spend_cash", "order", "read"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such claim in these books");
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT a.id, a.filename, a.content_type, a.byte_size, a.uploaded_at
           FROM attachments a JOIN expense_claims c ON c.id = a.claim_id
          WHERE a.company_id = $1 AND a.claim_id = $2 AND ($3 OR c.claimant_id = $4)
          ORDER BY a.uploaded_at`,
        [req.companyId, req.params.id, req.can("read"), req.user.id]
      );
      return found;
    });
    res.json({ attachments: rows });
  })
);

/** An order's papers, and an imported entry's: what came across with them. */
for (const [path, column] of [["/orders/:id", "order_id"], ["/entries/:id", "entry_id"]]) {
  router.get(
    path,
    requireCan("read"),
    asyncHandler(async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("Not in these books");
      const rows = await asCompany(req, async (client) => {
        const { rows: found } = await client.query(
          `SELECT id, filename, content_type, byte_size, uploaded_at FROM attachments WHERE company_id = $1 AND ${column} = $2 ORDER BY uploaded_at`,
          [req.companyId, req.params.id]
        );
        return found;
      });
      res.json({ attachments: rows });
    })
  );
}

/** Every file brought in from another system, with what it is filed against. */
router.get(
  "/imported",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT a.id, a.filename, a.content_type, a.byte_size, a.uploaded_at,
                o.id AS order_id, o.number AS order_number, e.entry_no, e.narrative
           FROM attachments a
           LEFT JOIN orders o ON o.id = a.order_id
           LEFT JOIN journal_entries e ON e.id = a.entry_id
          WHERE a.company_id = $1 AND (a.order_id IS NOT NULL OR a.entry_id IS NOT NULL)
          ORDER BY a.uploaded_at DESC LIMIT 500`,
        [req.companyId]
      );
      return found;
    });
    res.json({
      attachments: rows.map((r) => ({
        id: r.id, filename: r.filename, contentType: r.content_type, size: Number(r.byte_size),
        filedAgainst: r.order_number ? `Purchase order ${r.order_number}` : r.entry_no ? `Entry ${r.entry_no}: ${String(r.narrative || "").replace(/^From \w+: /, "")}` : null,
        orderId: r.order_id,
      })),
    });
  })
);

/**
 * Papers on anything else that needs them: what each kind is filed against,
 * how to be sure the record is this company's, and who may attach. A person's
 * papers on the payroll (contract, ID, work permit) are payroll's alone.
 */
const DOCS = {
  invoice: { col: "sales_invoice_id", check: "SELECT 1 FROM sales_invoices WHERE id = $1 AND company_id = $2", shareable: true },
  quote: { col: "order_id", check: "SELECT 1 FROM orders WHERE id = $1 AND company_id = $2 AND kind = 'quote'", shareable: true },
  sales_order: { col: "order_id", check: "SELECT 1 FROM orders WHERE id = $1 AND company_id = $2 AND kind = 'sale'", shareable: true },
  purchase_order: { col: "order_id", check: "SELECT 1 FROM orders WHERE id = $1 AND company_id = $2 AND kind = 'purchase'", shareable: true },
  proforma: { col: "advance_request_id", check: "SELECT 1 FROM advance_requests WHERE id = $1 AND company_id = $2 AND kind = 'proforma'", shareable: true },
  retainer: { col: "advance_request_id", check: "SELECT 1 FROM advance_requests WHERE id = $1 AND company_id = $2 AND kind = 'retainer'", shareable: true },
  credit_note: { col: "credit_note_id", check: "SELECT 1 FROM credit_notes WHERE id = $1 AND company_id = $2", shareable: true },
  shipment: { col: "shipment_id", check: "SELECT 1 FROM shipments WHERE id = $1 AND company_id = $2" },
  project: { col: "project_id", check: "SELECT 1 FROM projects WHERE id = $1 AND company_id = $2" },
  employee: { col: "employee_id", check: "SELECT 1 FROM employees WHERE id = $1 AND company_id = $2", need: "run_payroll" },
};
const docOf = (req) => {
  const d = DOCS[req.params.kind];
  if (!d || !/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("Not in these books");
  if (d.need && !req.can(d.need)) throw ApiError.forbidden("Those papers are payroll's.");
  return d;
};
const shape = (r) => ({ id: r.id, filename: r.filename, contentType: r.content_type, size: Number(r.byte_size), at: r.uploaded_at, by: r.uploaded_by_name || null, shared: r.shared });

/** A record's papers, newest last, leaving out any taken off. */
router.get(
  "/doc/:kind/:id",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const d = docOf(req);
    const rows = await asCompany(req, async (client) => {
      const { rows: found } = await client.query(
        `SELECT a.id, a.filename, a.content_type, a.byte_size, a.uploaded_at, a.shared, u.name AS uploaded_by_name
           FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE a.company_id = $1 AND a.${d.col} = $2 AND a.hidden_at IS NULL ORDER BY a.uploaded_at`,
        [req.companyId, req.params.id]
      );
      return found;
    });
    res.json({ attachments: rows.map(shape), shareable: Boolean(d.shareable) });
  })
);

/** Attaching a paper: stored once per company by its hash, filed against the record. */
router.post(
  "/doc/:kind/:id",
  requireCan("record"),
  uploadDocument("file"),
  asyncHandler(async (req, res) => {
    const d = docOf(req);
    const sha = crypto.createHash("sha256").update(req.file.buffer).digest();
    const row = await asCompany(req, async (client) => {
      const { rows: mine } = await client.query(d.check, [req.params.id, req.companyId]);
      if (!mine.length) return null;
      await client.query(
        "INSERT INTO attachment_blobs (company_id, sha256, bytes, byte_size, content_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id, sha256) DO NOTHING",
        [req.companyId, sha, req.file.buffer, req.file.size, req.file.mimetype]
      );
      const { rows } = await client.query(
        `INSERT INTO attachments (company_id, ${d.col}, filename, content_type, byte_size, sha256, storage_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, filename, content_type, byte_size, uploaded_at, shared`,
        [req.companyId, req.params.id, String(req.file.originalname || "document").slice(0, 200), req.file.mimetype, req.file.size, sha, `pg:${sha.toString("hex")}`, req.user.id]
      );
      return rows[0];
    });
    if (!row) throw ApiError.notFound("Not in these books");
    res.status(201).json({ attachment: shape(row) });
  })
);

/** Shown to the other side or not; taken off or put back. The file itself never changes. */
router.patch(
  "/:id",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw ApiError.notFound("No such document in these books");
    const shared = typeof req.body?.shared === "boolean" ? req.body.shared : null;
    const hidden = typeof req.body?.hidden === "boolean" ? req.body.hidden : null;
    const done = await asCompany(req, async (client) => {
      const { rows } = await client.query("SELECT employee_id, sales_invoice_id, order_id, advance_request_id, credit_note_id FROM attachments WHERE id = $1 AND company_id = $2", [req.params.id, req.companyId]);
      const a = rows[0];
      if (!a) return null;
      if (a.employee_id && !req.can("run_payroll")) throw ApiError.forbidden("Those papers are payroll's.");
      if (shared && !(a.sales_invoice_id || a.order_id || a.advance_request_id || a.credit_note_id)) throw ApiError.badRequest("Only papers on a document that is sent can be shown to the other side.");
      await client.query(
        "UPDATE attachments SET shared = COALESCE($3, shared), hidden_at = CASE WHEN $4::boolean IS NULL THEN hidden_at WHEN $4 THEN COALESCE(hidden_at, now()) ELSE NULL END WHERE id = $1 AND company_id = $2",
        [req.params.id, req.companyId, shared, hidden]
      );
      return true;
    });
    if (!done) throw ApiError.notFound("No such document in these books");
    res.json({ ok: true });
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
  requireCan("capture", "record", "spend_cash", "order", "read"),
  asyncHandler(async (req, res) => {
    const file = await asCompany(req, async (client) => {
      // Anyone who reads the books; otherwise only a receipt on your own claim.
      const { rows } = await client.query(
        `SELECT b.bytes, b.content_type, a.filename, b.byte_size
           FROM attachments a
           JOIN attachment_blobs b
             ON b.company_id = a.company_id AND b.sha256 = a.sha256
           LEFT JOIN expense_claims c ON c.id = a.claim_id
          WHERE a.id = $1 AND a.company_id = $2 AND ($3 OR c.claimant_id = $4) AND (a.employee_id IS NULL OR $5)`,
        [req.params.id, req.companyId, req.can("read"), req.user.id, req.can("run_payroll")]
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
    // Not kept on the device: a shared site phone must not hold a bill after
    // its reader signs out (security review, 23 September 2026).
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.bytes);
  })
);

/** Papers the company chose to show with a document, for its portal page or link (read inside the walls). */
async function sharedFiles(client, { companyId, kind, documentId }) {
  const d = DOCS[kind];
  if (!d?.shareable) return [];
  const { rows } = await client.query(
    `SELECT id, filename, content_type, byte_size, uploaded_at, shared FROM attachments WHERE company_id = $1 AND ${d.col} = $2 AND shared AND hidden_at IS NULL ORDER BY uploaded_at`,
    [companyId, documentId]
  );
  return rows.map((r) => ({ id: r.id, filename: r.filename, contentType: r.content_type, size: Number(r.byte_size) }));
}
/** One of those papers, if it is shown with that document. */
async function sharedFile(client, { companyId, kind, documentId, attachmentId }) {
  const d = DOCS[kind];
  if (!d?.shareable || !/^[0-9a-f-]{36}$/i.test(String(attachmentId))) return null;
  const { rows } = await client.query(
    `SELECT b.bytes, b.content_type, a.filename, b.byte_size FROM attachments a JOIN attachment_blobs b ON b.company_id = a.company_id AND b.sha256 = a.sha256
      WHERE a.id = $1 AND a.company_id = $2 AND a.${d.col} = $3 AND a.shared AND a.hidden_at IS NULL`,
    [attachmentId, companyId, documentId]
  );
  return rows[0] || null;
}
/** Sends a file's bytes to a browser, inline, never cached. */
function sendFile(res, file) {
  res.setHeader("Content-Type", file.content_type);
  res.setHeader("Content-Length", file.byte_size);
  res.setHeader("Content-Disposition", `inline; filename="${String(file.filename).replace(/[^\w.\- ]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(file.bytes);
}

module.exports = router;
module.exports.sharedFiles = sharedFiles;
module.exports.sharedFile = sharedFile;
module.exports.sendFile = sendFile;
