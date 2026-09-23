/**
 * Shipments and landed cost: goods bought abroad cost what the supplier
 * charged plus everything it took to get them here — the freight, the
 * clearing agent, Customs, the bank's charges — and that whole cost is what
 * goes into stock (IAS 2), not the invoice price alone.
 *
 * A shipment is a bill of lading: its containers, and the bills that are its
 * goods (bills.shipment_id; their stock lines, each optionally in a
 * container). Every landing cost waits on 1360 (shipment_costs), whether it
 * came on a bill or was paid straight from the bank, until it is shared out
 * over the goods: by value, by quantity (weight), or by container space (CBM).
 * What is shared into goods still on hand raises their cost; the share of
 * goods already sold goes to cost of goods sold.
 */
const SHIPMENT_SQL = `
CREATE TABLE IF NOT EXISTS shipments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  reference    TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  basis        TEXT NOT NULL DEFAULT 'value' CHECK (basis IN ('value','quantity','cbm')),
  arrived_on   DATE,
  closed_at    TIMESTAMPTZ,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipments_reference_idx ON shipments(company_id, lower(reference));

CREATE TABLE IF NOT EXISTS shipment_containers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  number       TEXT NOT NULL,
  size         TEXT,
  cbm          NUMERIC(10,3) CHECK (cbm IS NULL OR cbm > 0),
  weight_kg    NUMERIC(12,2) CHECK (weight_kg IS NULL OR weight_kg > 0)
);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES shipments(id);
ALTER TABLE bill_stock_lines ADD COLUMN IF NOT EXISTS container_id UUID REFERENCES shipment_containers(id);
ALTER TABLE bill_charges ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES shipments(id);
ALTER TABLE bill_charges DROP CONSTRAINT IF EXISTS bill_charges_kind_check;
ALTER TABLE bill_charges ADD CONSTRAINT bill_charges_kind_check CHECK (kind IN ('cost','asset','landed'));
ALTER TABLE bill_charges DROP CONSTRAINT IF EXISTS bill_charges_check;
ALTER TABLE bill_charges ADD CONSTRAINT bill_charges_check CHECK (
  (kind = 'cost' AND account_id IS NOT NULL) OR (kind = 'asset' AND asset_category IS NOT NULL) OR (kind = 'landed' AND shipment_id IS NOT NULL));
ALTER TABLE charge_rules DROP CONSTRAINT IF EXISTS charge_rules_kind_check;
ALTER TABLE charge_rules ADD CONSTRAINT charge_rules_kind_check CHECK (kind IN ('stock','cost','asset','landed'));

CREATE TABLE IF NOT EXISTS shipment_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  shipment_id  UUID NOT NULL REFERENCES shipments(id),
  basis        TEXT NOT NULL,
  amount_laari BIGINT NOT NULL CHECK (amount_laari > 0),
  entry_id     UUID NOT NULL REFERENCES journal_entries(id),
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_costs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  shipment_id    UUID NOT NULL REFERENCES shipments(id),
  kind           TEXT NOT NULL CHECK (kind IN ('freight','clearing','duty','bank','other')),
  description    TEXT NOT NULL DEFAULT '',
  value_laari    BIGINT NOT NULL CHECK (value_laari > 0),
  entry_id       UUID NOT NULL REFERENCES journal_entries(id),
  bill_id        UUID REFERENCES bills(id),
  allocation_id  UUID REFERENCES shipment_allocations(id),
  paid_on        DATE NOT NULL,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipment_costs_idx ON shipment_costs(company_id, shipment_id);

-- A landing cost shared into goods adds value without adding any.
ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES shipments(id);
ALTER TABLE stock_moves DROP CONSTRAINT IF EXISTS stock_moves_kind_check;
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_kind_check CHECK (kind IN ('bought','sold','counted','opening','undone','landed'));
ALTER TABLE stock_moves DROP CONSTRAINT IF EXISTS stock_moves_quantity_check;
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_quantity_check CHECK (quantity <> 0 OR kind = 'landed');
ALTER TABLE stock_moves DROP CONSTRAINT IF EXISTS stock_move_direction;
ALTER TABLE stock_moves ADD CONSTRAINT stock_move_direction CHECK (
  (quantity > 0 AND value_laari >= 0) OR (quantity < 0 AND value_laari <= 0) OR (quantity = 0 AND kind = 'landed' AND value_laari > 0));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipments','shipment_containers','shipment_allocations','shipment_costs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON shipments TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON shipment_containers TO sentryfi_app;
GRANT SELECT, INSERT ON shipment_allocations TO sentryfi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON shipment_costs TO sentryfi_app;
-- Only which container a goods line came in may change on it.
GRANT UPDATE (container_id) ON bill_stock_lines TO sentryfi_app;
`;

module.exports = { SHIPMENT_SQL };
