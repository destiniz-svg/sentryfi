/**
 * More than one currency.
 *
 * The books are kept in the company's own currency: every line's debit and
 * credit are in it, so every entry balances in one currency and every
 * statement adds up in one. A line that happened in another currency also
 * keeps what it was in that currency and the rate used, stored once and never
 * recomputed, so a figure from last year does not move when today's rate does.
 *
 * A foreign amount is in that currency's minor units (cents for USD), the same
 * way a rufiyaa amount is in laari.
 */

const FX_SQL = `
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS currency  CHAR(3);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS amount_fc BIGINT;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS fx_rate   NUMERIC(18,8);
DO $$ BEGIN
  ALTER TABLE journal_lines ADD CONSTRAINT line_fc_whole
    CHECK ((currency IS NULL AND amount_fc IS NULL AND fx_rate IS NULL)
        OR (currency IS NOT NULL AND amount_fc > 0 AND fx_rate > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A bill in another currency: what the paper says, in its own currency.
-- net_laari, tax_laari and gross_laari stay in the company's currency.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fc_net   BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fc_tax   BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fc_gross BIGINT;

-- Rates as somebody recorded them, by date. A suggestion for the next
-- document, never applied to one already recorded.
CREATE TABLE IF NOT EXISTS exchange_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency    CHAR(3) NOT NULL,
  on_date     DATE NOT NULL,
  rate        NUMERIC(18,8) NOT NULL,
  source      TEXT,
  set_by      UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_positive CHECK (rate > 0)
);
CREATE INDEX IF NOT EXISTS exchange_rates_lookup_idx ON exchange_rates(company_id, currency, on_date DESC);
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON exchange_rates;
CREATE POLICY company_isolation ON exchange_rates
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON exchange_rates TO sentryfi_app;
`;

module.exports = { FX_SQL };
