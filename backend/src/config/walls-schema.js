/**
 * Two-column foreign keys: a row can only point at a row of its own company.
 *
 * Ownership was checked in code (security review, finding 5). This makes the
 * database refuse it too. Every single-column foreign key from a table with a
 * company_id to another table with a company_id gets a twin on
 * (company_id, column), found from the catalogue, so a table added later is
 * covered without anyone remembering to. The original key stays; the twin only
 * adds the company.
 *
 * Added NOT VALID, which walls every new and changed row at once, then
 * validated; a row that already points across companies is reported in the
 * log rather than stopping the server, to be looked at by a person.
 */
const WALLS_SQL = `
DO $$
DECLARE r RECORD; n TEXT;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS child, cc.relname AS child_name, c.confrelid::regclass AS parent, pc.relname AS parent_name, a.attname AS col
      FROM pg_constraint c
      JOIN pg_class cc ON cc.oid = c.conrelid
      JOIN pg_class pc ON pc.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1] AND pa.attname = 'id'
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND a.attname <> 'company_id'
       AND c.connamespace = 'public'::regnamespace
       AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.conrelid AND x.attname = 'company_id' AND NOT x.attisdropped)
       AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = c.confrelid AND x.attname = 'company_id' AND NOT x.attisdropped)
  LOOP
    n := left(r.child_name || '_' || r.col || '_same_company', 63);
    CONTINUE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = n AND conrelid = r.child);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %s (company_id, id)', left(r.parent_name || '_company_id_id', 63), r.parent);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (company_id, %I) REFERENCES %s (company_id, id) NOT VALID', r.child, n, r.col, r.parent);
    BEGIN
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', r.child, n);
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING 'Rows in % point at another company''s % (%): new rows are walled, these wait for a person', r.child_name, r.parent_name, r.col;
    END;
  END LOOP;
END $$;
`;

module.exports = { WALLS_SQL };
