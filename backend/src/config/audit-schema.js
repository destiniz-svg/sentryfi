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
-- 1.45.0: the auditor's questions, each an ask on a record's conversation, kept against its period.
CREATE TABLE IF NOT EXISTS audit_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period_id   UUID NOT NULL REFERENCES audit_periods(id),
  comment_id  UUID NOT NULL UNIQUE REFERENCES comments(id),
  kind        TEXT NOT NULL,
  record_id   UUID NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_questions_period_idx ON audit_questions(company_id, period_id);
ALTER TABLE audit_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_questions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_questions;
CREATE POLICY company_isolation ON audit_questions
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON audit_questions TO sentryfi_app;
-- 1.46.0: materiality, set by the auditor, and proposed adjustments (ISA 450).
ALTER TABLE audit_periods ADD COLUMN IF NOT EXISTS materiality_laari BIGINT CHECK (materiality_laari > 0);
ALTER TABLE audit_periods ADD COLUMN IF NOT EXISTS performance_laari BIGINT CHECK (performance_laari > 0);
ALTER TABLE audit_periods ADD COLUMN IF NOT EXISTS trivial_laari BIGINT CHECK (trivial_laari >= 0);
GRANT UPDATE (materiality_laari, performance_laari, trivial_laari) ON audit_periods TO sentryfi_app;

CREATE TABLE IF NOT EXISTS audit_adjustments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period_id     UUID NOT NULL REFERENCES audit_periods(id),
  number        INTEGER NOT NULL,
  class         TEXT NOT NULL CHECK (class IN ('factual','judgemental','projected')),
  reason        TEXT NOT NULL CHECK (length(btrim(reason)) >= 3),
  -- [{ accountId, debit, credit, memo }] in laari, as proposed; never changed after.
  lines         JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','passed','rejected','withdrawn')),
  proposed_by   UUID NOT NULL REFERENCES users(id),
  proposed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    UUID REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  entry_id      UUID REFERENCES journal_entries(id),
  UNIQUE (period_id, number),
  -- Decided once, by someone other than the one who proposed it; an accepted one has its entry.
  CHECK (status = 'proposed' OR decided_at IS NOT NULL),
  CHECK (status <> 'accepted' OR entry_id IS NOT NULL),
  CHECK (decided_by IS NULL OR status = 'withdrawn' OR decided_by <> proposed_by)
);
ALTER TABLE audit_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_adjustments;
CREATE POLICY company_isolation ON audit_adjustments
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON audit_adjustments TO sentryfi_app;
GRANT UPDATE (status, decided_by, decided_at, decision_note, entry_id) ON audit_adjustments TO sentryfi_app;
GRANT SELECT, INSERT ON audit_periods, audit_samples, audit_sample_items TO sentryfi_app;
GRANT UPDATE (seal_checked_at, seal_ok, seal_entries, seal_problems) ON audit_periods TO sentryfi_app;
GRANT UPDATE (seen_by, seen_at, note) ON audit_sample_items TO sentryfi_app;

-- 1.47.0: external confirmations (ISA 505). The auditor chooses whom to ask, checks the address, and
-- sends; the company only authorises. Replies are kept where only the auditor can read them.
CREATE TABLE IF NOT EXISTS audit_confirmations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period_id        UUID NOT NULL REFERENCES audit_periods(id),
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  side             TEXT NOT NULL CHECK (side IN ('receivable','payable')),
  -- blank: they state the balance (stronger evidence); balance: they agree or not with ours.
  form             TEXT NOT NULL DEFAULT 'blank' CHECK (form IN ('blank','balance')),
  book_laari       BIGINT NOT NULL,
  email            TEXT,
  email_checked    BOOLEAN NOT NULL DEFAULT false,
  email_check_note TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','authorised','refused','sent','replied','closed')),
  authorised_by    UUID REFERENCES users(id),
  authorised_at    TIMESTAMPTZ,
  refused_reason   TEXT,
  sent_by          UUID REFERENCES users(id),
  sent_at          TIMESTAMPTZ,
  requests         INTEGER NOT NULL DEFAULT 0,
  outcome          TEXT CHECK (outcome IN ('agreed','explained','alternative')),
  outcome_note     TEXT,
  outcome_by       UUID REFERENCES users(id),
  outcome_at       TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, counterparty_id, side)
);
ALTER TABLE audit_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_confirmations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_confirmations;
CREATE POLICY company_isolation ON audit_confirmations
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON audit_confirmations TO sentryfi_app;
GRANT UPDATE (form, book_laari, email, email_checked, email_check_note, status, authorised_by, authorised_at, refused_reason, sent_by, sent_at, requests, outcome, outcome_note, outcome_by, outcome_at)
  ON audit_confirmations TO sentryfi_app;

-- The private links, found before anyone is known: outside the company walls, and the app role cannot touch them.
CREATE TABLE IF NOT EXISTS audit_confirmation_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_id  UUID NOT NULL REFERENCES audit_confirmations(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  opened_at        TIMESTAMPTZ,
  used_at          TIMESTAMPTZ
);
REVOKE ALL ON audit_confirmation_links FROM sentryfi_app;
-- When a request's link was last opened: the one fact about links the app may read, for its own company only.
CREATE OR REPLACE FUNCTION audit_confirmation_opened(cid UUID) RETURNS TIMESTAMPTZ
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT MAX(opened_at) FROM audit_confirmation_links
   WHERE confirmation_id = cid AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
$f$;
REVOKE ALL ON FUNCTION audit_confirmation_opened(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_confirmation_opened(UUID) TO sentryfi_app;

-- The replies: read only by someone in the company who holds the Auditor role, and never changed.
CREATE TABLE IF NOT EXISTS audit_confirmation_replies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  confirmation_id  UUID NOT NULL UNIQUE REFERENCES audit_confirmations(id),
  agrees           BOOLEAN,
  their_laari      BIGINT,
  note             TEXT,
  responder_name   TEXT NOT NULL,
  responder_role   TEXT,
  file_name        TEXT,
  file_type        TEXT,
  file_bytes       BYTEA,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip               TEXT,
  user_agent       TEXT
);
ALTER TABLE audit_confirmation_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_confirmation_replies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_confirmation_replies;
DROP POLICY IF EXISTS auditor_only ON audit_confirmation_replies;
CREATE POLICY auditor_only ON audit_confirmation_replies
  USING (
    company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = audit_confirmation_replies.company_id
                AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid AND m.role = 'auditor')
  )
  WITH CHECK (
    company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = audit_confirmation_replies.company_id
                AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid AND m.role = 'auditor')
  );
GRANT SELECT, INSERT ON audit_confirmation_replies TO sentryfi_app;
CREATE OR REPLACE FUNCTION audit_reply_is_final() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'A confirmation reply is kept as it came, never changed or removed';
END $f$;
DROP TRIGGER IF EXISTS audit_reply_is_final ON audit_confirmation_replies;
CREATE TRIGGER audit_reply_is_final BEFORE UPDATE OR DELETE ON audit_confirmation_replies FOR EACH ROW EXECUTE FUNCTION audit_reply_is_final();

-- 1.48.0: the auditor at the year-end count (ISA 501). Attending is visible to the company; the
-- auditor's own test counts are not, so nobody counting can copy them.
CREATE TABLE IF NOT EXISTS audit_observations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  period_id     UUID NOT NULL REFERENCES audit_periods(id),
  count_id      UUID NOT NULL REFERENCES stock_counts(id),
  observed_by   UUID NOT NULL REFERENCES users(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- What had been recorded when the auditor arrived: the last goods in and out, bill, invoice and stock move.
  cutoff        JSONB NOT NULL,
  seed          TEXT NOT NULL,
  instructions  TEXT,
  conclusion    TEXT,
  concluded_at  TIMESTAMPTZ,
  UNIQUE (period_id, count_id)
);
ALTER TABLE audit_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_observations;
CREATE POLICY company_isolation ON audit_observations
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON audit_observations TO sentryfi_app;
GRANT UPDATE (instructions, conclusion, concluded_at) ON audit_observations TO sentryfi_app;

CREATE TABLE IF NOT EXISTS audit_test_counts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  observation_id  UUID NOT NULL REFERENCES audit_observations(id),
  item_id         UUID NOT NULL REFERENCES stock_items(id),
  -- sheet_to_floor: picked from what the books hold (existence); floor_to_sheet: seen on the floor (completeness).
  direction       TEXT NOT NULL CHECK (direction IN ('sheet_to_floor','floor_to_sheet')),
  picked_why      TEXT,
  qty             NUMERIC(18,4) CHECK (qty >= 0),
  recorded_by     UUID REFERENCES users(id),
  recorded_at     TIMESTAMPTZ,
  note            TEXT,
  UNIQUE (observation_id, item_id, direction)
);
ALTER TABLE audit_test_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_test_counts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON audit_test_counts;
DROP POLICY IF EXISTS auditor_only ON audit_test_counts;
CREATE POLICY auditor_only ON audit_test_counts
  USING (
    company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = audit_test_counts.company_id
                AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid AND m.role = 'auditor')
  )
  WITH CHECK (
    company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    AND EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = audit_test_counts.company_id
                AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid AND m.role = 'auditor')
  );
GRANT SELECT, INSERT ON audit_test_counts TO sentryfi_app;
GRANT UPDATE (qty, recorded_by, recorded_at, note) ON audit_test_counts TO sentryfi_app;
`;

module.exports = { AUDIT_SQL };
