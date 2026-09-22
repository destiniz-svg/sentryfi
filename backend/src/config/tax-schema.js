/**
 * Which tax pack a company keeps its books under, and its own rate changes.
 *
 * The pack's rates live in code (ledger/tax.js), reviewed and dated. A row
 * here is a company saying "from this date, this rate": when the law moves
 * before the pack does, or on the generic pack where there is no law to ship.
 * Append-only, like every other record of something decided.
 */

const TAX_SQL = `
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_pack TEXT NOT NULL DEFAULT 'MV';

CREATE TABLE IF NOT EXISTS tax_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rate_code      TEXT NOT NULL,
  rate_bp        INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  reason         TEXT,
  set_by         UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tax_rate_credible CHECK (rate_bp BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS tax_rates_lookup_idx ON tax_rates(company_id, rate_code, effective_from DESC);

ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON tax_rates;
CREATE POLICY company_isolation ON tax_rates
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON tax_rates TO sentryfi_app;

-- How often this company files: a month or a quarter, set by turnover.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_period TEXT NOT NULL DEFAULT 'month';
DO $$ BEGIN
  ALTER TABLE companies ADD CONSTRAINT gst_period_known CHECK (gst_period IN ('month','quarter'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- The two filing facts an administrator sets. Only these columns: the rest of
-- a company's record is not the application's to rewrite.
GRANT UPDATE (gst_period, gst_number) ON companies TO sentryfi_app;

-- A return somebody says they filed. The countdown stops for that period, and
-- the figures that went in are kept, so a later change to the books shows up
-- as a difference rather than silently rewriting what was filed.
CREATE TABLE IF NOT EXISTS gst_filings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_key     TEXT NOT NULL,
  period_from    DATE NOT NULL,
  period_to      DATE NOT NULL,
  output_laari   BIGINT NOT NULL,
  input_laari    BIGINT NOT NULL,
  reference      TEXT,
  filed_by       UUID NOT NULL REFERENCES users(id),
  filed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_key)
);
ALTER TABLE gst_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_filings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON gst_filings;
CREATE POLICY company_isolation ON gst_filings
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON gst_filings TO sentryfi_app;
`;

module.exports = { TAX_SQL };
