/**
 * Costs passed on: a bill's cost or a claim's line marked for a customer waits
 * on that customer's next invoice. See ledger/passOn.js.
 */
const PASSON_SQL = `
ALTER TABLE bill_charges ADD COLUMN IF NOT EXISTS for_customer_id UUID REFERENCES counterparties(id);
ALTER TABLE bill_charges ADD COLUMN IF NOT EXISTS markup_bp INTEGER NOT NULL DEFAULT 0 CHECK (markup_bp BETWEEN 0 AND 100000);
ALTER TABLE expense_claim_lines ADD COLUMN IF NOT EXISTS for_customer_id UUID REFERENCES counterparties(id);
ALTER TABLE expense_claim_lines ADD COLUMN IF NOT EXISTS markup_bp INTEGER NOT NULL DEFAULT 0 CHECK (markup_bp BETWEEN 0 AND 100000);

-- Which invoice took a cost. A voided invoice lets it go again.
CREATE TABLE IF NOT EXISTS passed_on (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  invoice_id      UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  bill_charge_id  UUID REFERENCES bill_charges(id) ON DELETE CASCADE,
  claim_line_id   UUID REFERENCES expense_claim_lines(id) ON DELETE CASCADE,
  CHECK ((bill_charge_id IS NULL) <> (claim_line_id IS NULL))
);
CREATE INDEX IF NOT EXISTS passed_on_charge_idx ON passed_on(bill_charge_id);
CREATE INDEX IF NOT EXISTS passed_on_claim_idx ON passed_on(claim_line_id);

ALTER TABLE passed_on ENABLE ROW LEVEL SECURITY;
ALTER TABLE passed_on FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON passed_on;
CREATE POLICY company_isolation ON passed_on
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON passed_on TO sentryfi_app;

-- Repeating bills share the schedules of repeat billing.
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale','bill'));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES recurring_invoices(id);
`;

module.exports = { PASSON_SQL };
