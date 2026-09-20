const { pool } = require("../src/config/db");
const { SCHEMA_SQL } = require("../src/config/schema");
const { LEDGER_SQL } = require("../src/config/ledger-schema");
const { VOID_SQL } = require("../src/config/void-schema");
const { BILLS_SQL } = require("../src/config/bills-schema");
const { ATTACHMENTS_SQL } = require("../src/config/attachments-schema");
const { COUNTERPARTY_SQL } = require("../src/config/counterparty-schema");
const { CASH_SQL } = require("../src/config/cash-schema");
const { SALES_SQL } = require("../src/config/sales-schema");

(async () => {
  try {
    await pool.query(SCHEMA_SQL);
    console.log("Documents schema applied.");
    await pool.query(LEDGER_SQL);
    console.log("Ledger schema applied.");
    await pool.query(VOID_SQL);
    console.log("Void columns applied.");
    await pool.query(BILLS_SQL);
    console.log("Bills schema applied.");
    await pool.query(ATTACHMENTS_SQL);
    console.log("Attachment storage applied.");
    await pool.query(COUNTERPARTY_SQL);
    console.log("Counterparty learning applied.");
    await pool.query(CASH_SQL);
    console.log("Cash boxes applied.");
    await pool.query(SALES_SQL);
    console.log("Sales ledger applied.");

    // What is actually in here, so the decision about existing data is made on
    // a count rather than an assumption.
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM users)            AS users,
             (SELECT count(*) FROM invoices)         AS invoices,
             (SELECT count(*) FROM expenses)         AS expenses,
             (SELECT count(*) FROM clients)          AS clients,
             (SELECT count(*) FROM companies)        AS companies,
             (SELECT count(*) FROM journal_entries)  AS entries
    `);
    const c = rows[0];
    console.log(
      `Contents: ${c.users} users, ${c.invoices} invoices, ${c.expenses} expenses, ` +
      `${c.clients} clients | ledger: ${c.companies} companies, ${c.entries} entries`
    );
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
