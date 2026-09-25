/**
 * Which releases have been announced, so each goes to every bell once, however
 * many servers start with it. The platform's own record: no company's data.
 */
const RELEASE_SQL = `
CREATE TABLE IF NOT EXISTS release_announcements (
  version       TEXT PRIMARY KEY,
  announced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  told          INTEGER NOT NULL DEFAULT 0
);
REVOKE ALL ON release_announcements FROM sentryfi_app;
`;

module.exports = { RELEASE_SQL };
