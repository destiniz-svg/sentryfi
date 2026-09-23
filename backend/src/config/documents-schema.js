/**
 * Documents: how the company's paper looks, and the copies it sent.
 *
 * companies.brand is the brand kit, set once: logo, colour, font, stamp,
 * signature, contact lines, footer. document_templates says, per kind of
 * document (invoice, quote, purchase order...), which layout and size, which
 * columns, what the labels say, and the notes and terms.
 *
 * document_copies keeps what a document looked like when it was issued: its
 * figures, the brand and the template as they were. Changing the template
 * later never changes an invoice that is already out. Written once, never
 * changed or removed by the app.
 */
const DOCUMENTS_SQL = `
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand JSONB NOT NULL DEFAULT '{}';
GRANT UPDATE (brand) ON companies TO sentryfi_app;

CREATE TABLE IF NOT EXISTS document_templates (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  settings    JSONB NOT NULL DEFAULT '{}',
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, kind)
);

CREATE TABLE IF NOT EXISTS document_copies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  document_id  UUID NOT NULL,
  body         JSONB NOT NULL,
  sha256       TEXT NOT NULL,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, document_id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_templates','document_copies'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_templates TO sentryfi_app;
-- An issued copy is written once and read; never changed, never removed.
GRANT SELECT, INSERT ON document_copies TO sentryfi_app;
`;

module.exports = { DOCUMENTS_SQL };
