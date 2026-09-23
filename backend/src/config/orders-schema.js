/**
 * Orders: what was agreed before the goods moved. A purchase order is agreed
 * with a supplier (approved above the orderer's spending limit), received in
 * one or more deliveries, and billed from what was received. A sales order is
 * agreed with a customer, delivered, and invoiced from what was delivered.
 *
 * A delivery moves quantities, not money. The cost (or the sale) is the bill
 * (or the invoice) made from the order, so an order, its delivery and its
 * invoice are one cost, not three. order_billed says which bill or invoice
 * took how much of each line.
 */
const ORDERS_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kind             TEXT NOT NULL CHECK (kind IN ('purchase','sale')),
  number           TEXT NOT NULL,
  counterparty_id  UUID NOT NULL REFERENCES counterparties(id),
  project_id       UUID REFERENCES projects(id),
  ordered_on       DATE NOT NULL,
  expected_on      DATE,
  note             TEXT NOT NULL DEFAULT '',
  needs_approval   BOOLEAN NOT NULL DEFAULT false,
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, number)
);

CREATE TABLE IF NOT EXISTS order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL DEFAULT 0,
  description       TEXT NOT NULL,
  item_id           UUID REFERENCES stock_items(id),
  account_id        UUID REFERENCES accounts(id),
  quantity          NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit              TEXT,
  unit_price_laari  BIGINT NOT NULL CHECK (unit_price_laari >= 0)
);

CREATE TABLE IF NOT EXISTS order_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  order_id      UUID NOT NULL REFERENCES orders(id),
  delivered_on  DATE NOT NULL,
  reference     TEXT,
  note          TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_delivery_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  delivery_id    UUID NOT NULL REFERENCES order_deliveries(id) ON DELETE CASCADE,
  order_line_id  UUID NOT NULL REFERENCES order_lines(id),
  quantity       NUMERIC(18,4) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS order_billed (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  order_line_id  UUID NOT NULL REFERENCES order_lines(id),
  bill_id        UUID REFERENCES bills(id),
  invoice_id     UUID REFERENCES sales_invoices(id),
  quantity       NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  amount_laari   BIGINT NOT NULL CHECK (amount_laari >= 0),
  CHECK ((bill_id IS NULL) <> (invoice_id IS NULL))
);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','order_lines','order_deliveries','order_delivery_lines','order_billed'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON orders TO sentryfi_app;

-- Quotes: an order not yet agreed. Accepted, it becomes a sales order.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('purchase','sale','quote'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS became_order_id UUID REFERENCES orders(id);
GRANT SELECT, INSERT ON order_lines, order_deliveries, order_delivery_lines, order_billed TO sentryfi_app;
`;

module.exports = { ORDERS_SQL };
