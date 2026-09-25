/**
 * Sentryfi as a business: what a company told us when it opened its books,
 * where its trial stands, when each person was last here, and a record of
 * everything the people who run Sentryfi did to a customer.
 */
const PLATFORM_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
-- The shortcuts a person keeps on the phone's Record sheet, in order. Null is the usual set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS shortcuts TEXT[];

ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry TEXT
  CHECK (industry IN ('construction','trading','tourism','services','retail','other'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS year_starts SMALLINT NOT NULL DEFAULT 1 CHECK (year_starts BETWEEN 1 AND 12);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS gst_sector TEXT CHECK (gst_sector IN ('general','tourism','both'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','paid','developer'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- The first customers each get thirty days from the day this arrived.
UPDATE companies SET trial_ends_at = now() + interval '30 days' WHERE plan = 'trial' AND trial_ends_at IS NULL;

CREATE TABLE IF NOT EXISTS platform_events (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'
);
`;

module.exports = { PLATFORM_SQL };
