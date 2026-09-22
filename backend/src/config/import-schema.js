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

-- One live Zoho Books connection per company. The refresh token is a key to
-- somebody else's books, so it is stored encrypted, never returned by the API,
-- and deleted, not flagged, on disconnect.
CREATE TABLE IF NOT EXISTS zoho_connections (
  company_id        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  accounts_server   TEXT NOT NULL,
  api_domain        TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  organization_id   TEXT,
  organization_name TEXT,
  connected_by      UUID REFERENCES users(id),
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['imported_records','import_account_map','zoho_connections']
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
GRANT UPDATE (organization_id, organization_name) ON zoho_connections TO sentryfi_app;

-- Correcting what kind of account something is. No entry changes: every
-- journal line keeps pointing at the same account, and the statements read
-- the kind fresh each time. But it moves figures between the profit and loss
-- and the balance sheet, so each change is written down with its reason.
CREATE TABLE IF NOT EXISTS account_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id),
  from_type   TEXT NOT NULL,
  to_type     TEXT NOT NULL,
  from_code   TEXT NOT NULL,
  to_code     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE account_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_changes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON account_changes;
CREATE POLICY company_isolation ON account_changes
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON account_changes TO sentryfi_app;
GRANT UPDATE (type, code) ON accounts TO sentryfi_app;
GRANT DELETE ON zoho_connections TO sentryfi_app;
`;

module.exports = { IMPORT_SQL };
