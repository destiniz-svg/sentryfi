/**
 * Sentryfi's own customers, as the people who run it see them: who signed up,
 * what they opened, how far into the trial they are, and whether they use it.
 *
 * These read across every company, so they run on the connection's own role,
 * never as a company (routes/platform.js lets only a platform admin in). They
 * read names, dates and counts, never the contents of anyone's books.
 */

const TRIAL_DAYS = 30;
const DAY = 86400000;

/** Where a company's trial stands, in the words a screen shows. */
function trialOf({ plan, trial_ends_at: ends }, now = new Date()) {
  if (plan !== "trial") return { plan, endsAt: null, daysLeft: null, ended: false };
  if (!ends) return { plan, endsAt: null, daysLeft: TRIAL_DAYS, ended: false };
  const left = Math.ceil((new Date(ends) - now) / DAY);
  return { plan, endsAt: new Date(ends).toISOString(), daysLeft: Math.max(0, left), ended: new Date(ends) <= now };
}

async function overview(client) {
  const { rows: t } = await client.query(`
    SELECT (SELECT count(*) FROM users)::int AS people,
           (SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL)::int AS verified,
           (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '7 days')::int AS active_week,
           (SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id))::int AS no_company,
           (SELECT count(*) FROM companies)::int AS companies,
           (SELECT count(*) FROM companies WHERE plan = 'trial' AND trial_ends_at > now())::int AS on_trial,
           (SELECT count(*) FROM companies WHERE plan = 'trial' AND trial_ends_at > now() AND trial_ends_at <= now() + interval '7 days')::int AS ending_soon,
           (SELECT count(*) FROM companies WHERE plan = 'trial' AND trial_ends_at <= now())::int AS ended,
           (SELECT count(*) FROM companies WHERE plan = 'paid')::int AS paid`);
  const { rows: days } = await client.query(`
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
           (SELECT count(*) FROM users u WHERE u.created_at >= d AND u.created_at < d + interval '1 day')::int AS signups
      FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
     ORDER BY d`);
  return { totals: t[0], signups: days };
}

async function customers(client, now = new Date()) {
  const { rows } = await client.query(`
    SELECT c.id, c.name, c.created_at, c.base_currency, c.tax_pack, c.industry, c.gst_registered, c.gst_sector,
           c.tin, c.registration_no, c.year_starts, c.plan, c.trial_ends_at,
           COALESCE((SELECT json_agg(json_build_object(
                       'id', u.id, 'name', u.name, 'email', u.email, 'role', m.role,
                       'verified', u.email_verified_at IS NOT NULL, 'signedUp', u.created_at, 'lastSeen', u.last_seen_at)
                     ORDER BY m.created_at)
                       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = c.id), '[]') AS people,
           (SELECT count(*) FROM journal_entries e WHERE e.company_id = c.id)::int AS entries,
           (SELECT max(e.posted_at) FROM journal_entries e WHERE e.company_id = c.id) AS last_entry,
           (SELECT count(*) FROM bills b WHERE b.company_id = c.id)::int AS bills,
           (SELECT count(*) FROM sales_invoices s WHERE s.company_id = c.id)::int AS invoices
      FROM companies c
     ORDER BY c.created_at DESC`);
  const { rows: loose } = await client.query(`
    SELECT id, name, email, created_at, email_verified_at IS NOT NULL AS verified, last_seen_at
      FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
     ORDER BY created_at DESC`);
  return {
    companies: rows.map((c) => {
      // The person who opened the books is their first administrator.
      const owner = c.people.find((p) => p.role === "administrator") || c.people[0] || null;
      const lastSeen = c.people.map((p) => p.lastSeen).filter(Boolean).sort().pop() || null;
      return {
        id: c.id,
        name: c.name,
        openedAt: c.created_at,
        country: c.tax_pack,
        currency: c.base_currency,
        industry: c.industry,
        gst: { registered: c.gst_registered, sector: c.gst_sector, tin: c.tin },
        registrationNo: c.registration_no,
        yearStarts: c.year_starts,
        trial: trialOf(c, now),
        owner,
        people: c.people,
        lastSeen,
        usage: { entries: c.entries, bills: c.bills, invoices: c.invoices, lastEntry: c.last_entry },
      };
    }),
    // Signed up and never opened a set of books.
    noCompany: loose.map((u) => ({ id: u.id, name: u.name, email: u.email, signedUp: u.created_at, verified: u.verified, lastSeen: u.last_seen_at })),
  };
}

async function record(client, { actor, action, target, detail = {} }) {
  await client.query("INSERT INTO platform_events (actor_email, action, target, detail) VALUES ($1,$2,$3,$4)", [actor, action, target, detail]);
}

async function events(client, { limit = 50 } = {}) {
  const { rows } = await client.query("SELECT at, actor_email AS actor, action, target, detail FROM platform_events ORDER BY at DESC LIMIT $1", [limit]);
  return rows;
}

async function companyName(client, companyId) {
  const { rows } = await client.query("SELECT name FROM companies WHERE id = $1", [companyId]);
  if (!rows[0]) throw Object.assign(new Error("There is no such customer."), { status: 404 });
  return rows[0].name;
}

/** More days, counted from today or from the day it would have ended, whichever is later. */
async function extendTrial(client, { companyId, days, actor, reason }) {
  const name = await companyName(client, companyId);
  await client.query(
    `UPDATE companies SET plan = 'trial', trial_ends_at = GREATEST(now(), COALESCE(trial_ends_at, now())) + make_interval(days => $2)
      WHERE id = $1`,
    [companyId, days]
  );
  await record(client, { actor, action: "extend_trial", target: name, detail: { companyId, days, reason } });
}

async function setPlan(client, { companyId, plan, actor, reason }) {
  const name = await companyName(client, companyId);
  await client.query(
    `UPDATE companies SET plan = $2, trial_ends_at = CASE WHEN $2 = 'trial' THEN COALESCE(trial_ends_at, now() + interval '${TRIAL_DAYS} days') ELSE trial_ends_at END
      WHERE id = $1`,
    [companyId, plan]
  );
  await record(client, { actor, action: "set_plan", target: name, detail: { companyId, plan, reason } });
}

module.exports = { TRIAL_DAYS, trialOf, overview, customers, events, extendTrial, setPlan };
