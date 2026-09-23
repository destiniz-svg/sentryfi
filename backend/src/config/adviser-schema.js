/**
 * The adviser: what each charge on a bill is (stock, a cost, or something the
 * business will use for years), asked when unsure and remembered once said.
 *
 * bills.read_lines keeps the lines read off the paper. bill_charges holds the
 * decided cost and asset lines (stock lines stay in bill_stock_lines).
 * charge_rules is what has been learned: for this supplier, a charge that
 * reads like this is that.
 */
const ADVISER_SQL = `
ALTER TABLE bills ADD COLUMN IF NOT EXISTS read_lines JSONB;

CREATE TABLE IF NOT EXISTS bill_charges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  bill_id          UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('cost','asset')),
  description      TEXT NOT NULL DEFAULT '',
  account_id       UUID REFERENCES accounts(id),
  asset_category   TEXT,
  asset_life_years NUMERIC(6,2) CHECK (asset_life_years IS NULL OR asset_life_years > 0),
  -- Before tax, in the bill's own currency, as printed.
  amount_laari     BIGINT NOT NULL CHECK (amount_laari > 0),
  position         INTEGER NOT NULL DEFAULT 0,
  CHECK ((kind = 'cost' AND account_id IS NOT NULL) OR (kind = 'asset' AND asset_category IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS bill_charges_bill_idx ON bill_charges(bill_id);
ALTER TABLE bill_stock_lines ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS charge_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  match_key        TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('stock','cost','asset')),
  item_id          UUID REFERENCES stock_items(id),
  account_id       UUID REFERENCES accounts(id),
  asset_category   TEXT,
  asset_life_years NUMERIC(6,2),
  times            INTEGER NOT NULL DEFAULT 1,
  last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, counterparty_id, match_key)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bill_charges','charge_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, DELETE ON bill_charges TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE ON charge_rules TO sentryfi_app;
-- A reversed bill takes an asset it put on the register back off, if nothing
-- has been charged against it yet.
GRANT DELETE ON fixed_assets TO sentryfi_app;
`;

module.exports = { ADVISER_SQL };
