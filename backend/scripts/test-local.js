/**
 * Runs the ledger tests against a real Postgres on this machine.
 *
 * The ledger's guarantees are constraints, deferred triggers and row-level
 * security, so the tests refuse to run against anything but a real database.
 * CI has one. A laptop usually does not, which meant the only way to find out
 * whether a change broke the books was to push it and wait — and the sales
 * ledger's first CI run failed with logs that could not be read from here.
 *
 * This starts Postgres 16 (the version CI and production run) in a throwaway
 * folder, runs the suite, and removes it. Nothing touches a real company.
 *
 *   npm run test:local -w backend
 *   npm run test:local -w backend -- test/sales.test.js
 */

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const EmbeddedPostgres = require("embedded-postgres").default;

const PORT = 54329;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentryfi-pg-"));

(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
    // The server log is full of the ledger correctly refusing things the tests
    // ask it to do. It is noise here; the test report is the signal.
    onLog: () => {},
    onError: () => {},
  });

  let code = 1;
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("sentryfi_test");

    const vitest = path.join(__dirname, "..", "..", "node_modules", "vitest", "vitest.mjs");
    const result = spawnSync(process.execPath, [vitest, "run", ...process.argv.slice(2)], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgres://postgres:postgres@localhost:${PORT}/sentryfi_test`,
      },
    });
    code = result.status ?? 1;
  } catch (err) {
    console.error("Could not start a local Postgres:", err.message);
  } finally {
    await pg.stop().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(code);
})();
