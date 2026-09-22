/**
 * The walls the security review of 23 September 2026 found missing. Applied
 * last, so it has the final word over grants made earlier.
 *
 * - companies: the app role could read every company's name, TIN and GST
 *   number, and update any row's GST fields. Now it sees its own company and
 *   the companies its person belongs to, and changes only its own.
 * - journal_counters: readable and writable for any company. Now the same
 *   company wall as every other ledger table.
 * - users: the app role could read password hashes. Now it reads a person's
 *   id, name and email and nothing else. Sign-in reads the hash before the
 *   connection steps into the app role, so it is unaffected.
 */
const SECURITY_SQL = `
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_visible ON companies;
CREATE POLICY company_visible ON companies
  USING (
    id = NULLIF(current_setting('app.company_id', true), '')::uuid
    OR EXISTS (SELECT 1 FROM memberships m
                WHERE m.company_id = companies.id
                  AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  )
  WITH CHECK (id = NULLIF(current_setting('app.company_id', true), '')::uuid);

ALTER TABLE journal_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON journal_counters;
CREATE POLICY company_isolation ON journal_counters
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

-- A session carries the version it was signed at. Bumping it (a password
-- change, "sign out everywhere") ends every session signed before.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

REVOKE SELECT ON users FROM sentryfi_app;
GRANT SELECT (id, name, email) ON users TO sentryfi_app;
`;

module.exports = { SECURITY_SQL };
