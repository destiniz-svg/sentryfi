/**
 * History brought in from another system.
 *
 * Every imported transaction becomes an ordinary balanced entry, through
 * postEntry, with the same numbering and seal as everything else. What is
 * kept here is only the link back: which system it came from and that
 * system's own id, so importing the same year twice finds itself and adds
 * nothing. And the account mapping a person agreed, so the second file does
 * not ask the same questions as the first.
 */

const IMPORT_SQL = `
CREATE TABLE IF NOT EXISTS imported_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system       TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  entry_id     UUID NOT NULL REFERENCES journal_entries(id),
  imported_by  UUID REFERENCES users(id),
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, system, external_id)
);

CREATE TABLE IF NOT EXISTS import_account_map (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system       TEXT NOT NULL,
  their_name   TEXT NOT NULL,
  account_id   UUID NOT NULL REFERENCES accounts(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, system, their_name)
);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['imported_records','import_account_map']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO sentryfi_app', t);
  END LOOP;
END
$rls$;
`;

module.exports = { IMPORT_SQL };
