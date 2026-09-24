const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, rolesCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const push = require("../services/push");

/**
 * Notifications: each person's inbox in a company (/api/notifications), and
 * push to their devices (/api/push). What goes in the inbox is written where
 * it happens (a claim waiting, an order approved, a customer opening their
 * link) and by the hourly sweep below, which pushes whatever is new in Needs
 * you and the morning brief.
 */

const inbox = express.Router();
inbox.use(requireAuth, requireCompany);

inbox.get(
  "/",
  asyncHandler(async (req, res) => {
    const out = await asCompany(req, async (client) => {
      const { rows } = await client.query(
        `SELECT id, kind, title, body, href, created_at, read_at FROM notifications
          -- What Needs you lists live is not repeated here.
          WHERE company_id = $1 AND user_id = $2 AND dedupe_key NOT LIKE 'needs:%' ORDER BY created_at DESC LIMIT 50`,
        [req.companyId, req.user.id]
      );
      const { rows: n } = await client.query("SELECT count(*)::int AS n FROM notifications WHERE company_id = $1 AND user_id = $2 AND read_at IS NULL AND dedupe_key NOT LIKE 'needs:%'", [req.companyId, req.user.id]);
      return { notifications: rows, unread: n[0].n };
    });
    res.json(out);
  })
);

inbox.post(
  "/read",
  asyncHandler(async (req, res) => {
    const p = z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Which notifications?");
    await asCompany(req, (client) =>
      p.data.ids
        ? client.query("UPDATE notifications SET read_at = now() WHERE company_id = $1 AND user_id = $2 AND id = ANY($3) AND read_at IS NULL", [req.companyId, req.user.id, p.data.ids])
        : client.query("UPDATE notifications SET read_at = now() WHERE company_id = $1 AND user_id = $2 AND read_at IS NULL", [req.companyId, req.user.id])
    );
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ devices

const devices = express.Router();
devices.use(requireAuth);

devices.get(
  "/",
  asyncHandler(async (req, res) => {
    const { publicKey } = await push.vapid();
    res.json({ publicKey, devices: (await push.devices(req.user.id)).map((d) => ({ endpoint: d.endpoint, device: d.device, since: d.created_at, lastSent: d.last_sent_at })) });
  })
);

const subscription = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https only"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

devices.post(
  "/subscribe",
  asyncHandler(async (req, res) => {
    const p = z.object({ subscription, device: z.string().max(200).optional() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("That is not a push subscription.");
    await push.subscribe(req.user.id, p.data.subscription, p.data.device);
    res.status(201).json({ ok: true });
  })
);

devices.post(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    const p = z.object({ endpoint: z.string().max(1000) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Which device?");
    await push.unsubscribe(req.user.id, p.data.endpoint);
    res.json({ ok: true });
  })
);

devices.post(
  "/test",
  asyncHandler(async (req, res) => {
    const sent = await push.pushTo(req.user.id, { title: "Sentryfi", body: "Notifications work on this device.", href: "/", tag: "test" });
    res.json({ sent });
  })
);

// ------------------------------------------------------------------ the sweep

/**
 * For one person in one company: whatever is new in Needs you, and the
 * morning brief at their hour. Returns what is new, and the brief if it was due.
 */
async function sweepOne(client, req, { today, hour }) {
  const cfo = require("../ledger/cfo");
  const attention = require("./attention");
  const { companyId } = req;
  const userId = req.user.id;
  const told = [];
  for (const item of await attention.collect(client, req)) {
    const t = await push.notify(client, {
      companyId, userIds: [userId], kind: item.kind, title: item.title, body: [item.detail, item.does].filter(Boolean).join(" "), href: item.href,
      dedupeKey: `needs:${item.kind}:${item.title}:${push.againEvery(item.kind, today)}`,
    });
    if (t.length) told.push(item);
  }

  let brief = null;
  if (req.can("read")) {
    const { rows } = await client.query("SELECT send_hour, push, last_pushed_on::text AS last FROM cfo_subscriptions WHERE company_id = $1 AND user_id = $2", [companyId, userId]);
    const s = rows[0] || { send_hour: 7, push: true, last: null };
    if (s.push && s.send_hour <= hour && (!s.last || s.last < today)) {
      const b = await cfo.brief(client, { companyId, today });
      const t = await push.notify(client, { companyId, userIds: [userId], kind: "brief", title: "Your morning brief", body: b.headline, href: "/cfo", dedupeKey: `brief:${today}` });
      if (t.length) brief = b;
      await client.query(
        `INSERT INTO cfo_subscriptions (company_id, user_id, send_hour, email, last_pushed_on) VALUES ($1,$2,7,false,$3)
         ON CONFLICT (company_id, user_id) DO UPDATE SET last_pushed_on = EXCLUDED.last_pushed_on`,
        [companyId, userId, today]
      );
    }
  }
  return { told, brief };
}

/**
 * The hourly job. Starts from the people who turned push on (a table outside
 * the company walls), finds their companies as them, and steps into each
 * company as them: so it sees exactly what they would see, and nothing else.
 * More than three new things at once become one push, not a flood.
 */
function schedule() {
  const { pool, withTransaction } = require("../config/db");
  const cfo = require("../ledger/cfo");
  const tick = async () => {
    const today = cfo.todayHere();
    const hour = new Date(Date.now() + 5 * 3600000).getUTCHours();
    try {
      const { rows: people } = await pool.query("SELECT DISTINCT user_id FROM push_subscriptions");
      for (const { user_id: userId } of people) {
        const memberships = await withTransaction(async (c) => {
          await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
          return (await c.query("SELECT m.company_id, c.name, array_agg(m.role::text) AS roles FROM memberships m JOIN companies c ON c.id = m.company_id WHERE m.user_id = $1 GROUP BY m.company_id, c.name", [userId])).rows;
        });
        for (const m of memberships) {
          const req = { companyId: m.company_id, user: { id: userId }, can: (action) => rolesCan(m.roles, action) };
          try {
            const { told, brief } = await asCompany(req, (client) => sweepOne(client, req, { today, hour }));
            const where = memberships.length > 1 ? `${m.name}: ` : "";
            if (brief) await push.pushTo(userId, { title: `${where}Your morning brief`, body: brief.headline, href: "/cfo", tag: `${m.company_id}:brief`, companyId: m.company_id });
            if (told.length > 3) {
              await push.pushTo(userId, { title: `${where}${told.length} things need you`, body: told.slice(0, 3).map((t) => t.title).join(". ") + ".", href: "/", tag: `${m.company_id}:needs`, companyId: m.company_id, urgent: told.some((t) => t.kind === "money_at_risk") });
            } else {
              for (const t of told) await push.pushTo(userId, { title: `${where}${t.title}`, body: t.detail || "", href: t.href || "/", tag: `${m.company_id}:${t.title}`, companyId: m.company_id, urgent: t.kind === "money_at_risk" });
            }
          } catch (err) {
            console.error(JSON.stringify({ at: "push-sweep", company: m.company_id, error: err.message }));
          }
        }
      }
    } catch (err) {
      console.error(JSON.stringify({ at: "push-schedule", error: err.message }));
    }
    if (hour >= 8 && hour < 21) await digest(pool).catch((err) => console.error(JSON.stringify({ at: "comment-digest", error: err.message })));
  };
  setTimeout(tick, 150_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}

/**
 * The day's round-up by email: mentions, asks and comments a person has not
 * seen in the app for an hour. At most one a day each, so the app stays the
 * place to talk and email only catches what would otherwise be missed.
 */
async function digest(pool) {
  const env = require("../config/env");
  const { rows } = await pool.query(
    `SELECT n.user_id, n.company_id, u.email, u.name, c.name AS company,
            json_agg(json_build_object('id', n.id, 'title', n.title, 'body', n.body) ORDER BY n.created_at) AS items
       FROM notifications n JOIN users u ON u.id = n.user_id JOIN companies c ON c.id = n.company_id
      WHERE n.kind IN ('mention','ask','comment') AND n.read_at IS NULL AND n.emailed_at IS NULL
        AND n.created_at < now() - interval '1 hour' AND n.created_at > now() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM notifications x WHERE x.user_id = n.user_id AND x.emailed_at > now() - interval '20 hours')
      GROUP BY n.user_id, n.company_id, u.email, u.name, c.name`
  );
  for (const r of rows) {
    const items = r.items.slice(0, 10);
    await require("../services/email").send({
      to: r.email,
      subject: `${r.company}: ${r.items.length === 1 ? r.items[0].title : `${r.items.length} things your team said to you`}`,
      lines: [`Hello ${r.name},`, `While you were away, in ${r.company}:`, ...items.map((i) => `${i.title}: “${i.body}”`), ...(r.items.length > 10 ? [`And ${r.items.length - 10} more.`] : [])],
      link: { label: "Open Sentryfi", url: `${env.publicUrl}/inbox` },
    });
    await pool.query("UPDATE notifications SET emailed_at = now() WHERE id = ANY($1)", [r.items.map((i) => i.id)]);
  }
  return rows.length;
}

module.exports = inbox;
module.exports.digest = digest;
module.exports.devices = devices;
module.exports.schedule = schedule;
