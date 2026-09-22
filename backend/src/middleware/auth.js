const env = require("../config/env");
const { verifyToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const User = require("../models/User");

async function requireAuth(req, res, next) {
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

module.exports = { requireAuth };
