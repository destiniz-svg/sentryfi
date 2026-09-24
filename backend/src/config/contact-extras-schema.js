/**
 * What another system knew about a contact and a document that Sentryfi had no
 * place for: a contact's payment terms and credit limit, and a supporting file
 * filed against an imported entry or an order rather than a bill.
 */
const CONTACT_EXTRAS_SQL = `
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER CHECK (payment_terms_days >= 0);
ALTER TABLE counterparties ADD COLUMN IF NOT EXISTS credit_limit_laari BIGINT CHECK (credit_limit_laari >= 0);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
CREATE INDEX IF NOT EXISTS attachments_entry_idx ON attachments(entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attachments_order_idx ON attachments(order_id) WHERE order_id IS NOT NULL;
`;

module.exports = { CONTACT_EXTRAS_SQL };
