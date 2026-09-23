/**
 * Notifications: written to each person's inbox, then pushed to every device
 * they turned push on for.
 *
 * notify() runs inside the company's transaction, as the app role, so it can
 * only write to the company it is in. The push itself goes out afterwards on
 * the server's own connection, because subscriptions are out of the app role's
 * reach. A device that has gone (404, 410) is forgotten.
 */
const webpush = require("web-push");
// Loaded when first used: notify() and membersWith() need only the transaction they are given.
const db = () => require("../config/db").pool;
const rolesCan = (roles, action) => require("../middleware/company").rolesCan(roles, action);

let keys = null;

/** The server's VAPID key pair: made once, kept in the database, the same on every server. */
async function vapid() {
  if (keys) return keys;
  let { rows } = await db().query("SELECT public_key, private_key FROM push_keys WHERE id = 1");
  if (!rows.length) {
    const k = webpush.generateVAPIDKeys();
    await db().query("INSERT INTO push_keys (id, public_key, private_key) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING", [k.publicKey, k.privateKey]);
    ({ rows } = await db().query("SELECT public_key, private_key FROM push_keys WHERE id = 1"));
  }
  keys = { publicKey: rows[0].public_key, privateKey: rows[0].private_key };
  webpush.setVapidDetails("mailto:support@sentryfi.app", keys.publicKey, keys.privateKey);
  return keys;
}

async function subscribe(userId, { endpoint, keys: k }, device) {
  await db().query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, device = EXCLUDED.device`,
    [userId, endpoint, k.p256dh, k.auth, device ? String(device).slice(0, 200) : null]
  );
}

async function unsubscribe(userId, endpoint) {
  await db().query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [userId, endpoint]);
}

async function devices(userId) {
  const { rows } = await db().query("SELECT endpoint, device, created_at, last_sent_at FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at", [userId]);
  return rows;
}

/** Pushes to every device of one person. Returns how many took it. */
async function pushTo(userId, message) {
  const { rows } = await db().query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", [userId]);
  if (!rows.length) return 0;
  await vapid();
  let sent = 0;
  for (const s of rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 24 * 3600, urgency: message.urgent ? "high" : "normal" });
      await db().query("UPDATE push_subscriptions SET last_sent_at = now() WHERE id = $1", [s.id]);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await db().query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
      else console.error(JSON.stringify({ at: "push", status: err.statusCode, error: err.message }));
    }
  }
  return sent;
}

/** Writes to these people's inboxes, once each. Inside the company's transaction. Returns who was told. */
async function notify(client, { companyId, userIds, kind, title, body = "", href = null, dedupeKey }) {
  const told = [];
  for (const userId of new Set(userIds)) {
    const { rows } = await client.query(
      `INSERT INTO notifications (company_id, user_id, kind, title, body, href, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (company_id, user_id, dedupe_key) DO NOTHING RETURNING id`,
      [companyId, userId, kind, title.slice(0, 200), body.slice(0, 600), href, dedupeKey || `${kind}:${title}`]
    );
    if (rows.length) told.push({ userId, id: rows[0].id });
  }
  return told;
}

/** Members of the company whose roles can do `action`. Inside the company's transaction. */
async function membersWith(client, companyId, action) {
  const { rows } = await client.query("SELECT user_id, array_agg(role::text) AS roles FROM memberships WHERE company_id = $1 GROUP BY user_id", [companyId]);
  return rows.filter((r) => rolesCan(r.roles, action)).map((r) => r.user_id);
}

/**
 * Tells, and pushes: behind a savepoint, so an inbox problem never rolls back
 * the approval or payment it was about.
 */
async function tell(client, what) {
  await client.query("SAVEPOINT tell");
  try {
    const told = await notify(client, what);
    await client.query("RELEASE SAVEPOINT tell");
    // ponytail: pushed a moment later, not strictly after COMMIT; a rolled-back
    // action can still ping. Hook the transaction's commit if that ever matters.
    if (told.length) {
      const message = { title: what.title, body: what.body || "", href: what.href || "/", tag: `${what.companyId}:${what.dedupeKey || what.kind}`, companyId: what.companyId, urgent: what.kind === "money_at_risk" };
      setTimeout(() => told.forEach((t) => pushTo(t.userId, message).catch(() => {})), 250).unref?.();
    }
    return told.length;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT tell");
    console.error(JSON.stringify({ at: "notify", kind: what.kind, error: err.message }));
    return 0;
  }
}

/** The day, or the week, a thing is said again if it is still true. */
function againEvery(kind, today) {
  if (kind === "money_at_risk" || kind === "blocked") return today;
  const d = new Date(today + "T00:00:00Z");
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
  return "week of " + monday.toISOString().slice(0, 10);
}

module.exports = { againEvery, vapid, subscribe, unsubscribe, devices, pushTo, notify, tell, membersWith };
