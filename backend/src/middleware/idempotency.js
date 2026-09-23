const env = require("../config/env");
const { verifyToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");

/**
 * A write sent with an Idempotency-Key happens once (config/field-schema.js).
 *
 * The key is claimed before the route runs. A repeat of a finished send gets
 * the first answer back, marked Idempotent-Replayed; a repeat while the first
 * is still running is told to try again shortly; a send that failed frees its
 * key, so fixing the problem and sending again works.
 *
 * ponytail: if the server dies between the route committing and the answer
 * being kept, the key stays claimed with no answer; after ten minutes it is
 * reported as "check before sending again" rather than guessed at.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idempotency(req, res, next) {
  const key = req.get("idempotency-key");
  if (!key || req.method === "GET") return next();
  if (!UUID.test(key)) return next(ApiError.badRequest("Idempotency-Key must be a UUID."));
  let userId;
  try {
    userId = verifyToken(req.cookies?.[env.cookieName]).sub;
  } catch {
    return next(); // not signed in: the route refuses it on its own
  }
  const { pool } = require("../config/db");
  const path = req.originalUrl.split("?")[0];
  (async () => {
    const claimed = await pool.query(
      "INSERT INTO request_keys (user_id, key, method, path) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key",
      [userId, key, req.method, path]
    );
    if (Math.random() < 0.02) pool.query("DELETE FROM request_keys WHERE created_at < now() - interval '7 days'").catch(() => {});
    if (!claimed.rows.length) {
      const { rows } = await pool.query("SELECT method, path, status, body, created_at FROM request_keys WHERE user_id = $1 AND key = $2", [userId, key]);
      const was = rows[0];
      if (!was) return next(ApiError.conflict("Send it again."));
      if (was.method !== req.method || was.path !== path) return next(ApiError.badRequest("That key was used for something else."));
      if (was.status === null) {
        const stale = Date.now() - new Date(was.created_at).getTime() > 10 * 60 * 1000;
        return res.status(409).json({ error: { message: stale ? "This was sent before and may have gone through. Check before sending it again." : "Still being recorded. It will be tried again." } });
      }
      res.set("Idempotent-Replayed", "true");
      return res.status(was.status).json(was.body);
    }
    // Keep the answer before it is sent: a phone that loses this reply finds it next time.
    const json = res.json.bind(res);
    res.json = (body) => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const kept = ok
        ? pool.query("UPDATE request_keys SET status = $3, body = $4 WHERE user_id = $1 AND key = $2", [userId, key, res.statusCode, JSON.stringify(body ?? null)])
        : pool.query("DELETE FROM request_keys WHERE user_id = $1 AND key = $2", [userId, key]);
      kept.catch(() => {}).finally(() => json(body));
      return res;
    };
    next();
  })().catch(next);
}

module.exports = { idempotency };
