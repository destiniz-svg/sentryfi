/**
 * Fixed assets: what the business owns and uses for more than a year.
 *
 * The register says what each asset cost, how long it is expected to last and
 * how it wears out. Its value in the books is never stored: it is the asset
 * account less the depreciation posted against it, read from journal lines
 * like every other figure. asset_depreciation records which months have been
 * charged, one row per asset per month, so running depreciation twice charges
 * nothing twice.
 */
const ASSETS_SQL = `
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'asset';
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'depreciation';
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'asset_disposal';

CREATE TABLE IF NOT EXISTS fixed_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  asset_account_id  UUID NOT NULL REFERENCES accounts(id),
  worn_account_id   UUID NOT NULL REFERENCES accounts(id),
  cost_laari        BIGINT NOT NULL CHECK (cost_laari > 0),
  residual_laari    BIGINT NOT NULL DEFAULT 0 CHECK (residual_laari >= 0),
  acquired_on       DATE NOT NULL,
  life_months       INTEGER NOT NULL CHECK (life_months > 0),
  method            TEXT NOT NULL DEFAULT 'straight_line' CHECK (method IN ('straight_line','reducing_balance')),
  rate_bp           INTEGER CHECK (rate_bp IS NULL OR (rate_bp > 0 AND rate_bp <= 10000)),
  entry_id          UUID REFERENCES journal_entries(id),
  disposed_on       DATE,
  proceeds_laari    BIGINT,
  disposal_entry_id UUID REFERENCES journal_entries(id),
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (residual_laari < cost_laari)
);
CREATE INDEX IF NOT EXISTS fixed_assets_company_idx ON fixed_assets(company_id);

CREATE TABLE IF NOT EXISTS asset_depreciation (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id     UUID NOT NULL REFERENCES fixed_assets(id),
  month        DATE NOT NULL,
  amount_laari BIGINT NOT NULL CHECK (amount_laari > 0),
  entry_id     UUID NOT NULL REFERENCES journal_entries(id),
  UNIQUE (asset_id, month)
);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fixed_assets','asset_depreciation']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
  END LOOP;
END
$rls$;

GRANT SELECT, INSERT, UPDATE ON fixed_assets TO sentryfi_app;
GRANT SELECT, INSERT ON asset_depreciation TO sentryfi_app;
`;

module.exports = { ASSETS_SQL };
