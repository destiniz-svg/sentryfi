/**
 * Multi-currency, finished: invoices in another currency, money received in
 * it, and month-end revaluation.
 *
 * An invoice in dollars keeps its dollar figures and the rate it was raised at;
 * its rufiyaa figures are those at that rate. A receipt in dollars keeps its
 * dollars and the day's rate; what each allocation settled is kept in both.
 * The difference between the two rates is a realised exchange gain or loss.
 * What is still open at a month end is restated at that month's rate by a
 * revaluation entry (source "revaluation").
 */
const CURRENCY_SQL = `
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'revaluation';

ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18,8);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS fc_net BIGINT;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS fc_tax BIGINT;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS fc_gross BIGINT;
ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS fc_net BIGINT;

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS currency CHAR(3);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS amount_fc BIGINT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(18,8);
ALTER TABLE receipt_allocations ADD COLUMN IF NOT EXISTS amount_fc BIGINT;

-- What each revaluation moved, per account and currency. Its journal lines are
-- plain own-currency lines (a foreign line must carry a foreign amount), so
-- this is how the next month knows what value is already on the books.
CREATE TABLE IF NOT EXISTS revaluations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  account_id   UUID NOT NULL REFERENCES accounts(id),
  currency     CHAR(3) NOT NULL,
  on_date      DATE NOT NULL,
  rate         NUMERIC(18,8) NOT NULL,
  amount_laari BIGINT NOT NULL,
  entry_id     UUID NOT NULL REFERENCES journal_entries(id)
);
CREATE INDEX IF NOT EXISTS revaluations_idx ON revaluations(company_id, account_id, currency);
ALTER TABLE revaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE revaluations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON revaluations;
CREATE POLICY company_isolation ON revaluations
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON revaluations TO sentryfi_app;
`;

module.exports = { CURRENCY_SQL };
