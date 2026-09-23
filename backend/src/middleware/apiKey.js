const crypto = require("crypto");
const ApiError = require("../utils/ApiError");

/**
 * Keys for a company's own assistant and other software (config/keys-schema.js).
 *
 * A key is "Authorization: Bearer sfk_…". It acts as the person who made it,
 * in the one company it was made for, and is held to an allowlist:
 *
 *   - it reaches the books only (the prefixes below), never sign-in,
 *     passwords, backups, invitations, settings or other keys;
 *   - "read" reads; "draft" may also make a draft bill, a draft invoice or an
 *     order waiting for approval. Nothing a key does puts anything in the books:
 *     posting, approving, paying, receiving and closing are a person's, in the app.
 *
 * Every write a key makes is logged against it.
 */

const hashKey = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

// Where a key may go at all.
const REACH = /^\/api\/(mcp|auth\/me|companies\/current|bills|sales|orders|figures|statements|attention|cash|bank|periods|projects|stock|shipments|assets|loans|dimensions|claims|payments|recurring|cfo|analytics|documents|tax|gst|items)(\/|$|\?)/;
// What a "draft" key may write: making a draft, never putting it in the books.
const DRAFTS = [/^\/api\/bills$/, /^\/api\/sales$/, /^\/api\/orders$/];
// What any key may send that changes nothing.
// The MCP endpoint writes nothing itself: each of its tools comes back through this gate.
const QUESTIONS = [/^\/api\/cfo\/ask$/, /^\/api\/mcp$/];

const bearer = (req) => {
  const h = req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
};

/** The key on the request, if there is one: { id, name, scope, companyId, userId }. */
async function keyOf(req) {
  const token = bearer(req);
  if (!token) return null;
  if (!token.startsWith("sfk_")) throw ApiError.unauthorized("That is not a Sentryfi key.");
  const { pool } = require("../config/db");
  const { rows } = await pool.query(
    "SELECT id, name, scope, company_id, user_id FROM api_keys WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashKey(token)]
  );
  if (!rows[0]) throw ApiError.unauthorized("That key has been turned off, or was never made.");
  pool.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [rows[0].id]).catch(() => {});
  const k = rows[0];
  return { id: k.id, name: k.name, scope: k.scope, companyId: k.company_id, userId: k.user_id };
}

/** Runs on every /api request: where a key may go, and what it may write. */
function keyGate(req, res, next) {
  if (!bearer(req)) return next();
  const path = req.originalUrl.split("?")[0];
  if (!REACH.test(path)) return next(ApiError.forbidden("An assistant's key reaches the books, not this."));
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (!write) return next();
  keyOf(req)
    .then((key) => {
      const may = QUESTIONS.some((r) => r.test(path)) || (key.scope === "draft" && req.method === "POST" && DRAFTS.some((r) => r.test(path)));
      if (!may)
        throw ApiError.forbidden(
          key.scope === "draft"
            ? "An assistant may read and make drafts. Putting anything in the books, approving or paying is for a person, in Sentryfi."
            : "This key reads only."
        );
      res.on("finish", () => {
        require("../config/db").pool.query("INSERT INTO api_key_log (key_id, method, path, status) VALUES ($1,$2,$3,$4)", [key.id, req.method, path, res.statusCode]).catch(() => {});
      });
      next();
    })
    .catch(next);
}

/** What a key may do, whatever the person's role allows beyond it. */
const KEY_CAN = { read: ["read", "read_trail"], draft: ["read", "read_trail", "record", "capture", "order"] };

module.exports = { keyOf, keyGate, hashKey, KEY_CAN };
