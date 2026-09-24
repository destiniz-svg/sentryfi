/**
 * Runs the cross-tenant security suite (backend/security) against a throwaway
 * Postgres, like scripts/test-local.js does for the unit tests.
 *
 *   npm run test:security
 */
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const EmbeddedPostgres = require("node:module").createRequire(path.join(ROOT, "backend/package.json"))("embedded-postgres").default;

const PORT = 54391;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentryfi-sec-"));
(async () => {
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
  let code = 1;
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("sentryfi_sec");
    const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules/vitest/vitest.mjs"), "run", "--root", path.join(ROOT, "backend", "security"), "--globals", "--testTimeout=60000", "--hookTimeout=120000", "--pool=forks"], {
      stdio: "inherit",
      env: {
        ...process.env,
        SENTRYFI_BACKEND: path.join(ROOT, "backend"),
        DATABASE_URL: `postgres://postgres:postgres@localhost:${PORT}/sentryfi_sec?sslmode=disable`,
        JWT_SECRET: "test-secret-for-cross-tenant-probe",
        PORT: "18731",
        NODE_ENV: "test",
        BACKUP_KEY: "", BACKUP_BUCKET: "", BACKUP_ACCESS_KEY_ID: "", BACKUP_SECRET_ACCESS_KEY: "",
        GEMINI_API_KEY: "",
        // Email on, so addresses must be confirmed, but sent nowhere.
        RESEND_API_KEY: "re_test_offline", RESEND_API_URL: "http://127.0.0.1:9/emails",
        RESEND_WEBHOOK_SECRET: "whsec_" + Buffer.from("test-webhook-secret").toString("base64"), ZOHO_CLIENT_ID: "", ZOHO_CLIENT_SECRET: "",
      },
    });
    code = r.status ?? 1;
  } catch (e) {
    console.error(e);
  } finally {
    await pg.stop().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(code);
})();
