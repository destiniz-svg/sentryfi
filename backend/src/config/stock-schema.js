/**
 * Stock: the things a company buys to sell, how many it holds, and what they
 * cost.
 *
 * Every movement in or out is a row in stock_moves with its quantity and its
 * value, posted in the same transaction as the journal entry that carries the
 * money, so what is on hand and what it is worth are sums, never stored, and
 * always equal the Stock account (1350). Cost is the weighted average: one
 * method for the whole company, applied the same way every time (IAS 2).
 *
 * A bill says what stock it brought in (bill_stock_lines); an invoice line
 * says which item it sold (sales_invoice_lines.item_id).
 */
const STOCK_SQL = `
ALTER TYPE source_t ADD VALUE IF NOT EXISTS 'stock';

CREATE TABLE IF NOT EXISTS stock_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name              TEXT NOT NULL,
  code              TEXT,
  unit              TEXT NOT NULL DEFAULT 'each',
  sale_price_laari  BIGINT CHECK (sale_price_laari >= 0),
  archived_at       TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_name_idx ON stock_items(company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_code_idx ON stock_items(company_id, lower(code)) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS stock_moves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  item_id         UUID NOT NULL REFERENCES stock_items(id),
  moved_on        DATE NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('bought','sold','counted','opening','undone')),
  -- In is positive, out is negative, for both.
  quantity        NUMERIC(18,4) NOT NULL CHECK (quantity <> 0),
  value_laari     BIGINT NOT NULL,
  -- What the sale earned, on a sale, so an item's margin is a sum too.
  sale_net_laari  BIGINT,
  entry_id        UUID NOT NULL REFERENCES journal_entries(id),
  bill_id         UUID REFERENCES bills(id),
  invoice_id      UUID REFERENCES sales_invoices(id),
  note            TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_move_direction CHECK ((quantity > 0 AND value_laari >= 0) OR (quantity < 0 AND value_laari <= 0))
);
CREATE INDEX IF NOT EXISTS stock_moves_item_idx ON stock_moves(company_id, item_id);
CREATE INDEX IF NOT EXISTS stock_moves_bill_idx ON stock_moves(bill_id) WHERE bill_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bill_stock_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  bill_id       UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES stock_items(id),
  quantity      NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  -- Before tax, in the bill's own currency, as printed.
  amount_laari  BIGINT NOT NULL CHECK (amount_laari >= 0),
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bill_stock_lines_bill_idx ON bill_stock_lines(bill_id);

ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES stock_items(id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_items','stock_moves','bill_stock_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON stock_items TO sentryfi_app;
-- When what is on hand falls to this, it is time to order more (Needs you says so).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS reorder_at NUMERIC(18,4) CHECK (reorder_at >= 0);
-- Products and services in one list. A product may be counted (stock, as
-- before) or not (bought or sold by name and price only); a service never is.
-- Selling posts to its income account, buying an uncounted one to its cost
-- account; either left empty takes the company's usual one.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product','service'));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS counted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sells BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS buys BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS buy_price_laari BIGINT CHECK (buy_price_laari >= 0);
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS income_account_id UUID REFERENCES accounts(id);
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS cost_account_id UUID REFERENCES accounts(id);
DO $$ BEGIN
  ALTER TABLE stock_items ADD CONSTRAINT stock_items_service_uncounted CHECK (kind = 'product' OR NOT counted);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_items ADD CONSTRAINT stock_items_sells_or_buys CHECK (sells OR buys);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A movement is history: added, never changed.
GRANT SELECT, INSERT ON stock_moves TO sentryfi_app;
GRANT SELECT, INSERT, DELETE ON bill_stock_lines TO sentryfi_app;
`;

module.exports = { STOCK_SQL };
