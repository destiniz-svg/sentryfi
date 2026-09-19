/**
 * The paper.
 *
 * A bill without its document is a figure somebody typed. MIRA requires the
 * supporting paper kept for five years, and an auditor's first question is to
 * see it.
 *
 * The bytes live in Postgres. That is not the fashionable answer, and it is
 * the right one here:
 *
 *   - The nightly dump becomes the archive. One thing to back up, one thing to
 *     restore, and a document can never drift away from the entry it supports
 *     or be deleted from a bucket nobody was watching.
 *   - No second service, no credentials to rotate, no object-storage bill.
 *   - At Altura's volume — a few hundred bills a month at a few hundred
 *     kilobytes — this is tens of megabytes a year. It stops being the right
 *     answer at thousands a month, and because everything goes through one
 *     small interface addressed by hash, that move is a migration rather than
 *     a rewrite. `storage_key` records where the bytes are so the day it
 *     changes is expressible rather than archaeological.
 *
 * **Dedup is per company, deliberately.** Addressing by content hash alone
 * would let two companies share a row, which means one company's storage could
 * reveal that another holds the same document. Isolation is worth more than
 * the few megabytes deduplication would save, so the key is the company and
 * the hash together and nothing is ever shared across the wall.
 */

const ATTACHMENTS_SQL = `
CREATE TABLE IF NOT EXISTS attachment_blobs (
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sha256       BYTEA NOT NULL,
  bytes        BYTEA NOT NULL,
  byte_size    BIGINT NOT NULL,
  content_type TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, sha256),
  CONSTRAINT blob_has_content CHECK (byte_size > 0),
  -- Multer refuses anything larger before it reaches here; this is the second
  -- line, because a row that cannot be dumped is a backup that cannot run.
  CONSTRAINT blob_not_absurd CHECK (byte_size <= 20971520)
);

-- storage_key was NOT NULL for a location that did not exist yet.
ALTER TABLE attachments ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS page INTEGER;

ALTER TABLE attachment_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment_blobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON attachment_blobs;
CREATE POLICY company_isolation ON attachment_blobs
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT ON attachment_blobs TO sentryfi_app;
-- Deliberately withheld: UPDATE and DELETE. A supporting document is not
-- editable, and removing one is removing evidence.
REVOKE UPDATE, DELETE ON attachment_blobs FROM sentryfi_app;
REVOKE UPDATE, DELETE ON attachments FROM sentryfi_app;
`;

module.exports = { ATTACHMENTS_SQL };
