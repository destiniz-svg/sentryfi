/**
 * Where stock is kept. A company names its places (the yard, a site store);
 * a stock movement says which place it happened at, and no place means the
 * main store, so every movement before places existed is where it always was.
 * Moving stock between places changes where it is, not what it is worth, so
 * it is its own record with no journal entry: value stays company-wide at
 * average cost (ledger/stock.js).
 *
 * A place has a kind (a store, a godown, an outlet, a site, a factory, a
 * vehicle), may have a person in charge (a member of the company, checked in
 * code), and a site may belong to a project. A bill, and a delivery against a
 * purchase order, say which place the goods came into; none is the main store.
 */
const PLACES_SQL = `
CREATE TABLE IF NOT EXISTS stock_places (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  archived_at  TIMESTAMPTZ,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_places_name_idx ON stock_places(company_id, lower(name));

ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES stock_places(id);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  item_id       UUID NOT NULL REFERENCES stock_items(id),
  from_place_id UUID REFERENCES stock_places(id),
  to_place_id   UUID REFERENCES stock_places(id),
  quantity      NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  moved_on      DATE NOT NULL,
  note          TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transfer_somewhere_else CHECK (from_place_id IS DISTINCT FROM to_place_id)
);
CREATE INDEX IF NOT EXISTS stock_transfers_item_idx ON stock_transfers(company_id, item_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_places','stock_transfers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;
ALTER TABLE stock_places ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'store'
  CHECK (kind IN ('store','godown','outlet','site','factory','vehicle'));
ALTER TABLE stock_places ADD COLUMN IF NOT EXISTS in_charge UUID REFERENCES users(id);
ALTER TABLE stock_places ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES stock_places(id);
ALTER TABLE order_deliveries ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES stock_places(id);

GRANT SELECT, INSERT, UPDATE ON stock_places TO sentryfi_app;
-- A move between places is history too: added, never changed.
GRANT SELECT, INSERT ON stock_transfers TO sentryfi_app;

-- Send and arrive. A transfer that arrives is on the way until a person at the
-- other end says what came; one that does not (every transfer before this, and
-- one marked as there already) is at its new place at once. What came short is
-- written off there, with its reason, as a stock move of its own.
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS arrives BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS stock_arrivals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  transfer_id  UUID NOT NULL UNIQUE REFERENCES stock_transfers(id),
  received     NUMERIC(18,4) NOT NULL CHECK (received >= 0),
  arrived_on   DATE NOT NULL,
  reason       TEXT,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stock_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_arrivals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON stock_arrivals;
CREATE POLICY company_isolation ON stock_arrivals
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON stock_arrivals TO sentryfi_app;
`;

module.exports = { PLACES_SQL };
