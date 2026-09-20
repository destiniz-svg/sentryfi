/**
 * What is owed to us.
 *
 * The mirror of bills, and deliberately not the same table: a bill asks who
 * issued it and how their tax was quoted, and an invoice asks who owes us,
 * against which purchase order, and what we will therefore owe the tax
 * authority. Squeezing both into one shape would mean a column that means two
 * different things depending on a direction flag, which is how a sign error
 * becomes possible.
 *
 * Four decisions here come from Altura's own invoices in
 * docs/real-world-samples/ rather than from how invoicing apps usually work:
 *
 *   1. A purchase order number is a first-class field, not a note. Every
 *      invoice in the samples carries one, and a corporate customer's accounts
 *      department will not pay an invoice that cannot be matched to a PO. An
 *      invoice missing it is not invalid, but it is worth saying so.
 *   2. GST is recorded as quoted, the same way bills are. The samples add 8%
 *      on top of the line total; other work is quoted inclusive. Guessing
 *      turns an 8% error into an understated return.
 *   3. A receipt is not a property of an invoice. One payment settles several
 *      invoices and sometimes part of one, which is what the bank statements
 *      show, so what a receipt paid off is its own table.
 *   4. Retention, progress billing and work in progress are not modelled.
 *      docs/data-model.md records why: they need the contract terms first, and
 *      inventing a retention percentage is worse than not having the feature.
 */

const SALES_SQL = `
DO $$ BEGIN
  CREATE TYPE sale_t AS ENUM ('draft','sent','posted','reversed','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS sales_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES counterparties(id),
  invoice_no      TEXT NOT NULL,
  -- The customer's reference, not ours. Their accounts department matches on
  -- it, and an invoice they cannot match is an invoice that is not paid.
  purchase_order  TEXT,
  subject         TEXT,
  issue_date      DATE NOT NULL DEFAULT current_date,
  due_date        DATE,
  currency        CHAR(3) NOT NULL DEFAULT 'MVR',
  net_laari       BIGINT NOT NULL DEFAULT 0,
  tax_laari       BIGINT NOT NULL DEFAULT 0,
  gross_laari     BIGINT NOT NULL DEFAULT 0,
  gst_treatment   gst_t NOT NULL DEFAULT 'exclusive',
  gst_rate_bp     INTEGER,
  project_id      UUID REFERENCES projects(id),
  status          sale_t NOT NULL DEFAULT 'draft',
  entry_id        UUID REFERENCES journal_entries(id),
  -- Generated before there is signal, like a bill's, so a retried send is one
  -- invoice and not two.
  client_ref      UUID,
  raised_by       UUID REFERENCES users(id),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sale_parts_sum CHECK (net_laari + tax_laari = gross_laari),
  CONSTRAINT sale_no_negatives CHECK (net_laari >= 0 AND tax_laari >= 0),
  -- The same rule bills have, for the same reason: posting decides what is
  -- owed to the tax authority, and an unknown treatment cannot decide it.
  CONSTRAINT sale_posted_knows_its_tax
    CHECK (status <> 'posted' OR gst_treatment <> 'unknown'),
  CONSTRAINT sale_posted_has_entry
    CHECK (status <> 'posted' OR entry_id IS NOT NULL),
  -- An invoice number is ours to control, and issuing the same one twice is
  -- how a customer pays one and disputes the other.
  CONSTRAINT sale_number_present CHECK (length(btrim(invoice_no)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_no_once
  ON sales_invoices (company_id, lower(invoice_no)) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_ref_once
  ON sales_invoices (company_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_company_status_idx ON sales_invoices(company_id, status);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales_invoices(company_id, counterparty_id);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  description      TEXT NOT NULL DEFAULT '',
  quantity         NUMERIC(18,4) NOT NULL DEFAULT 1,
  -- "DAY" on every rental invoice in the samples. Kept because it is on the
  -- paper and a customer checks the invoice against it.
  uom              TEXT,
  unit_price_laari BIGINT NOT NULL DEFAULT 0,
  net_laari        BIGINT NOT NULL DEFAULT 0,
  tax_laari        BIGINT NOT NULL DEFAULT 0,
  -- Which kind of income this is: work invoiced, equipment rental, and so on.
  account_id       UUID REFERENCES accounts(id),
  project_id       UUID REFERENCES projects(id),
  position         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sales_lines_invoice_idx ON sales_invoice_lines(invoice_id);

-- ------------------------------------------------------------- money in

CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES counterparties(id),
  amount_laari    BIGINT NOT NULL,
  received_on     DATE NOT NULL DEFAULT current_date,
  -- Which account it landed in: a bank account, or a cash box.
  account_id      UUID NOT NULL REFERENCES accounts(id),
  reference       TEXT,
  entry_id        UUID REFERENCES journal_entries(id),
  received_by     UUID REFERENCES users(id),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receipt_positive CHECK (amount_laari > 0)
);
CREATE INDEX IF NOT EXISTS receipts_company_idx ON receipts(company_id, received_on DESC);

/*
 * What a receipt paid off.
 *
 * Its own table because one transfer settles several invoices and sometimes
 * part of one — which is what the bank statements actually show. A paid_at
 * column on an invoice cannot express "half of this one and all of that one",
 * and the moment it cannot, somebody starts keeping the difference in a
 * spreadsheet.
 */
CREATE TABLE IF NOT EXISTS receipt_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_id   UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  amount_laari BIGINT NOT NULL,

  CONSTRAINT allocation_positive CHECK (amount_laari > 0),
  UNIQUE (receipt_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS allocations_invoice_idx ON receipt_allocations(invoice_id);

-- ------------------------------------------------------- taking it back

/*
 * A credit note: the invoice was wrong, or the work was not done.
 *
 * Its own document rather than a negative invoice, because the two are asked
 * about differently — a customer wants a credit note reference for their own
 * books, and the tax return reports them apart.
 */
CREATE TABLE IF NOT EXISTS credit_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES counterparties(id),
  invoice_id      UUID REFERENCES sales_invoices(id),
  note_no         TEXT NOT NULL,
  reason          TEXT NOT NULL,
  issue_date      DATE NOT NULL DEFAULT current_date,
  net_laari       BIGINT NOT NULL DEFAULT 0,
  tax_laari       BIGINT NOT NULL DEFAULT 0,
  gross_laari     BIGINT NOT NULL DEFAULT 0,
  entry_id        UUID REFERENCES journal_entries(id),
  raised_by       UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credit_parts_sum CHECK (net_laari + tax_laari = gross_laari),
  CONSTRAINT credit_positive CHECK (gross_laari > 0),
  CONSTRAINT credit_has_a_reason CHECK (length(btrim(reason)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS credit_note_no_once
  ON credit_notes (company_id, lower(note_no));
CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx ON credit_notes(invoice_id);

-- The paper, for an invoice that was sent as a PDF or signed and scanned back.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS sales_invoice_id UUID
  REFERENCES sales_invoices(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS attachments_sales_idx ON attachments(sales_invoice_id);

-- ------------------------------------------- one company cannot see another

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales_invoices','sales_invoice_lines','receipts','receipt_allocations','credit_notes'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
        WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    $p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO sentryfi_app', t);
  END LOOP;
END
$rls$;

-- A receipt and a credit note are records of something that happened. Neither
-- is deleted; both are reversed, like anything else that touched the books.
REVOKE DELETE ON receipts, credit_notes, receipt_allocations FROM sentryfi_app;
`;

module.exports = { SALES_SQL };
