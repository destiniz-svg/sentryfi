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

-- Two records that turned out to be one business: the one given up points at
-- the one kept. Nothing already in the books is re-tagged (the ledger never
-- changes); everything that asks "is this that party?" follows the pointer.
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES counterparties(id);
CREATE OR REPLACE FUNCTION same_party(a UUID, b UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE AS $f$
    SELECT a = b OR EXISTS (SELECT 1 FROM counterparties WHERE id = a AND merged_into = b)
  $f$;

-- A business's own papers: trade licence, contract, TRN certificate.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS counterparty_id UUID REFERENCES counterparties(id);
CREATE INDEX IF NOT EXISTS attachments_party_idx ON attachments(counterparty_id) WHERE counterparty_id IS NOT NULL;

-- What a customer owed, or a supplier was owed, before these books began: kept
-- as an invoice or bill of its own, so it ages, sits on the statement and is
-- paid like any other, but it is not a sale, a purchase or GST. It is posted
-- against Opening balances (3900).
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS opening BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS opening BOOLEAN NOT NULL DEFAULT false;

-- A discount on a line, in hundredths of a percent, taken off before GST.
ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_bp INTEGER CHECK (discount_bp BETWEEN 0 AND 10000);
`;

module.exports = { CONTACTS_SQL };
