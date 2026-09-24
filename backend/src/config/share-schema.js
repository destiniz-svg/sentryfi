/**
 * A private link to one document, for whoever it is sent to: a supplier's
 * purchase order, a delivery note, a credit note, a receipt, a statement.
 * (A customer's invoices, quotes, proformas and retainers open on their
 * portal page instead, where they can accept, ask and pay.)
 *
 * Looked up before anyone is known, so like portal_links it sits outside the
 * company walls and the app role cannot touch it; the secret is kept only as
 * a hash, and the document is read inside the walls as whoever shared it.
 */
const SHARE_SQL = `
CREATE TABLE IF NOT EXISTS document_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  document_id   UUID NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS document_links_doc_idx ON document_links(company_id, kind, document_id);
REVOKE ALL ON document_links FROM sentryfi_app;

-- A supplier's yes to a purchase order, from its link: who, when, and when it will come.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_confirmed_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_expected_on DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_note TEXT;

-- Emails to customers that go by themselves: the month's statement, and reminders
-- when an invoice is late. Off until the company turns them on.
CREATE TABLE IF NOT EXISTS customer_mail_settings (
  company_id          UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  monthly_statements  BOOLEAN NOT NULL DEFAULT false,
  reminders           BOOLEAN NOT NULL DEFAULT false,
  -- Days after the due date a reminder goes, each once.
  reminder_days       INTEGER[] NOT NULL DEFAULT '{3,14,30}',
  updated_by          UUID REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- What was sent, so nothing is sent twice.
CREATE TABLE IF NOT EXISTS customer_mail_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('statement','reminder')),
  counterparty_id  UUID REFERENCES counterparties(id),
  invoice_id       UUID REFERENCES sales_invoices(id),
  sent_to          TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_mail_settings','customer_mail_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON customer_mail_settings TO sentryfi_app;
GRANT SELECT, INSERT ON customer_mail_log TO sentryfi_app;
`;

module.exports = { SHARE_SQL };
