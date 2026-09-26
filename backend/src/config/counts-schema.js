/**
 * Counting sessions: a place's stock counted by a named person, blind.
 *
 * A session is a full count of a place, a cycle count of the items due, or a
 * spot check of a few picked at random. Each line keeps what was counted and
 * what the books said at that place at the moment it was counted, so a sale
 * during the count makes no false difference. The counter sees neither the
 * books nor the difference until they submit. Differences within the
 * company's tolerance post at once; larger ones wait for someone other than
 * the counter. A posted line points at its entry; nothing posted changes.
 */
const COUNTS_SQL = `
-- A difference worth more than this (either way) waits for a second person. MVR 500 unless changed.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS count_tolerance_laari BIGINT NOT NULL DEFAULT 50000 CHECK (count_tolerance_laari >= 0);

CREATE TABLE IF NOT EXISTS stock_counts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  place_id      UUID REFERENCES stock_places(id),
  kind          TEXT NOT NULL CHECK (kind IN ('full','cycle','spot')),
  status        TEXT NOT NULL DEFAULT 'counting' CHECK (status IN ('counting','submitted','posted','cancelled')),
  counter       UUID NOT NULL REFERENCES users(id),
  note          TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  decided_by    UUID REFERENCES users(id),
  decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stock_counts_open_idx ON stock_counts(company_id, status);
-- One open count at a place at a time.
CREATE UNIQUE INDEX IF NOT EXISTS stock_counts_one_open_idx ON stock_counts(company_id, COALESCE(place_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('counting','submitted');

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  count_id    UUID NOT NULL REFERENCES stock_counts(id),
  item_id     UUID NOT NULL REFERENCES stock_items(id),
  counted     NUMERIC(18,4) CHECK (counted >= 0),
  book        NUMERIC(18,4),
  counted_at  TIMESTAMPTZ,
  reason      TEXT,
  -- What the difference was worth at average cost when submitted, signed.
  value_laari BIGINT,
  entry_id    UUID REFERENCES journal_entries(id),
  UNIQUE (count_id, item_id)
);
CREATE INDEX IF NOT EXISTS stock_count_lines_item_idx ON stock_count_lines(company_id, item_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_counts','stock_count_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON stock_counts, stock_count_lines TO sentryfi_app;
`;

module.exports = { COUNTS_SQL };
