/**
 * The auditor's workspace: a period under audit, with its seal checked, and
 * the samples drawn from it.
 *
 * Nothing here posts or changes the books. A sample is kept once drawn, so the
 * same one can be shown again; each item in it is ticked as seen, with a note.
 */
const AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS audit_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  from_date       DATE NOT NULL,
  to_date         DATE NOT NULL,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The seal, last checked: every entry intact since it was posted, or which are not.
  seal_checked_at TIMESTAMPTZ,
  seal_ok         BOOLEAN,
  seal_entries    INTEGER,
  seal_problems   JSONB,
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS audit_periods_company_idx ON audit_periods(company_id, to_date DESC);

CREATE TABLE IF NOT EXISTS audit_samples (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period_id   UUID NOT NULL REFERENCES audit_periods(id),
  kind        TEXT NOT NULL CHECK (kind IN ('bill','invoice','entry')),
  how         TEXT NOT NULL CHECK (how IN ('random','over')),
  size        INTEGER CHECK (size > 0),
  over_laari  BIGINT CHECK (over_laari >= 0),
  -- Out of how many there were to draw from, when it was drawn.
  population  INTEGER NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_samples_period_idx ON audit_samples(company_id, period_id);

CREATE TABLE IF NOT EXISTS audit_sample_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  sample_id   UUID NOT NULL REFERENCES audit_samples(id),
  doc_id      UUID NOT NULL,
  -- As it stood when drawn, so the sample reads the same later.
  doc_no      TEXT,
  doc_date    DATE,
  party       TEXT,
  amount_laari BIGINT NOT NULL,
  seen_by     UUID REFERENCES users(id),
  seen_at     TIMESTAMPTZ,
  note        TEXT,
  UNIQUE (sample_id, doc_id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_periods','audit_samples','audit_sample_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
-- 1.43.0: samples that can be re-drawn and proved. The seed and exact rule are
-- kept; the population's fingerprint says whether it is still the same one.
ALTER TABLE audit_samples ADD COLUMN IF NOT EXISTS seed TEXT;
ALTER TABLE audit_samples ADD COLUMN IF NOT EXISTS rule JSONB;
ALTER TABLE audit_samples ADD COLUMN IF NOT EXISTS population_laari BIGINT;
ALTER TABLE audit_samples ADD COLUMN IF NOT EXISTS population_hash TEXT;
ALTER TABLE audit_samples DROP CONSTRAINT IF EXISTS audit_samples_kind_check;
ALTER TABLE audit_samples ADD CONSTRAINT audit_samples_kind_check CHECK (kind IN ('bill','invoice','entry','payment','receipt','credit_note','claim'));
ALTER TABLE audit_samples DROP CONSTRAINT IF EXISTS audit_samples_how_check;
ALTER TABLE audit_samples ADD CONSTRAINT audit_samples_how_check CHECK (how IN ('random','over','key','mus','risk'));
-- Why each item was chosen (a key item, a monetary-unit hit, the risks it showed), and the entry behind it.
ALTER TABLE audit_sample_items ADD COLUMN IF NOT EXISTS why TEXT;
ALTER TABLE audit_sample_items ADD COLUMN IF NOT EXISTS entry_id UUID REFERENCES journal_entries(id);
-- 1.44.0: every audit pack made, by its fingerprint, so what was handed over can be shown later.
CREATE TABLE IF NOT EXISTS audit_packs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period_id   UUID NOT NULL REFERENCES audit_periods(id),
  sha256      TEXT NOT NULL,
  byte_size   BIGINT NOT NULL,
  files       INTEGER NOT NULL,
  made_by     UUID NOT NULL REFERENCES users(id),
  made_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE audit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_packs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_packs;
CREATE POLICY company_isolation ON audit_packs
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON audit_packs TO sentryfi_app;
GRANT SELECT, INSERT ON audit_periods, audit_samples, audit_sample_items TO sentryfi_app;
GRANT UPDATE (seal_checked_at, seal_ok, seal_entries, seal_problems) ON audit_periods TO sentryfi_app;
GRANT UPDATE (seen_by, seen_at, note) ON audit_sample_items TO sentryfi_app;
`;

module.exports = { AUDIT_SQL };
