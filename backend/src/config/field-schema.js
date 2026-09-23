/**
 * Sent once, whatever the signal does.
 *
 * A phone on a site sends something, the signal drops before the answer comes
 * back, and it sends it again. Without this, the second send is a second cash
 * spend. Each send from the phone carries its own key (Idempotency-Key); the
 * first answer is kept here against that key and the person, and a repeat gets
 * the same answer back instead of doing the thing twice.
 *
 * Kept per person, outside the company walls (read before the company is known,
 * like password_resets); the app role cannot touch it. Answers are kept a week.
 */
const FIELD_SQL = `
CREATE TABLE IF NOT EXISTS request_keys (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         UUID NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER,
  body        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS request_keys_age ON request_keys (created_at);
REVOKE ALL ON request_keys FROM sentryfi_app;
`;

module.exports = { FIELD_SQL };
