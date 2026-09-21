/**
 * What the bank said.
 *
 * A statement line is the bank's own record of one movement. It is kept as it
 * arrived and never edited: the only things that change afterwards are what a
 * person decided about it, and the database enforces that with column grants
 * rather than trusting the application to leave the rest alone.
 *
 * A line is not a journal entry. Importing a statement posts nothing. A line
 * becomes part of the books only when a person says what it was, and until
 * then the books and the bank disagree in plain sight, which is exactly what
 * reconciliation exists to show.
 *
 * The row hash is the identity: the same transaction arriving in two exports
 * that overlap lands once.
 */

const STATEMENT_SQL = `
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id),

  posted_on     DATE NOT NULL,
  value_on      DATE,
  kind          TEXT NOT NULL,
  bank_ref      TEXT,
  internal_ref  TEXT,
  happened_at   TIMESTAMP,
  remark        TEXT,
  who           TEXT,
  channel       TEXT,
  debit_laari   BIGINT NOT NULL DEFAULT 0,
  credit_laari  BIGINT NOT NULL DEFAULT 0,
  balance_laari BIGINT,
  flag          TEXT,
  row_hash      TEXT NOT NULL,
  imported_by   UUID REFERENCES users(id),
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- What a person decided. Leaving it for later is a decision too.
  status        TEXT NOT NULL DEFAULT 'open',
  entry_id      UUID REFERENCES journal_entries(id),
  decided_by    UUID REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  note          TEXT,

  UNIQUE (account_id, row_hash),
  CONSTRAINT line_amounts_not_negative CHECK (debit_laari >= 0 AND credit_laari >= 0),
  CONSTRAINT line_status_known CHECK (status IN ('open','matched','posted','set_aside')),
  -- Matched or posted means there is an entry to point at.
  CONSTRAINT line_decided_has_entry CHECK (status NOT IN ('matched','posted') OR entry_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS bank_lines_account_idx ON bank_statement_lines(company_id, account_id, posted_on);
CREATE INDEX IF NOT EXISTS bank_lines_open_idx ON bank_statement_lines(company_id, account_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS bank_lines_ref_idx ON bank_statement_lines(company_id, bank_ref);

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON bank_statement_lines;
CREATE POLICY company_isolation ON bank_statement_lines
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

-- The bank's fields are written once. Only the decision can change.
GRANT SELECT, INSERT ON bank_statement_lines TO sentryfi_app;
GRANT UPDATE (status, entry_id, decided_by, decided_at, note) ON bank_statement_lines TO sentryfi_app;
`;

module.exports = { STATEMENT_SQL };
