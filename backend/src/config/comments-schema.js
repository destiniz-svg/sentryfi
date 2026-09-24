/**
 * The team talking about a record: a comment on an invoice, a bill, a bank
 * line, a pay run; @mentions that tell someone; and asks, which are comments
 * someone has to answer (open until they reply, done when either side says so).
 *
 * Kept like the books: a comment is never deleted. An edit keeps what it said
 * before, and taking one down leaves a line saying who did.
 */
const COMMENTS_SQL = `
CREATE TABLE IF NOT EXISTS comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kind         TEXT NOT NULL,
  record_id    UUID NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  mentions     UUID[] NOT NULL DEFAULT '{}',
  -- An ask: who has to answer, and by when.
  asked_of     UUID REFERENCES users(id),
  due_on       DATE,
  answered_at  TIMESTAMPTZ,
  done_at      TIMESTAMPTZ,
  done_by      UUID REFERENCES users(id),
  -- What it said before each edit, oldest first.
  earlier      JSONB NOT NULL DEFAULT '[]',
  edited_at    TIMESTAMPTZ,
  removed_at   TIMESTAMPTZ,
  removed_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_record_idx ON comments(company_id, kind, record_id, created_at);
CREATE INDEX IF NOT EXISTS comments_asks_idx ON comments(company_id, asked_of) WHERE asked_of IS NOT NULL AND done_at IS NULL;

-- Who hears about a record's conversation. Written when someone comments, is
-- mentioned or is asked; anyone can switch it off. A guest is someone let in
-- to this one conversation who cannot open the record itself.
CREATE TABLE IF NOT EXISTS record_followers (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  record_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following   BOOLEAN NOT NULL DEFAULT true,
  guest_by    UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, kind, record_id, user_id)
);

-- A file sent with a comment.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES comments(id);
CREATE INDEX IF NOT EXISTS attachments_comment_idx ON attachments(comment_id) WHERE comment_id IS NOT NULL;

-- Emailed once in the daily round-up, for people who have not seen it in the app.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['comments','record_followers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT ON comments, record_followers TO sentryfi_app;
-- The words can change (the old ones are kept in earlier); who wrote it, where and when never do.
GRANT UPDATE (body, earlier, edited_at, removed_at, removed_by, answered_at, done_at, done_by) ON comments TO sentryfi_app;
GRANT UPDATE (following, guest_by) ON record_followers TO sentryfi_app;
`;

module.exports = { COMMENTS_SQL };
