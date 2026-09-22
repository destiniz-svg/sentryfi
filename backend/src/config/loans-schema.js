/**
 * Money borrowed, and money lent to a director.
 *
 * A loan is its terms. What is still owed is never stored: it is the loan's
 * own account in the journal, the same as a bank or a tin. Each repayment is
 * one entry that splits into what reduced the debt and what it cost.
 */
const LOANS_SQL = `
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'loan';
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'loan_repayment';

CREATE TABLE IF NOT EXISTS loans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('bank_term','hire_purchase','finance_lease','trust_receipt',
                                              'director_in','director_out','murabaha','ijara','musharaka','other')),
  account_id    UUID NOT NULL REFERENCES accounts(id),
  principal_laari BIGINT NOT NULL CHECK (principal_laari > 0),
  rate_bp       INTEGER NOT NULL DEFAULT 0 CHECK (rate_bp >= 0 AND rate_bp <= 100000),
  rate_basis    TEXT NOT NULL DEFAULT 'reducing' CHECK (rate_basis IN ('reducing','flat')),
  method        TEXT NOT NULL DEFAULT 'annuity' CHECK (method IN ('annuity','equal_principal','none')),
  term_months   INTEGER CHECK (term_months IS NULL OR term_months > 0),
  starts_on     DATE NOT NULL,
  first_due     DATE,
  fee_laari     BIGINT NOT NULL DEFAULT 0 CHECK (fee_laari >= 0),
  entry_id      UUID REFERENCES journal_entries(id),
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loans_company_idx ON loans(company_id);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON loans;
CREATE POLICY company_isolation ON loans
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON loans TO sentryfi_app;
`;

module.exports = { LOANS_SQL };
