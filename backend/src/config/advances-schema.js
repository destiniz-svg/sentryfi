/**
 * Money asked for before the tax invoice, and questions customers ask.
 *
 * A retainer invoice (RT-0001) asks for an amount up front; a proforma
 * invoice (PF-0001) is the invoice-to-be, sent so the customer can pay or
 * arrange payment. Neither is a tax invoice and neither touches the books
 * until money arrives. Money received against one (or with none) is held for
 * the customer on 2350 until it is used against a tax invoice or refunded.
 *
 * In the Maldives GST is due at the earlier of the invoice or the payment,
 * part payment included, so a payment in advance carries its GST when it
 * arrives (on 2200), and using it against the tax invoice takes that GST back
 * off, since the invoice charges the whole of it.
 *
 * Questions: a customer asks about a document from their portal link, the
 * company answers from the document; both sides see the thread.
 */
const ADVANCES_SQL = `
CREATE TABLE IF NOT EXISTS advance_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kind             TEXT NOT NULL CHECK (kind IN ('retainer','proforma')),
  number           TEXT NOT NULL,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  issue_date       DATE NOT NULL,
  due_date         DATE,
  gst_treatment    gst_t NOT NULL DEFAULT 'exclusive',
  gst_rate_bp      INTEGER,
  subject          TEXT,
  lines            JSONB NOT NULL DEFAULT '[]'::jsonb,
  net_laari        BIGINT NOT NULL CHECK (net_laari >= 0),
  tax_laari        BIGINT NOT NULL DEFAULT 0 CHECK (tax_laari >= 0),
  gross_laari      BIGINT NOT NULL CHECK (gross_laari > 0),
  project_id       UUID REFERENCES projects(id),
  -- The customer's yes, from their link: who said it and when.
  accepted_at      TIMESTAMPTZ,
  accepted_by      TEXT,
  -- A proforma, once its tax invoice is raised.
  invoice_id       UUID REFERENCES sales_invoices(id),
  cancelled_at     TIMESTAMPTZ,
  cancel_reason    TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);

CREATE TABLE IF NOT EXISTS customer_advances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  request_id       UUID REFERENCES advance_requests(id),
  received_on      DATE NOT NULL,
  amount_laari     BIGINT NOT NULL CHECK (amount_laari > 0),
  -- The GST inside it, owed from the day it arrived.
  tax_laari        BIGINT NOT NULL DEFAULT 0 CHECK (tax_laari >= 0),
  gst_rate_bp      INTEGER,
  account_id       UUID NOT NULL REFERENCES accounts(id),
  reference        TEXT,
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tax_laari < amount_laari)
);
CREATE INDEX IF NOT EXISTS customer_advances_party_idx ON customer_advances(company_id, counterparty_id);

-- An advance used: against a tax invoice, or given back.
CREATE TABLE IF NOT EXISTS advance_uses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  advance_id       UUID NOT NULL REFERENCES customer_advances(id),
  kind             TEXT NOT NULL CHECK (kind IN ('invoice','refund')),
  invoice_id       UUID REFERENCES sales_invoices(id),
  receipt_id       UUID REFERENCES receipts(id),
  account_id       UUID REFERENCES accounts(id),
  used_on          DATE NOT NULL,
  amount_laari     BIGINT NOT NULL CHECK (amount_laari > 0),
  tax_laari        BIGINT NOT NULL DEFAULT 0 CHECK (tax_laari >= 0),
  entry_id         UUID NOT NULL REFERENCES journal_entries(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'invoice' AND invoice_id IS NOT NULL) OR (kind = 'refund' AND account_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS advance_uses_advance_idx ON advance_uses(advance_id);

CREATE TABLE IF NOT EXISTS document_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  kind             TEXT NOT NULL CHECK (kind IN ('invoice','quote','proforma','retainer')),
  document_id      UUID NOT NULL,
  author           TEXT NOT NULL CHECK (author IN ('customer','company')),
  author_name      TEXT,
  body             TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  user_id          UUID REFERENCES users(id),
  -- A customer's question is open until someone in the company answers it.
  answered_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_questions_doc_idx ON document_questions(company_id, kind, document_id);

-- A word to the customer on this request alone, printed above the template's own notes.
ALTER TABLE advance_requests ADD COLUMN IF NOT EXISTS notes TEXT CHECK (length(notes) <= 2000);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['advance_requests','customer_advances','advance_uses','document_questions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON advance_requests, document_questions TO sentryfi_app;
-- Money held and used is history: added, never changed.
GRANT SELECT, INSERT ON customer_advances, advance_uses TO sentryfi_app;
`;

module.exports = { ADVANCES_SQL };
