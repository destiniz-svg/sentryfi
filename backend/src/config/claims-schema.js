/**
 * Expense claims and payment runs.
 *
 * A claim is what someone spent from their own pocket for the business. Once
 * someone who approves has approved it, it is a cost of the business owed to
 * that person (2400) until paid back.
 *
 * A payment run pays chosen supplier bills and claims from one account on one
 * day, in one entry: what is owed goes down, the bank goes down, and each
 * bill or claim knows how much of it has been paid.
 */
const CLAIMS_SQL = `
CREATE TABLE IF NOT EXISTS expense_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  number        TEXT NOT NULL,
  claimant_id   UUID NOT NULL REFERENCES users(id),
  note          TEXT NOT NULL DEFAULT '',
  submitted_at  TIMESTAMPTZ,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  rejected_by   UUID REFERENCES users(id),
  rejected_at   TIMESTAMPTZ,
  rejected_why  TEXT,
  entry_id      UUID REFERENCES journal_entries(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);

CREATE TABLE IF NOT EXISTS expense_claim_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  claim_id      UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  spent_on      DATE NOT NULL,
  description   TEXT NOT NULL,
  account_id    UUID NOT NULL REFERENCES accounts(id),
  project_id    UUID REFERENCES projects(id),
  amount_laari  BIGINT NOT NULL CHECK (amount_laari > 0)
);

CREATE TABLE IF NOT EXISTS payment_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  paid_on          DATE NOT NULL,
  from_account_id  UUID NOT NULL REFERENCES accounts(id),
  reference        TEXT,
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  run_id        UUID NOT NULL REFERENCES payment_runs(id),
  bill_id       UUID REFERENCES bills(id),
  claim_id      UUID REFERENCES expense_claims(id),
  amount_laari  BIGINT NOT NULL CHECK (amount_laari > 0),
  CHECK ((bill_id IS NULL) <> (claim_id IS NULL))
);
CREATE INDEX IF NOT EXISTS payment_items_bill_idx ON payment_items(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_items_claim_idx ON payment_items(claim_id) WHERE claim_id IS NOT NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_claims','expense_claim_lines','payment_runs','payment_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON expense_claims TO sentryfi_app;
GRANT SELECT, INSERT, DELETE ON expense_claim_lines TO sentryfi_app;
GRANT SELECT, INSERT ON payment_runs, payment_items TO sentryfi_app;
-- A run whose entry was taken back (a bank line's answer undone): its payments no longer count.
ALTER TABLE payment_runs ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
GRANT UPDATE (reversed_at) ON payment_runs TO sentryfi_app;

-- A claim's receipts: the same attachments, stored once by hash, never changed.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES expense_claims(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS attachments_claim_idx ON attachments(claim_id) WHERE claim_id IS NOT NULL;
`;

module.exports = { CLAIMS_SQL };
