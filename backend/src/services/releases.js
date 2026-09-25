/**
 * Announcing a release: once, when the first server starts with it. Every
 * person in every company finds it in the bell ("New in Sentryfi 1.13: ..."),
 * and their phones get one push each. The table of announced versions is out
 * of the app role's reach; this runs on the server's own connection.
 */
const { RELEASES } = require("../releases");

async function announce(pool, { push = require("./push") } = {}) {
  const r = RELEASES[0];
  const { rows: claimed } = await pool.query("INSERT INTO release_announcements (version) VALUES ($1) ON CONFLICT DO NOTHING RETURNING version", [r.version]);
  if (!claimed.length) return 0;
  const { rows: people } = await pool.query("SELECT DISTINCT company_id, user_id FROM memberships");
  const title = `New in Sentryfi ${r.version}: ${r.title}`;
  const body = r.summary;
  const href = `/whats-new#v${r.version}`;
  let told = 0;
  for (const p of people) {
    const { rowCount } = await pool.query(
      `INSERT INTO notifications (company_id, user_id, kind, title, body, href, dedupe_key) VALUES ($1,$2,'release',$3,$4,$5,$6)
       ON CONFLICT (company_id, user_id, dedupe_key) DO NOTHING`,
      [p.company_id, p.user_id, title.slice(0, 200), body.slice(0, 600), href, `release:${r.version}`]
    );
    told += rowCount;
  }
  await pool.query("UPDATE release_announcements SET told = $2 WHERE version = $1", [r.version, told]);
  // One push per person, whatever number of companies they are in.
  for (const userId of new Set(people.map((p) => p.user_id))) {
    await push.pushTo(userId, { title, body, href, tag: `release:${r.version}` }).catch(() => {});
  }
  return told;
}

module.exports = { announce };
