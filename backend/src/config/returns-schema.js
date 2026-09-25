/**
 * Goods or a charge sent back to a supplier (a purchase return, or the
 * supplier's credit note for it). It takes part of a bill back: what is owed
 * to the supplier, the cost or stock, and the GST claimed, in the same shares
 * the bill put them in. Kept like the books: added, never changed.
 */
const RETURNS_SQL = `
CREATE TABLE IF NOT EXISTS supplier_returns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id  UUID REFERENCES counterparties(id),
  bill_id          UUID NOT NULL REFERENCES bills(id),
  number           TEXT NOT NULL,
  reason           TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  issue_date       DATE NOT NULL,
  -- The supplier's own credit note number, when they send one.
  supplier_ref     TEXT,
  net_laari        BIGINT NOT NULL CHECK (net_laari >= 0),
  tax_laari        BIGINT NOT NULL CHECK (tax_laari >= 0),
  gross_laari      BIGINT NOT NULL CHECK (gross_laari > 0),
  items            JSONB NOT NULL DEFAULT '[]',
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  raised_by        UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS supplier_returns_bill_idx ON supplier_returns(company_id, bill_id);
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON supplier_returns;
CREATE POLICY company_isolation ON supplier_returns
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON supplier_returns TO sentryfi_app;

-- What has gone back on a bill, so every "still owed" reads the same figure.
CREATE OR REPLACE FUNCTION bill_returned(b UUID) RETURNS BIGINT
  LANGUAGE sql STABLE AS $f$
    SELECT COALESCE(SUM(gross_laari), 0)::bigint FROM supplier_returns WHERE bill_id = b
  $f$;
`;

module.exports = { RETURNS_SQL };
