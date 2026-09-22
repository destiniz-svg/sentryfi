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
`;

module.exports = { TAX_SQL };
