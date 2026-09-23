const env = require("../config/env");
const { verifyToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const User = require("../models/User");

/** Someone who has not yet confirmed their email address, while Sentryfi can send one. */
const mustVerify = (user) => Boolean(env.resendApiKey) && !user.email_verified_at;

/** A valid session, confirmed address or not. Only the few routes that help someone confirm it use this. */
async function requireSession(req, res, next) {
  try {
    const token = req.cookies?.[env.cookieName];
    if (!token) throw ApiError.unauthorized();

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized("Session no longer valid");
    // Signed before the last password change or "sign out everywhere".
    if ((payload.v || 0) !== (user.token_version || 0)) throw ApiError.unauthorized("Session no longer valid");
    delete user.token_version;

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return next(ApiError.unauthorized("Invalid or expired session"));
    }
    next(err);
  }
}

/** A valid session for someone who has confirmed their email address. */
function requireAuth(req, res, next) {
  requireSession(req, res, (err) => {
    if (err) return next(err);
    if (mustVerify(req.user)) return next(ApiError.forbidden("Confirm your email address first. We sent you a link."));
    next();
  });
}

module.exports = { requireAuth, requireSession, mustVerify };
