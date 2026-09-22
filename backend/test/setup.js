/**
 * A real Postgres, because the things worth testing here are the things a fake
 * gets wrong.
 *
 * The ledger's guarantees are deferred constraint triggers, plpgsql, row-level
 * security and a restricted role. An in-memory stand-in implements none of
 * them, so a test suite running against one would pass while proving nothing.
 * These run against an actual database: locally against whatever DATABASE_URL
 * points at, and in CI against a Postgres service container.
 *
 * Every test runs inside a transaction that is rolled back, so tests cannot
 * see each other's rows and the database is the same after the suite as
 * before it.
 */

const { Pool } = require("pg");
const { SCHEMA_SQL } = require("../src/config/schema");
const { LEDGER_SQL } = require("../src/config/ledger-schema");
const { BILLS_SQL } = require("../src/config/bills-schema");
const { ATTACHMENTS_SQL } = require("../src/config/attachments-schema");
const { COUNTERPARTY_SQL } = require("../src/config/counterparty-schema");
const { CASH_SQL } = require("../src/config/cash-schema");
const { SALES_SQL } = require("../src/config/sales-schema");
const { STATEMENT_SQL } = require("../src/config/statement-schema");
const { PERIOD_SQL } = require("../src/config/period-schema");
const { TAX_SQL } = require("../src/config/tax-schema");
const { IMPORT_SQL } = require("../src/config/import-schema");

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

let pool;

function requireDatabase() {
  if (!url) {
    throw new Error(
      "These tests need a real Postgres. Set TEST_DATABASE_URL.\n" +
        "The ledger's guarantees are constraints, triggers and row-level security; " +
        "a fake database would pass every test and prove nothing."
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url)
        ? false
        : { rejectUnauthorized: false },
      max: 4,
    });
  }
  return pool;
}

async function applySchema() {
  const p = requireDatabase();

  // Test files run in parallel workers, and each one applies the schema to the
  // same database. "CREATE ... IF NOT EXISTS" is not safe against a twin doing
  // the same thing at the same moment: both see nothing, both create, and one
  // fails on a duplicate type. It never showed while only one file needed the
  // database. One lock, held on one connection for the whole setup.
  const client = await p.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7462001)");
    await applySchemaOn(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(7462001)").catch(() => {});
    client.release();
  }
}

async function applySchemaOn(p) {
  await p.query(SCHEMA_SQL);
  await p.query(LEDGER_SQL);
  await p.query(BILLS_SQL);
  await p.query(ATTACHMENTS_SQL);
  await p.query(COUNTERPARTY_SQL);
  await p.query(CASH_SQL);
  await p.query(SALES_SQL);
  await p.query(STATEMENT_SQL);
  await p.query(PERIOD_SQL);
  await p.query(TAX_SQL);
  await p.query(IMPORT_SQL);
}

/**
 * Runs a test body inside a transaction and rolls it back, whatever happens.
 * The body gets a client that is already the owner, with no company assumed —
 * so a test that forgets to say who it is fails closed, exactly as the app
 * would.
 */
async function inRollback(fn) {
  const p = requireDatabase();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Nothing to roll back; the failure that got us here is the real one.
    }
    client.release();
  }
}

/** A company, a user in it, and a minimal chart of accounts. */
async function aCompanyWith(client, { name = "Test Co" } = {}) {
  const { rows: users } = await client.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Test', $1, 'not-a-real-account') RETURNING id`,
    [`test+${Math.random().toString(36).slice(2)}@sentryfi.invalid`]
  );
  const userId = users[0].id;

  const { rows: companies } = await client.query(
    `INSERT INTO companies (name, base_currency, gst_registered)
     VALUES ($1, 'MVR', true) RETURNING id`,
    [name]
  );
  const companyId = companies[0].id;

  // FORCE row-level security applies to the owner too, so even setup says
  // which company it is acting for.
  await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);

  const { rows: accounts } = await client.query(
    `INSERT INTO accounts (company_id, code, name, type) VALUES
       ($1,'1100','Bank',             'asset'),
       ($1,'2100','Suppliers we owe', 'liability'),
       ($1,'5100','Materials',        'expense'),
       ($1,'1400','GST we can claim', 'asset')
     RETURNING id, code`,
    [companyId]
  );
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a.id]));

  return {
    companyId,
    userId,
    accounts: {
      bank: byCode["1100"],
      payable: byCode["2100"],
      expense: byCode["5100"],
      taxReclaimable: byCode["1400"],
      byCode,
    },
  };
}

async function closePool() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { requireDatabase, applySchema, inRollback, aCompanyWith, closePool };
