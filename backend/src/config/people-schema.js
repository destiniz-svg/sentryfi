/**
 * People in a company.
 *
 * Someone who already has a login is added straight away. Someone who does
 * not gets an invitation: a link, sent however the administrator likes
 * (WhatsApp, mostly), that lets them set their own name and password. Only a
 * hash of the link's secret is kept, so reading this table does not let anyone
 * join.
 *
 * Every change to who may do what is written to people_changes, which nobody
 * can edit or delete: "who gave this person the right to post?" has to have
 * an answer long after the fact.
 */

const PEOPLE_SQL = `
CREATE TABLE IF NOT EXISTS invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         role_t NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  invited_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES users(id),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS invites_company_idx ON invites(company_id);

CREATE TABLE IF NOT EXISTS people_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        role_t NOT NULL,
  change      TEXT NOT NULL CHECK (change IN ('added','removed','invited','invite_withdrawn','joined')),
  by_user     UUID REFERENCES users(id),
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_changes_company_idx ON people_changes(company_id, at DESC);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invites','people_changes']
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

-- An invitation is only ever accepted or withdrawn, never rewritten.
GRANT UPDATE (accepted_at, accepted_by, revoked_at) ON invites TO sentryfi_app;
-- Taking a role away. The route checks manage_people and refuses the last
-- administrator; the policy keeps it inside the company.
GRANT DELETE ON memberships TO sentryfi_app;
`;

module.exports = { PEOPLE_SQL };
