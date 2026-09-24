/**
 * Non-resident withholding tax. A supplier marked with a category has tax kept
 * back from each payment (ledger/payments.js), owed to the tax authority on
 * 2250 and listed here per payment for the monthly return. Append-only: a
 * payment taken back is excluded through its run, never edited out.
 */
const NWT_SQL = `
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS nwt_category TEXT;

CREATE TABLE IF NOT EXISTS nwt_withheld (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  bill_id          UUID REFERENCES bills(id),
  run_id           UUID NOT NULL REFERENCES payment_runs(id),
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  category         TEXT NOT NULL,
  rate_bp          INTEGER NOT NULL CHECK (rate_bp > 0 AND rate_bp <= 10000),
  gross_laari      BIGINT NOT NULL CHECK (gross_laari > 0),
  withheld_laari   BIGINT NOT NULL CHECK (withheld_laari > 0),
  paid_on          DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nwt_withheld_month_idx ON nwt_withheld(company_id, paid_on);

ALTER TABLE nwt_withheld ENABLE ROW LEVEL SECURITY;
ALTER TABLE nwt_withheld FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON nwt_withheld;
CREATE POLICY company_isolation ON nwt_withheld
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON nwt_withheld TO sentryfi_app;
`;

module.exports = { NWT_SQL };
