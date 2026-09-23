/**
 * Notifications, and push to every device a person turns them on for.
 *
 * notifications is each person's inbox inside a company, behind the company
 * wall like every other company table; the same thing is never said twice
 * (dedupe_key), so an hourly sweep can repeat itself safely.
 *
 * push_subscriptions belong to a person, not a company, and are read by the
 * server's own jobs before anyone is signed in, so like password_resets they
 * sit outside the company walls and the app role cannot touch them. push_keys
 * holds the server's one VAPID key pair, made the first time it is needed.
 */
const PUSH_SQL = `
CREATE TABLE IF NOT EXISTS push_keys (
  id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key   TEXT NOT NULL,
  private_key  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON push_keys FROM sentryfi_app;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  device       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
REVOKE ALL ON push_subscriptions FROM sentryfi_app;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  href        TEXT,
  dedupe_key  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ,
  UNIQUE (company_id, user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON notifications(company_id, user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON notifications;
CREATE POLICY company_isolation ON notifications
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT ON notifications TO sentryfi_app;
GRANT UPDATE (read_at) ON notifications TO sentryfi_app;

-- The morning brief can come as a push as well as an email.
ALTER TABLE cfo_subscriptions ADD COLUMN IF NOT EXISTS push BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cfo_subscriptions ADD COLUMN IF NOT EXISTS last_pushed_on DATE;
`;

module.exports = { PUSH_SQL };
