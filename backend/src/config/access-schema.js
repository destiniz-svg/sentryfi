/**
 * People, finished: signing in with Face ID or a fingerprint (passkeys), a
 * password reset link an administrator hands over, and a spending limit per
 * person.
 *
 * Passkeys and reset links belong to a person, not a company, so like users
 * they sit outside the company walls and are read only before a request steps
 * into the app role. Only a passkey's public key is kept; the private key
 * never leaves the phone. A reset link's secret is kept only as a hash.
 */
const ACCESS_SQL = `
CREATE TABLE IF NOT EXISTS passkeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    BYTEA NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    TEXT[],
  name          TEXT NOT NULL DEFAULT 'This device',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys(user_id);
REVOKE ALL ON passkeys FROM sentryfi_app;

CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  issued_by   UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  used_at     TIMESTAMPTZ
);
REVOKE ALL ON password_resets FROM sentryfi_app;

CREATE TABLE IF NOT EXISTS spending_limits (
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  limit_laari  BIGINT NOT NULL CHECK (limit_laari >= 0),
  set_by       UUID NOT NULL REFERENCES users(id),
  set_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
ALTER TABLE spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_limits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON spending_limits;
CREATE POLICY company_isolation ON spending_limits
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON spending_limits TO sentryfi_app;
`;

module.exports = { ACCESS_SQL };
