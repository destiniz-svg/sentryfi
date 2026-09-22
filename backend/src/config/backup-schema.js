/**
 * Every backup run, and whether it was proven to restore.
 *
 * Outside the company walls on purpose: a backup is of the whole system, and
 * the run that takes it is not acting for any one company.
 */

const BACKUP_SQL = `
CREATE TABLE IF NOT EXISTS backup_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  object_key   TEXT,
  bytes        BIGINT,
  companies    INT,
  entries      BIGINT,
  restored     BOOLEAN NOT NULL DEFAULT false,
  ok           BOOLEAN NOT NULL DEFAULT false,
  problem      TEXT
);
CREATE INDEX IF NOT EXISTS backup_runs_at_idx ON backup_runs(started_at DESC);
-- Read by What needs you, which runs as the app role. It holds no company data.
GRANT SELECT ON backup_runs TO sentryfi_app;
`;

module.exports = { BACKUP_SQL };
