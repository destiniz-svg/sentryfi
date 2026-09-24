/**
 * Closing the books.
 *
 * Until a month can be closed there is no such thing as a final figure: every
 * report is provisional forever, because somebody could still post into March
 * in September and the March that was reported is no longer the March in the
 * books. So a period is closed through a date, and the database refuses an
 * entry dated on or before it.
 *
 * Three decisions.
 *
 *   1. The rule lives in the database, as a trigger on the journal, not in
 *      the application. The application is the only door to the journal, but
 *      "the only door" is a convention, and a closed period is exactly what an
 *      auditor will ask to see enforced.
 *   2. Closing and reopening are rows in an append-only log, never edits. The
 *      lock date is whatever the latest row says. Reopening is therefore an
 *      act with a name and a reason on it, and the history of every close and
 *      reopen is there to be read, not reconstructed.
 *   3. An adjustment into a closed period is possible but deliberate. It has
 *      to say why, the reason is recorded against the entry it produced, and
 *      it goes through the same balanced, numbered, sealed door as everything
 *      else. Nothing is ever edited into a closed month; something is added
 *      to it, on the record.
 */

const PERIOD_SQL = `
CREATE TABLE IF NOT EXISTS period_locks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            BIGINT GENERATED ALWAYS AS IDENTITY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  -- The lock date after this act. NULL means nothing is closed any more.
  locked_through DATE,
  reason         TEXT,
  by_user        UUID NOT NULL REFERENCES users(id),
  at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lock_action_known CHECK (action IN ('close','reopen')),
  -- A period is a month. The lock date is the last day of one.
  CONSTRAINT lock_is_a_month_end CHECK (
    locked_through IS NULL OR EXTRACT(day FROM locked_through + 1) = 1),
  CONSTRAINT lock_close_has_a_date CHECK (action <> 'close' OR locked_through IS NOT NULL),
  -- Reopening is an act with a name and a reason on it.
  CONSTRAINT lock_reopen_has_a_reason CHECK (
    action <> 'reopen' OR (reason IS NOT NULL AND length(btrim(reason)) >= 3))
);
CREATE INDEX IF NOT EXISTS period_locks_company_idx ON period_locks(company_id, seq DESC);

-- What was posted into a closed period, and why.
CREATE TABLE IF NOT EXISTS period_adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_id          UUID NOT NULL UNIQUE REFERENCES journal_entries(id),
  reason            TEXT NOT NULL,
  locked_through    DATE NOT NULL,
  by_user           UUID NOT NULL REFERENCES users(id),
  at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT adjustment_has_a_reason CHECK (length(btrim(reason)) >= 3)
);
CREATE INDEX IF NOT EXISTS period_adjustments_company_idx ON period_adjustments(company_id, at DESC);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['period_locks','period_adjustments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
    -- Append-only. A close, a reopen and an adjustment are things that
    -- happened; a wrong one is followed by another act, never edited.
    EXECUTE format('GRANT SELECT, INSERT ON %I TO sentryfi_app', t);
  END LOOP;
END
$rls$;

-- The date the books are closed through, or NULL. The latest act decides.
CREATE OR REPLACE FUNCTION books_locked_through(p_company UUID) RETURNS DATE AS $fn$
  SELECT locked_through FROM period_locks WHERE company_id = p_company ORDER BY seq DESC LIMIT 1
$fn$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION refuse_closed_period() RETURNS trigger AS $fn$
DECLARE lock_date DATE;
BEGIN
  lock_date := books_locked_through(NEW.company_id);
  IF lock_date IS NOT NULL AND NEW.entry_date <= lock_date
     AND COALESCE(current_setting('app.closed_period_reason', true), '') = '' THEN
    RAISE EXCEPTION 'The books are closed through %. An entry dated % needs a deliberate adjustment, with a reason.',
      to_char(lock_date, 'DD Mon YYYY'), to_char(NEW.entry_date, 'DD Mon YYYY')
      USING HINT = 'closed_period';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entries_refuse_closed_period ON journal_entries;
CREATE TRIGGER journal_entries_refuse_closed_period
  BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION refuse_closed_period();

-- Each bank account's reconciliation at a month end, kept when the month is
-- closed: the bank's closing balance, the books', and what was unexplained.
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  account_id    UUID NOT NULL REFERENCES accounts(id),
  through       DATE NOT NULL,
  statement_on  DATE NOT NULL,
  bank_laari    BIGINT NOT NULL,
  books_laari   BIGINT NOT NULL,
  open_lines    INTEGER NOT NULL,
  open_laari    BIGINT NOT NULL,
  by_user       UUID REFERENCES users(id),
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_reconciliations_idx ON bank_reconciliations(company_id, through DESC);
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON bank_reconciliations;
CREATE POLICY company_isolation ON bank_reconciliations
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON bank_reconciliations TO sentryfi_app;

-- A line joining an entry dated in a closed month is refused the same way: the
-- rule is about the month an amount lands in, and a balancing pair of lines
-- added to an old entry would land there too. A deliberate adjustment keeps
-- its reason set until all its lines are written (ledger/post.js).
CREATE OR REPLACE FUNCTION refuse_closed_period_line() RETURNS trigger AS $fn$
DECLARE lock_date DATE; dated DATE;
BEGIN
  lock_date := books_locked_through(NEW.company_id);
  IF lock_date IS NULL THEN RETURN NEW; END IF;
  SELECT entry_date INTO dated FROM journal_entries WHERE id = NEW.entry_id;
  IF dated <= lock_date AND COALESCE(current_setting('app.closed_period_reason', true), '') = '' THEN
    RAISE EXCEPTION 'The books are closed through %. A line on an entry dated % needs a deliberate adjustment, with a reason.',
      to_char(lock_date, 'DD Mon YYYY'), to_char(dated, 'DD Mon YYYY')
      USING HINT = 'closed_period';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_lines_refuse_closed_period ON journal_lines;
CREATE TRIGGER journal_lines_refuse_closed_period
  BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION refuse_closed_period_line();
`;

module.exports = { PERIOD_SQL };
