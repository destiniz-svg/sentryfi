/**
 * Customers and suppliers as people deal with them: a few tags to group them
 * by (Resort, Government, Contractor), and the people at each one, because
 * the accounts clerk at a resort is not the site manager who signed the quote.
 */
const CONTACTS_SQL = `
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS contact_people (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  role             TEXT,
  phone            TEXT,
  email            TEXT,
  -- The one who gets statements and reminders.
  for_accounts     BOOLEAN NOT NULL DEFAULT false,
  removed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_people_party_idx ON contact_people(company_id, counterparty_id);
ALTER TABLE contact_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_people FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON contact_people;
CREATE POLICY company_isolation ON contact_people
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON contact_people TO sentryfi_app;
`;

module.exports = { CONTACTS_SQL };
