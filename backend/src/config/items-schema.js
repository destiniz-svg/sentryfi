/**
 * Items, beyond products and services: a bundle is sold as one line and made
 * of other items, each leaving stock at its own cost when the bundle sells
 * (a bathroom set: one basin, one WC, two taps). And a small photograph of
 * each item, kept with it, to know it at a glance on a phone.
 */
const ITEMS_SQL = `
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'stock_items'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%kind%' AND pg_get_constraintdef(oid) LIKE '%service%'
              AND pg_get_constraintdef(oid) NOT LIKE '%bundle%' AND conname <> 'stock_items_service_uncounted'
  LOOP
    EXECUTE format('ALTER TABLE stock_items DROP CONSTRAINT %I', c);
  END LOOP;
  BEGIN
    ALTER TABLE stock_items ADD CONSTRAINT stock_items_kind_known CHECK (kind IN ('product','service','bundle'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS photo TEXT CHECK (photo IS NULL OR (photo LIKE 'data:image/%' AND length(photo) <= 300000));

-- Its GST class, which MIRA wants on record for every good or service. Empty
-- until a person says, or the model reads it off the name ('ai', with why).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS tax TEXT CHECK (tax IN ('standard','zero_rated','exempt'));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS tax_by TEXT CHECK (tax_by IN ('you','ai'));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS tax_why TEXT;

CREATE TABLE IF NOT EXISTS bundle_parts (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bundle_id   UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES stock_items(id),
  quantity    NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (bundle_id, item_id),
  CHECK (bundle_id <> item_id)
);
ALTER TABLE bundle_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_parts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON bundle_parts;
CREATE POLICY company_isolation ON bundle_parts
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON bundle_parts TO sentryfi_app;

-- A second unit: a product kept in pieces may also come in a pack (a box of 12).
-- Stock is always kept in the item's own unit; a line said in the pack is that
-- many packs times the size, so changing a pack size later changes no history.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS pack_unit TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS pack_size NUMERIC(18,4);
DO $$ BEGIN
  ALTER TABLE stock_items ADD CONSTRAINT stock_items_pack CHECK (
    (pack_unit IS NULL AND pack_size IS NULL)
    OR (btrim(pack_unit) <> '' AND pack_size > 0 AND pack_size <> 1 AND lower(btrim(pack_unit)) <> lower(btrim(unit))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

module.exports = { ITEMS_SQL };
