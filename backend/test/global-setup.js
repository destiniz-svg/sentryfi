/**
 * The schema, applied once before any test file starts.
 *
 * Each database test file used to apply it in its own beforeAll. With one such
 * file that was fine; with two, vitest runs them in parallel and the second
 * file's schema pass — which drops and recreates row-level security policies,
 * taking heavy table locks — ran while the first file was mid-test holding
 * locks of its own. Postgres detected the deadlock and failed a whole suite.
 *
 * Applying it here, once, means every file starts against a finished schema
 * and the files can run in parallel without touching each other: each test
 * lives inside its own transaction and is rolled back.
 *
 * Skipped when there is no database, so the tests that need none — money and
 * boot — still run on a machine without one.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return;

  const { applySchema, closePool } = require("./setup.js");
  await applySchema();
  await closePool();
}
