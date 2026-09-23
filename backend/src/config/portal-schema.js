/**
 * The customer portal: a private link a customer opens, without an account, to
 * see their invoices, what they owe, and how to pay.
 *
 * portal_links is looked up before anyone is known, so like password_resets it
 * sits outside the company walls and the app role cannot touch it at all; the
 * link's secret is kept only as a hash. What the link then shows is read inside
 * the company's walls, as the person who made it.
 */
const PORTAL_SQL = `
CREATE TABLE IF NOT EXISTS portal_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  last_seen_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS portal_links_company_idx ON portal_links(company_id);
REVOKE ALL ON portal_links FROM sentryfi_app;

-- How a customer pays this company: bank, account, name. Shown on the portal.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_details TEXT NOT NULL DEFAULT '';
GRANT UPDATE (payment_details) ON companies TO sentryfi_app;
`;

module.exports = { PORTAL_SQL };
