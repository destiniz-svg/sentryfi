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
`;

module.exports = { SHARE_SQL };
