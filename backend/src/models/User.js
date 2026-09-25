const bcrypt = require("bcrypt");
const { query, queryOne } = require("../config/db");

const PUBLIC_COLS = "id, email, name, created_at, updated_at, token_version, email_verified_at, shortcuts";

function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function findByEmail(email) {
  return queryOne(`SELECT * FROM users WHERE email = $1`, [email]);
}

async function findById(id) {
  return queryOne(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [id]);
}

async function findByIdWithHash(id) {
  return queryOne(`SELECT * FROM users WHERE id = $1`, [id]);
}

async function create({ name, email, passwordHash }) {
  return queryOne(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLS}`,
    [name, email, passwordHash]
  );
}

async function updateName(id, name) {
  return queryOne(
    `UPDATE users SET name = $2, updated_at = now()
     WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
    [id, name]
  );
}

/** Ends every session signed before now. Returns the new version. */
async function bumpTokenVersion(id) {
  const row = await queryOne("UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version", [id]);
  return row?.token_version;
}

async function markVerified(id) {
  await query("UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1", [id]);
}

async function updatePassword(id, passwordHash) {
  await query(
    `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [id, passwordHash]
  );
}

/** The Record sheet's shortcuts, in order; null goes back to the usual set. */
async function setShortcuts(id, shortcuts) {
  return queryOne("UPDATE users SET shortcuts = $2 WHERE id = $1 RETURNING shortcuts", [id, shortcuts]);
}

module.exports = {
  setShortcuts,
  bumpTokenVersion,
  markVerified,
  PUBLIC_COLS,
  hashPassword,
  comparePassword,
  findByEmail,
  findById,
  findByIdWithHash,
  create,
  updateName,
  updatePassword,
};
