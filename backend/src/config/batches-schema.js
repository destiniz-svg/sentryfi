/**
 * Batches and expiry, for the products that have it switched on.
 *
 * A batch is a code and, if it has one, the day it expires. It comes in on a
 * bill line (or with stock already held) and a stock move says which batch it
 * moved; what is held of a batch is a sum, like everything else. Anything that
 * takes stock out without naming a batch takes the earliest to expire first.
 * Cost is still the item's one weighted average: a batch says how many and
 * until when, not what it cost. Batches are held company-wide, not by place.
 */
const BATCHES_SQL = `
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS batches BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE stock_items ADD CONSTRAINT stock_items_batches_counted CHECK (NOT batches OR counted);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  item_id     UUID NOT NULL REFERENCES stock_items(id),
  code        TEXT NOT NULL CHECK (btrim(code) <> ''),
  expires_on  DATE,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_batches_code_idx ON stock_batches(company_id, item_id, lower(btrim(code)));
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON stock_batches;
CREATE POLICY company_isolation ON stock_batches
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
-- A batch is what the supplier printed: added, never changed.
GRANT SELECT, INSERT ON stock_batches TO sentryfi_app;

ALTER TABLE stock_moves ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES stock_batches(id);
CREATE INDEX IF NOT EXISTS stock_moves_batch_idx ON stock_moves(batch_id) WHERE batch_id IS NOT NULL;
ALTER TABLE bill_stock_lines ADD COLUMN IF NOT EXISTS batch_code TEXT;
ALTER TABLE bill_stock_lines ADD COLUMN IF NOT EXISTS expires_on DATE;
`;

module.exports = { BATCHES_SQL };
