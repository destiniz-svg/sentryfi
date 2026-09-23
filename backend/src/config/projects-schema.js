/**
 * Projects, construction first: the contract (customer, value, retention),
 * a budget by kind of cost, what has been committed to subcontractors and
 * suppliers, and the progress claims with what was certified against each.
 *
 * Spent is not stored: it is the project's cost lines in the ledger. Revenue
 * comes from certification: the certificate less retention is invoiced; the
 * retention is revenue too, but held by the customer (1310) until released,
 * when it is invoiced in its turn.
 */
const PROJECTS_SQL = `
ALTER TABLE projects ADD COLUMN IF NOT EXISTS counterparty_id UUID REFERENCES counterparties(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_laari BIGINT CHECK (contract_laari IS NULL OR contract_laari >= 0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS retention_bp INTEGER NOT NULL DEFAULT 0 CHECK (retention_bp BETWEEN 0 AND 5000);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS retention_cap_bp INTEGER CHECK (retention_cap_bp IS NULL OR retention_cap_bp BETWEEN 0 AND 5000);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ends_on DATE;

CREATE TABLE IF NOT EXISTS project_budgets (
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id),
  amount_laari  BIGINT NOT NULL CHECK (amount_laari >= 0),
  PRIMARY KEY (project_id, account_id)
);

CREATE TABLE IF NOT EXISTS project_commitments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id       UUID NOT NULL REFERENCES projects(id),
  counterparty_id  UUID REFERENCES counterparties(id),
  description      TEXT NOT NULL,
  account_id       UUID NOT NULL REFERENCES accounts(id),
  amount_laari     BIGINT NOT NULL CHECK (amount_laari > 0),
  closed_at        TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS commitment_id UUID REFERENCES project_commitments(id);

CREATE TABLE IF NOT EXISTS project_claims (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id                UUID NOT NULL REFERENCES projects(id),
  number                    INTEGER NOT NULL,
  period_to                 DATE NOT NULL,
  -- Cumulative, as a construction claim is: the value of all work done to date.
  claimed_to_date_laari     BIGINT NOT NULL CHECK (claimed_to_date_laari >= 0),
  certified_to_date_laari   BIGINT CHECK (certified_to_date_laari IS NULL OR certified_to_date_laari >= 0),
  certified_on              DATE,
  certificate_laari         BIGINT,
  retention_laari           BIGINT,
  invoice_id                UUID REFERENCES sales_invoices(id),
  retention_entry_id        UUID REFERENCES journal_entries(id),
  created_by                UUID NOT NULL REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, number)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_budgets','project_commitments','project_claims'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_budgets TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE ON project_commitments TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE ON project_claims TO sentryfi_app;
`;

module.exports = { PROJECTS_SQL };
