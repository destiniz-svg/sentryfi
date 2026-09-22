const ApiError = require("../utils/ApiError");

/**
 * The people who run Sentryfi itself, as against a company's own
 * administrators: named by email in PLATFORM_ADMIN_EMAILS. Backups hold every
 * company's books, so only they see or run them (security review, 23
 * September 2026). Nobody is one unless named, so a missing setting fails
 * closed.
 */
const admins = () =>
  (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const isPlatformAdmin = (user) => Boolean(user?.email && admins().includes(String(user.email).toLowerCase()));

function requirePlatformAdmin(req, _res, next) {
  if (!isPlatformAdmin(req.user)) return next(ApiError.notFound());
  next();
}

module.exports = { isPlatformAdmin, requirePlatformAdmin };
