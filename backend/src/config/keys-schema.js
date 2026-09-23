/**
 * Keys for a company's own assistant and other software (middleware/apiKey.js).
 *
 * A key is made by a person, for one company, and acts as that person: it can
 * read what they can read and, if they chose "read and draft", draft what they
 * can draft. It can never put anything in the books. Only the hash of the key
 * is kept; the key itself is shown once. Every write a key makes is logged.
 *
 * Outside the company walls (found before the company is known, like
 * portal_links); the app role cannot touch either table.
 */
const KEYS_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('read', 'draft')),
  token_hash    TEXT NOT NULL UNIQUE,
  hint          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_owner ON api_keys (user_id, company_id);
REVOKE ALL ON api_keys FROM sentryfi_app;

CREATE TABLE IF NOT EXISTS api_key_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_id      UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_key_log_key ON api_key_log (key_id, at DESC);
REVOKE ALL ON api_key_log FROM sentryfi_app;

-- Webhooks: a company's address told when something is put in the books.
-- Thin events (which record, its entry, its total); details are fetched with a key.
CREATE TABLE IF NOT EXISTS webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  events        TEXT[] NOT NULL,
  secret        TEXT NOT NULL,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webhooks_company ON webhooks (company_id) WHERE disabled_at IS NULL;
REVOKE ALL ON webhooks FROM sentryfi_app;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  body          JSONB NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  status        INTEGER,
  error         TEXT,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_hook ON webhook_deliveries (webhook_id, created_at DESC);
REVOKE ALL ON webhook_deliveries FROM sentryfi_app;
`;

module.exports = { KEYS_SQL };
