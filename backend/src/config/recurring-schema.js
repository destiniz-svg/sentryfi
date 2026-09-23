/**
 * Repeat billing: invoices raised on a schedule. See ledger/recurring.js.
 */
const RECURRING_SQL = `
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id     UUID NOT NULL REFERENCES counterparties(id),
  project_id          UUID REFERENCES projects(id),
  name                TEXT NOT NULL,
  lines               JSONB NOT NULL,
  gst_treatment       gst_t NOT NULL DEFAULT 'exclusive',
  every               TEXT NOT NULL CHECK (every IN ('week','month','quarter','year')),
  next_on             DATE NOT NULL,
  anchor_day          INTEGER NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
  ends_on             DATE,
  post_automatically  BOOLEAN NOT NULL DEFAULT false,
  paused_at           TIMESTAMPTZ,
  last_run_at         TIMESTAMPTZ,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_due_idx ON recurring_invoices(next_on) WHERE paused_at IS NULL;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES recurring_invoices(id);

ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON recurring_invoices;
CREATE POLICY company_isolation ON recurring_invoices
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON recurring_invoices TO sentryfi_app;
`;

module.exports = { RECURRING_SQL };
