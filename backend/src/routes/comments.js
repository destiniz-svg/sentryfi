const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany } = require("../middleware/company");
const { uploadDocument } = require("../middleware/upload");
const { asCompany } = require("../ledger/session");
const comments = require("../ledger/comments");

/**
 * The team's conversation on a record (/api/comments). Open to every member;
 * who sees which conversation is decided per record in ledger/comments.js.
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

const uuid = z.string().uuid();

/** A comment's file, for anyone who can see that conversation. */
router.get(
  "/files/:fileId",
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.fileId).success) throw ApiError.notFound("No such file.");
    const file = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT c.kind, c.record_id, b.bytes, b.content_type, a.filename, b.byte_size
           FROM attachments a JOIN comments c ON c.id = a.comment_id
           JOIN attachment_blobs b ON b.company_id = a.company_id AND b.sha256 = a.sha256
          WHERE a.id = $1 AND a.company_id = $2 AND c.removed_at IS NULL`,
        [req.params.fileId, req.companyId]
      );
      if (!rows.length) return null;
      await comments.access(client, req, { kind: rows[0].kind, id: rows[0].record_id });
      return rows[0];
    });
    if (!file) throw ApiError.notFound("No such file.");
    res.setHeader("Content-Type", file.content_type);
    res.setHeader("Content-Length", file.byte_size);
    res.setHeader("Content-Disposition", `inline; filename="${String(file.filename).replace(/[^\w.\- ]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.bytes);
  })
);

router.get(
  "/asks",
  asyncHandler(async (req, res) => {
    const view = req.query.view === "asked" ? "asked" : "waiting";
    res.json({ asks: await asCompany(req, (client) => comments.asks(client, req, { view })) });
  })
);

router.get(
  "/:kind/:id",
  asyncHandler(async (req, res) => {
    res.json(await asCompany(req, (client) => comments.thread(client, req, req.params)));
  })
);

router.get(
  "/:kind/:id/people",
  asyncHandler(async (req, res) => {
    res.json({ people: await asCompany(req, (client) => comments.people(client, req, req.params)) });
  })
);

/** A file with a comment: added by whoever wrote it. (Before /:kind/:id, which would take this path too.) */
router.post(
  "/:commentId/files",
  uploadDocument("file"),
  asyncHandler(async (req, res) => {
    const sha = crypto.createHash("sha256").update(req.file.buffer).digest();
    const row = await asCompany(req, async (client) => {
      const { rows } = await client.query("SELECT user_id, removed_at FROM comments WHERE id = $1 AND company_id = $2", [req.params.commentId, req.companyId]);
      if (!rows.length || rows[0].user_id !== req.user.id || rows[0].removed_at) throw ApiError.forbidden("Files go with your own comments.");
      await client.query(
        "INSERT INTO attachment_blobs (company_id, sha256, bytes, byte_size, content_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id, sha256) DO NOTHING",
        [req.companyId, sha, req.file.buffer, req.file.size, req.file.mimetype]
      );
      const { rows: a } = await client.query(
        `INSERT INTO attachments (company_id, comment_id, filename, content_type, byte_size, sha256, storage_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, filename`,
        [req.companyId, req.params.commentId, String(req.file.originalname || "file").slice(0, 200), req.file.mimetype, req.file.size, sha, `pg:${sha.toString("hex")}`, req.user.id]
      );
      return a[0];
    });
    res.status(201).json({ file: row });
  })
);

const newComment = z.object({
  body: z.string().min(1).max(4000),
  mentions: z.array(uuid).max(20).default([]),
  askOf: uuid.nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  letIn: z.array(uuid).max(20).default([]),
});

router.post(
  "/:kind/:id",
  asyncHandler(async (req, res) => {
    const p = newComment.safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Write something first.");
    const id = await asCompany(req, (client) => comments.post(client, req, { ...req.params, ...p.data }));
    res.status(201).json({ id });
  })
);

router.post(
  "/:kind/:id/follow",
  asyncHandler(async (req, res) => {
    const on = req.body?.on !== false;
    await asCompany(req, async (client) => {
      await comments.access(client, req, req.params);
      await comments.follow(client, { companyId: req.companyId, kind: req.params.kind, id: req.params.id, userId: req.user.id, on, force: true });
    });
    res.json({ following: on });
  })
);

router.patch(
  "/:commentId",
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    await asCompany(req, async (client) => {
      if (typeof b.body === "string") await comments.edit(client, req, req.params.commentId, b.body);
      if (b.removed === true) await comments.remove(client, req, req.params.commentId);
      if (typeof b.done === "boolean") await comments.settle(client, req, req.params.commentId, b.done);
    });
    res.json({ ok: true });
  })
);

module.exports = router;
