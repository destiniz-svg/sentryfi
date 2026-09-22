/**
 * Dimensions: the things a line can be about besides its account — a branch,
 * a department, a machine or boat, or a kind a company names itself. Projects
 * keep their own table and column (they carry a budget); everything else is a
 * dimension. A line lists its dimensions in dimension_ids, so "which site lost
 * money" is answered from the ledger itself, not a second set of books.
 *
 * The line's hash covers its dimensions whenever it has any (post.js,
 * canonicalBytes v2), so they cannot be changed quietly after posting.
 */
const DIMENSIONS_SQL = `
CREATE TABLE IF NOT EXISTS dimensions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kind         TEXT NOT NULL CHECK (kind IN ('branch','department','machine','other')),
  name         TEXT NOT NULL,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dimensions_name_idx ON dimensions(company_id, kind, lower(name));

ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dimensions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON dimensions;
CREATE POLICY company_isolation ON dimensions
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON dimensions TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE ON projects TO sentryfi_app;

ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS dimension_ids UUID[];
CREATE INDEX IF NOT EXISTS journal_lines_dimensions_idx ON journal_lines USING GIN (dimension_ids);

-- Where lines get them from: the document they were posted for.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS dimension_ids UUID[];
ALTER TABLE cash_spends ADD COLUMN IF NOT EXISTS dimension_ids UUID[];
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS dimension_ids UUID[];
`;

module.exports = { DIMENSIONS_SQL };
