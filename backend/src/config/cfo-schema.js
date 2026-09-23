/**
 * The CFO: the morning brief kept per company per day (so everyone reads the
 * same one, and yesterday's can be looked back on), who wants it emailed and
 * when, and what the owner has told it about the business.
 */
const CFO_SQL = `
CREATE TABLE IF NOT EXISTS cfo_briefs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  for_date    DATE NOT NULL,
  body        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, for_date)
);

CREATE TABLE IF NOT EXISTS cfo_subscriptions (
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  send_hour     INTEGER NOT NULL DEFAULT 7 CHECK (send_hour BETWEEN 0 AND 23),
  email         BOOLEAN NOT NULL DEFAULT true,
  last_sent_on  DATE,
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS cfo_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  note        TEXT NOT NULL,
  written_by  UUID NOT NULL REFERENCES users(id),
  written_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, topic)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cfo_briefs','cfo_subscriptions','cfo_notes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON cfo_briefs, cfo_subscriptions, cfo_notes TO sentryfi_app;
GRANT DELETE ON cfo_subscriptions, cfo_notes TO sentryfi_app;
`;

module.exports = { CFO_SQL };
