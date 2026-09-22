const { pool } = require("../src/config/db");
const { ALL_SQL } = require("../src/config/all-schema");

(async () => {
  try {
    // Every schema file, in order (config/all-schema.js).
    for (const sql of ALL_SQL) await pool.query(sql);
    console.log(`Schema applied (${ALL_SQL.length} parts).`);

    // The purchased product's invoice and payment tables. Invoices live on the
    // ledger now, and two places holding the same figure is how they come to
    // disagree. Dropped only if all three are empty: a row in any of them is
    // somebody's record, and that is a decision for a person, not a migration.
    const { rows: old } = await pool.query(`
      SELECT to_regclass('public.invoices') IS NOT NULL
         AND to_regclass('public.invoice_items') IS NOT NULL
         AND to_regclass('public.payments') IS NOT NULL AS present
    `);
    if (old[0].present) {
      const { rows: n } = await pool.query(`
        SELECT (SELECT count(*) FROM invoices)::int      AS invoices,
               (SELECT count(*) FROM invoice_items)::int AS items,
               (SELECT count(*) FROM payments)::int      AS payments
      `);
      const { invoices, items, payments } = n[0];
      if (invoices + items + payments === 0) {
        await pool.query("DROP TABLE IF EXISTS payments, invoice_items, invoices");
        console.log("Purchased invoice and payment tables were empty, and are gone.");
      } else {
        console.log(
          `Purchased tables kept: they hold ${invoices} invoices, ${items} lines and ` +
            `${payments} payments. Nothing reads them; move or discard those rows, then redeploy.`
        );
      }
    }

    // The purchased product's expenses. Money spent is a bill or a cash spend
    // now, on the ledger. Same rule: gone only if empty.
    const { rows: ex } = await pool.query("SELECT to_regclass('public.expenses') IS NOT NULL AS present");
    if (ex[0].present) {
      const { rows: n } = await pool.query("SELECT count(*)::int AS n FROM expenses");
      if (n[0].n === 0) {
        await pool.query("DROP TABLE expenses");
        console.log("Purchased expenses table was empty, and is gone.");
      } else {
        console.log(
          `Purchased expenses kept: ${n[0].n} rows. Nothing reads them; move or discard those rows, then redeploy.`
        );
      }
    }

    // What is actually in here, so decisions about existing data are made on a
    // count rather than an assumption.
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM users)            AS users,
             (SELECT count(*) FROM companies)        AS companies,
             (SELECT count(*) FROM journal_entries)  AS entries,
             (SELECT count(*) FROM sales_invoices)   AS invoices
    `);
    const c = rows[0];
    console.log(
      `Contents: ${c.users} users | ledger: ` +
        `${c.companies} companies, ${c.entries} entries, ${c.invoices} invoices`
    );
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
