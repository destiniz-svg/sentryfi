/**
 * Telling people what changed, the way the big apps do: the What's new page
 * changes with every build, but the bell hears about it in bundles.
 *
 * - A weekly round-up: once a week (Sunday from 9am Malé), everything released
 *   since the last round-up, in one notification and one push per person.
 * - A headline: a release marked `headline` is announced as soon as the first
 *   server starts with it, and is not repeated in the round-up.
 * - Only to whom it concerns: each change is counted for a person only if
 *   their role can open where it lives (payroll to those who run it, approvals
 *   to approvers, everyday work to anyone who reads the books, app-wide
 *   changes to everyone). Someone with nothing relevant hears nothing.
 *
 * What has been announced is kept in release_announcements (a release's
 * version, or a round-up's week), out of the app role's reach; claiming a row
 * first is what makes several servers announce once.
 */
const { RELEASES } = require("../releases");

// What opening a change's place takes. null: everyone, site staff included.
function needOf(item) {
  if (item.need !== undefined) return item.need;
  if (item.area === "Website") return false; // never announced in the app
  if (item.href.startsWith("/payroll")) return "run_payroll";
  if (item.href.startsWith("/approvals")) return "approve";
  if (item.href.startsWith("/whats-new") || item.href.startsWith("/inbox")) return null;
  return "read";
}
const rolesCan = (roles, action) => require("../middleware/company").rolesCan(roles, action);
const concerns = (roles, item) => {
  const need = needOf(item);
  return need === null ? true : need === false ? false : rolesCan(roles, need);
};

/** Everyone in every company, with their roles there. */
async function everyone(pool) {
  const { rows } = await pool.query("SELECT company_id, user_id, array_agg(role::text) AS roles FROM memberships GROUP BY company_id, user_id");
  return rows;
}

/**
 * Tells each person about these releases: what concerns them, in one
 * notification per company and one push per person. Returns how many were told.
 */
async function tell(pool, { releases, title, key, push }) {
  const items = releases.flatMap((r) => r.items.map((it) => ({ ...it, version: r.version })));
  const href = `/whats-new#v${releases[0].version}`;
  let told = 0;
  const pushed = new Map();
  for (const p of await everyone(pool)) {
    const mine = items.filter((it) => concerns(p.roles, it));
    if (!mine.length) continue;
    const head = typeof title === "function" ? title(mine.length) : title;
    const body = `${mine.slice(0, 3).map((it) => it.title).join(", ")}${mine.length > 3 ? `, and ${mine.length - 3} more` : ""}.`;
    const { rowCount } = await pool.query(
      `INSERT INTO notifications (company_id, user_id, kind, title, body, href, dedupe_key) VALUES ($1,$2,'release',$3,$4,$5,$6)
       ON CONFLICT (company_id, user_id, dedupe_key) DO NOTHING`,
      [p.company_id, p.user_id, head.slice(0, 200), body.slice(0, 600), href, key]
    );
    told += rowCount;
    if (rowCount && !pushed.has(p.user_id)) pushed.set(p.user_id, { title: head, body, href, tag: key });
  }
  for (const [userId, message] of pushed) await push.pushTo(userId, message).catch(() => {});
  return told;
}

const claim = async (pool, key) => (await pool.query("INSERT INTO release_announcements (version) VALUES ($1) ON CONFLICT DO NOTHING RETURNING version", [key])).rows.length > 0;
const announced = async (pool) => new Set((await pool.query("SELECT version FROM release_announcements")).rows.map((r) => r.version));

/** A headline release, straight away. */
async function headlines(pool, { push = require("./push") } = {}) {
  const done = await announced(pool);
  let told = 0;
  for (const r of RELEASES.filter((x) => x.headline && !done.has(x.version))) {
    if (!(await claim(pool, r.version))) continue;
    told += await tell(pool, { releases: [r], title: `New in Sentryfi ${r.version}: ${r.title}`, key: `release:${r.version}`, push });
  }
  return told;
}

/** The ISO week a day falls in, as 2026-W39, and whether the round-up is due in it yet. */
function weekOf(now) {
  const male = new Date(now.getTime() + 5 * 3600000);
  const d = new Date(Date.UTC(male.getUTCFullYear(), male.getUTCMonth(), male.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return { key: `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, due: male.getUTCDay() === 0 && male.getUTCHours() >= 9 };
}

/** The weekly round-up: everything not yet announced, in one notification. */
async function roundUp(pool, { now = new Date(), force = false, push = require("./push") } = {}) {
  const w = weekOf(now);
  if (!w.due && !force) return 0;
  const done = await announced(pool);
  const fresh = RELEASES.filter((r) => !done.has(r.version));
  if (!fresh.length) return 0;
  if (!(await claim(pool, `week:${w.key}`))) return 0;
  for (const r of fresh) await claim(pool, r.version);
  return tell(pool, { releases: fresh, title: (n) => `This week in Sentryfi: ${n} ${n === 1 ? "change" : "changes"} for you`, key: `week:${w.key}`, push });
}

module.exports = { headlines, roundUp, weekOf, needOf, concerns };
