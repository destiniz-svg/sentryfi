const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const cfo = require("../ledger/cfo");

/** The CFO: the morning brief, the four figures, the profile, what it noticed. See ledger/cfo.js. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const strip = (x) => {
  const { raw, ...rest } = x;
  return rest;
};
const on = (req, fn) => asCompany(req, (client) => fn(client, { companyId: req.companyId, userId: req.user.id, today: cfo.todayHere() }));

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const out = await on(req, async (client, ctx) => ({
      brief: await cfo.brief(client, ctx),
      figures: strip(await cfo.figures(client, ctx)),
      profile: strip(await cfo.profile(client, ctx)),
      noticed: await cfo.noticed(client, ctx),
      market: await cfo.market(client, ctx),
      subscription: (await client.query("SELECT send_hour, email, push FROM cfo_subscriptions WHERE company_id = $1 AND user_id = $2", [ctx.companyId, ctx.userId])).rows[0] || null,
      health: await cfo.health(client, ctx),
      written: Boolean(require("../config/env").geminiApiKey),
    }));
    res.json(out);
  })
);

router.post(
  "/brief",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json({ brief: await on(req, (client, ctx) => cfo.brief(client, { ...ctx, fresh: true })) });
  })
);

router.post(
  "/ask",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const p = z.object({ question: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("Ask a question, in up to 500 characters.");
    const gemini = require("../services/geminiService");
    if (!gemini.available()) throw ApiError.badRequest("Asking needs a Gemini key on the server.");
    const out = await on(req, async (client, ctx) => {
      const { rows } = await client.query("SELECT name FROM companies WHERE id = $1", [ctx.companyId]);
      return require("../ledger/cfoAsk").ask(client, { ...ctx, company: rows[0]?.name || "the company", question: p.data.question }, gemini.generate);
    });
    res.json(out);
  })
);

router.get(
  "/briefs/:date",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) throw ApiError.badRequest("A date is YYYY-MM-DD.");
    const row = await on(req, async (client, ctx) => (await client.query("SELECT body FROM cfo_briefs WHERE company_id = $1 AND for_date = $2", [ctx.companyId, req.params.date])).rows[0]);
    if (!row) throw ApiError.notFound("There is no brief for that day.");
    res.json({ brief: row.body });
  })
);

router.put(
  "/notes",
  requireCan("record", "manage_settings"),
  asyncHandler(async (req, res) => {
    const p = z.object({ topic: z.string().trim().min(1).max(60), note: z.string().trim().max(600) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("A topic, and what it should know.");
    await on(req, async (client, ctx) => {
      if (!p.data.note) await client.query("DELETE FROM cfo_notes WHERE company_id = $1 AND topic = $2", [ctx.companyId, p.data.topic]);
      else
        await client.query(
          `INSERT INTO cfo_notes (company_id, topic, note, written_by) VALUES ($1,$2,$3,$4)
           ON CONFLICT (company_id, topic) DO UPDATE SET note = EXCLUDED.note, written_by = EXCLUDED.written_by, written_at = now()`,
          [ctx.companyId, p.data.topic, p.data.note, ctx.userId]
        );
    });
    res.json({ ok: true });
  })
);

router.put(
  "/subscription",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const p = z.object({ sendHour: z.coerce.number().int().min(0).max(23), email: z.boolean(), push: z.boolean().default(true) }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest("An hour from 0 to 23, and whether to email it.");
    await on(req, (client, ctx) =>
      client.query(
        `INSERT INTO cfo_subscriptions (company_id, user_id, send_hour, email, push) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, user_id) DO UPDATE SET send_hour = EXCLUDED.send_hour, email = EXCLUDED.email, push = EXCLUDED.push`,
        [ctx.companyId, ctx.userId, p.data.sendHour, p.data.email, p.data.push]
      )
    );
    res.json({ ok: true });
  })
);

/**
 * The hourly job: each person who asked for the brief by email gets it at
 * their hour, Maldives time, once a day. If the database hides subscriptions
 * from this connection, the brief is still there in the app.
 */
function schedule() {
  const { pool } = require("../config/db");
  const { send } = require("../services/email");
  const env = require("../config/env");
  const tick = async () => {
    const today = cfo.todayHere();
    const hour = new Date(Date.now() + 5 * 3600000).getUTCHours();
    try {
      const { rows } = await pool.query(
        `SELECT s.company_id, s.user_id, u.email, u.name, c.name AS company FROM cfo_subscriptions s
           JOIN users u ON u.id = s.user_id JOIN companies c ON c.id = s.company_id
          WHERE s.email AND s.send_hour <= $1 AND (s.last_sent_on IS NULL OR s.last_sent_on < $2)`,
        [hour, today]
      );
      for (const r of rows) {
        try {
          const b = await asCompany({ companyId: r.company_id, user: { id: r.user_id } }, (client) => cfo.brief(client, { companyId: r.company_id, today }));
          await send({
            from: "Sentryfi <cfo@sentryfi.app>",
            to: r.email,
            subject: `${r.company}: your morning brief`,
            lines: [`Good morning, ${r.name}.`, ...cfo.asText(b)],
            link: { label: "Open it, with every figure's entries", url: `${env.publicUrl}/cfo` },
          });
          await pool.query("UPDATE cfo_subscriptions SET last_sent_on = $3 WHERE company_id = $1 AND user_id = $2", [r.company_id, r.user_id, today]);
        } catch (err) {
          console.error(JSON.stringify({ at: "cfo-brief-email", company: r.company_id, error: err.message }));
        }
      }
    } catch (err) {
      console.error(JSON.stringify({ at: "cfo-schedule", error: err.message }));
    }
  };
  setTimeout(tick, 120_000).unref();
  setInterval(tick, 20 * 60_000).unref();
}

module.exports = router;
module.exports.schedule = schedule;
