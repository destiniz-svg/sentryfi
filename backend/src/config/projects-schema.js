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

-- Variations: changes to the contract, proposed then approved or rejected.
-- Only approved ones change what the contract is worth; omissions are negative.
CREATE TABLE IF NOT EXISTS project_variations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id    UUID NOT NULL REFERENCES projects(id),
  number        INTEGER NOT NULL,
  description   TEXT NOT NULL,
  amount_laari  BIGINT NOT NULL CHECK (amount_laari <> 0),
  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  decided_on    DATE,
  decided_by    UUID REFERENCES users(id),
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, number)
);

-- The bill of quantities: what the contract is priced from, item by item.
CREATE TABLE IF NOT EXISTS project_boq (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id    UUID NOT NULL REFERENCES projects(id),
  ref           TEXT,
  description   TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'item',
  quantity      NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  rate_laari    BIGINT NOT NULL CHECK (rate_laari >= 0),
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A claim measured from it: how much of each item is done, to date.
CREATE TABLE IF NOT EXISTS project_claim_measures (
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  claim_id      UUID NOT NULL REFERENCES project_claims(id),
  boq_id        UUID NOT NULL REFERENCES project_boq(id),
  done          NUMERIC(18,4) NOT NULL CHECK (done >= 0),
  PRIMARY KEY (claim_id, boq_id)
);

-- Hours worked on a project. Kept, not posted: wages reach the books through
-- bills or payroll, and posting hours too would count them twice.
CREATE TABLE IF NOT EXISTS project_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_id    UUID NOT NULL REFERENCES projects(id),
  worked_on     DATE NOT NULL,
  who           TEXT NOT NULL,
  hours         NUMERIC(8,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  rate_laari    BIGINT CHECK (rate_laari IS NULL OR rate_laari >= 0),
  note          TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_budgets','project_commitments','project_claims','project_variations','project_boq','project_claim_measures','project_hours'] LOOP
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
GRANT SELECT, INSERT, UPDATE ON project_variations TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_boq TO sentryfi_app;
GRANT SELECT, INSERT ON project_claim_measures TO sentryfi_app;
GRANT SELECT, INSERT, DELETE ON project_hours TO sentryfi_app;
`;

module.exports = { PROJECTS_SQL };
