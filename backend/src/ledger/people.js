const crypto = require("crypto");
const bcrypt = require("bcrypt");

/**
 * Who is in a company, and what each of them may do.
 *
 * Every function here runs on a client already acting as the company (see
 * session.js), except the two that read or accept an invitation, which are
 * reached from a link by someone who is not in the company yet. Those take the
 * company from the link itself and act as it for the one transaction.
 */

const ROLES = [
  "administrator", "accountant", "manager", "approver", "viewer",
  "auditor", "site_staff", "cash_holder", "procurement",
];

const hash = (secret) => crypto.createHash("sha256").update(secret).digest("hex");

async function log(client, { companyId, email, role, change, by }) {
  await client.query(
    `INSERT INTO people_changes (company_id, email, role, change, by_user) VALUES ($1,$2,$3,$4,$5)`,
    [companyId, email, role, change, by || null]
  );
}

function checkRole(role) {
  if (!ROLES.includes(role)) throw new Error(`"${role}" is not a role.`);
}

/** Everyone in, their roles, the invitations still open, and the last changes. */
async function list(client, { companyId }) {
  const { rows: members } = await client.query(
    `SELECT u.id AS user_id, u.name, u.email, array_agg(m.role::text ORDER BY m.role) AS roles
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1
      GROUP BY u.id ORDER BY u.name`,
    [companyId]
  );
  const { rows: invites } = await client.query(
    `SELECT id, email, role::text AS role, created_at, expires_at FROM invites
      WHERE company_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [companyId]
  );
  const { rows: changes } = await client.query(
    `SELECT c.email, c.role::text AS role, c.change, c.at, u.name AS by_name
       FROM people_changes c LEFT JOIN users u ON u.id = c.by_user
      WHERE c.company_id = $1 ORDER BY c.at DESC LIMIT 20`,
    [companyId]
  );
  return { members, invites, changes };
}

/**
 * Someone with a login is in at once. Anyone else gets a link; the secret in
 * it is returned once, here, and only its hash is kept.
 */
async function add(client, { companyId, userId, email, role }) {
  checkRole(role);
  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("That is not an email address.");

  const { rows: found } = await client.query("SELECT id, name FROM users WHERE email = $1", [clean]);
  if (found[0]) {
    const { rowCount } = await client.query(
      `INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, company_id, role) DO NOTHING`,
      [found[0].id, companyId, role]
    );
    if (!rowCount) throw new Error(`${found[0].name} already has that role here.`);
    await log(client, { companyId, email: clean, role, change: "added", by: userId });
    return { added: true, name: found[0].name };
  }

  const secret = crypto.randomBytes(24).toString("base64url");
  await client.query(
    `INSERT INTO invites (company_id, email, role, token_hash, invited_by) VALUES ($1,$2,$3,$4,$5)`,
    [companyId, clean, role, hash(secret), userId]
  );
  await log(client, { companyId, email: clean, role, change: "invited", by: userId });
  // The company travels in the link so the join page can act as it; the
  // secret is what proves the link was given out.
  return { added: false, token: `${companyId}.${secret}` };
}

async function withdraw(client, { companyId, userId, inviteId }) {
  const { rows } = await client.query(
    `UPDATE invites SET revoked_at = now()
      WHERE id = $1 AND company_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
      RETURNING email, role::text AS role`,
    [inviteId, companyId]
  );
  if (!rows[0]) throw new Error("That invitation is not open.");
  await log(client, { companyId, email: rows[0].email, role: rows[0].role, change: "invite_withdrawn", by: userId });
}

/** Takes one role away. The last administrator stays, or nobody could ever add anyone again. */
async function removeRole(client, { companyId, userId, memberId, role }) {
  checkRole(role);
  if (role === "administrator") {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM memberships WHERE company_id = $1 AND role = 'administrator'`,
      [companyId]
    );
    if (rows[0].n <= 1) throw new Error("This is the only administrator. Make someone else one first.");
  }
  const { rows } = await client.query(
    `DELETE FROM memberships m USING users u
      WHERE m.user_id = $1 AND m.company_id = $2 AND m.role = $3 AND u.id = m.user_id
      RETURNING u.email`,
    [memberId, companyId, role]
  );
  if (!rows[0]) throw new Error("They do not have that role here.");
  await log(client, { companyId, email: rows[0].email, role, change: "removed", by: userId });
}

function splitToken(token) {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/.exec(String(token || ""));
  if (!m) throw new Error("That link is not a Sentryfi invitation.");
  return { companyId: m[1], secret: m[2] };
}

/**
 * What a link offers. Runs as the company named in the link, with nobody
 * signed in; a wrong secret finds nothing, the same as a wrong company.
 */
async function readInvite(client, { token }) {
  const { companyId, secret } = splitToken(token);
  await client.query("SET LOCAL ROLE sentryfi_app");
  await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
  const { rows } = await client.query(
    `SELECT i.id, i.email, i.role::text AS role, i.accepted_at, i.revoked_at, i.expires_at < now() AS expired,
            c.name AS company, c.id AS company_id
       FROM invites i JOIN companies c ON c.id = i.company_id
      WHERE i.token_hash = $1`,
    [hash(secret)]
  );
  const invite = rows[0];
  if (!invite) throw new Error("That invitation does not exist. Ask for a new link.");
  if (invite.accepted_at) throw new Error("That invitation has already been used. Sign in instead.");
  if (invite.revoked_at) throw new Error("That invitation was withdrawn. Ask for a new link.");
  if (invite.expired) throw new Error("That invitation has run out. Ask for a new link.");
  return invite;
}

/**
 * Joins. A new person sets a name and password; someone who already has a
 * login proves it with their password. Returns the user to sign in as.
 */
async function acceptInvite(client, { token, name, password }) {
  // Users are outside the company walls; find or make the person first, as
  // the connection's own role, then step inside.
  const probe = splitToken(token);
  await client.query("SELECT set_config('app.company_id', $1, true)", [probe.companyId]);
  const { rows: pending } = await client.query(
    `SELECT email FROM invites WHERE token_hash = $1 AND company_id = $2`,
    [hash(probe.secret), probe.companyId]
  );
  if (!pending[0]) throw new Error("That invitation does not exist. Ask for a new link.");
  const email = pending[0].email;

  let user = (await client.query("SELECT id, name, email, password_hash FROM users WHERE email = $1", [email])).rows[0];
  if (user) {
    if (!(await bcrypt.compare(String(password || ""), user.password_hash))) {
      throw new Error("That is not the password for " + email + ".");
    }
  } else {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("What is your name?");
    if (String(password || "").length < 8) throw new Error("A password needs at least eight characters.");
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email`,
      [clean.slice(0, 80), email, await bcrypt.hash(password, 12)]
    );
    user = rows[0];
  }

  const invite = await readInvite(client, { token });
  await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
  await client.query(
    `INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [user.id, invite.company_id, invite.role]
  );
  const { rowCount } = await client.query(
    `UPDATE invites SET accepted_at = now(), accepted_by = $2 WHERE id = $1 AND accepted_at IS NULL`,
    [invite.id, user.id]
  );
  if (!rowCount) throw new Error("That invitation has already been used. Sign in instead.");
  await log(client, { companyId: invite.company_id, email, role: invite.role, change: "joined", by: user.id });
  return { user: { id: user.id, name: user.name, email: user.email }, companyId: invite.company_id };
}

module.exports = { ROLES, list, add, withdraw, removeRole, readInvite, acceptInvite, splitToken };
