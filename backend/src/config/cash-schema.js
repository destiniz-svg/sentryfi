/**
 * Cash in somebody's hand.
 *
 * On a Maldivian site, a supervisor carries a few thousand rufiyaa in a tin
 * and spends it on the things that cannot wait for a purchase order: a boat
 * load of sand, a day's labour, lunch for the crew. Most of it comes back as
 * a scrap of paper, and some of it comes back as nothing at all. Until now
 * none of it could be recorded, so the books were complete about everything
 * except the money people actually handle.
 *
 * Two decisions shape this:
 *
 *   1. A cash box does not hold a balance. It names an account, and what is
 *      in the box is the sum of the journal lines on that account, exactly
 *      like every other figure. A box with its own running total would be a
 *      second copy of the truth, and the whole point of a cash box is that
 *      the physical tin is already a second copy — one that disagrees.
 *   2. A count is a record, not a correction. What somebody counted is kept
 *      as what they counted, and the difference against the books becomes its
 *      own entry with a reason on it. A count that silently adjusted the
 *      ledger would destroy the only evidence that money went missing.
 *
 * Each box has a holder, because "who is responsible for this tin" is the
 * question a count exists to answer, and it is not an accounting property.
 */

const CASH_SQL = `
CREATE TABLE IF NOT EXISTS cash_boxes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- The account this box's money lives in. Every figure about the box is read
  -- from here, never from a column on this row.
  account_id   UUID NOT NULL REFERENCES accounts(id),
  holder_id    UUID REFERENCES users(id),
  project_id   UUID REFERENCES projects(id),
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ,
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS cash_boxes_company_idx ON cash_boxes(company_id);

-- What somebody counted, and what the books said at that moment. Both are
-- kept: the difference is the finding, and a count that only stored the
-- difference could not be checked afterwards.
CREATE TABLE IF NOT EXISTS cash_counts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  box_id         UUID NOT NULL REFERENCES cash_boxes(id) ON DELETE CASCADE,
  counted_laari  BIGINT NOT NULL,
  expected_laari BIGINT NOT NULL,
  reason         TEXT,
  entry_id       UUID REFERENCES journal_entries(id),
  counted_by     UUID REFERENCES users(id),
  counted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT count_not_negative CHECK (counted_laari >= 0),
  -- A difference has to be explained. Money that is not there is the single
  -- most important thing a cash box can tell you, and "no reason given" is
  -- not an acceptable answer to it.
  CONSTRAINT count_difference_has_a_reason
    CHECK (counted_laari = expected_laari OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS cash_counts_box_idx ON cash_counts(box_id, counted_at DESC);

-- Asking for more. Not money until somebody gives it, so it holds no entry
-- until it is met.
DO $$ BEGIN
  CREATE TYPE topup_t AS ENUM ('asked','given','refused','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cash_topups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  box_id        UUID NOT NULL REFERENCES cash_boxes(id) ON DELETE CASCADE,
  asked_laari   BIGINT NOT NULL,
  given_laari   BIGINT,
  note          TEXT,
  status        topup_t NOT NULL DEFAULT 'asked',
  entry_id      UUID REFERENCES journal_entries(id),
  asked_by      UUID REFERENCES users(id),
  asked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_by    UUID REFERENCES users(id),
  settled_at    TIMESTAMPTZ,

  CONSTRAINT topup_positive CHECK (asked_laari > 0),
  CONSTRAINT topup_given_has_entry
    CHECK (status <> 'given' OR (entry_id IS NOT NULL AND given_laari IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cash_topups_open_idx
  ON cash_topups(company_id, status) WHERE status = 'asked';

-- A cash spend is a bill with no supplier and usually no paper. It is kept as
-- its own document rather than squeezed into bills, because the questions are
-- different: a bill asks who issued it and how its tax was quoted, and a
-- handful of cash asks who spent it and what for.
CREATE TABLE IF NOT EXISTS cash_spends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  box_id        UUID NOT NULL REFERENCES cash_boxes(id) ON DELETE CASCADE,
  amount_laari  BIGINT NOT NULL,
  what          TEXT NOT NULL,
  account_id    UUID NOT NULL REFERENCES accounts(id),
  project_id    UUID REFERENCES projects(id),
  counterparty_id UUID REFERENCES counterparties(id),
  entry_id      UUID REFERENCES journal_entries(id),
  spent_by      UUID REFERENCES users(id),
  spent_on      DATE NOT NULL DEFAULT current_date,
  voided_at     TIMESTAMPTZ,
  void_reason   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT spend_positive CHECK (amount_laari > 0)
);
CREATE INDEX IF NOT EXISTS cash_spends_box_idx ON cash_spends(box_id, spent_on DESC);

-- The paper, when there is any. A cash spend often has none, which is why
-- this is a nullable link on attachments rather than a requirement here.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS cash_spend_id UUID REFERENCES cash_spends(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS attachments_cash_spend_idx ON attachments(cash_spend_id);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_boxes','cash_counts','cash_topups','cash_spends']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO sentryfi_app', t);
  END LOOP;
END
$rls$;

-- A count and a spend are records of something that happened. Neither is ever
-- edited: a wrong count is followed by another count, and a wrong spend is
-- reversed like anything else that touched the books.
REVOKE DELETE ON cash_counts, cash_spends, cash_topups FROM sentryfi_app;
`;

module.exports = { CASH_SQL };
