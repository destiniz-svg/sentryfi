const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { pool } = require("../config/db");
const env = require("../config/env");
const mail = require("../ledger/customerMail");

/**
 * Statements and reminders that send themselves (ledger/customerMail.js):
 * the settings, what has gone, and the hourly job that sends what is due.
 */
const router = express.Router();
router.use(requireAuth, requireCompany);

const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** A private link to the customer's page, made outside the walls. */
async function pageLink({ companyId, counterpartyId, userId, open }) {
  const token = crypto.randomBytes(24).toString("base64url");
  await pool.query("INSERT INTO portal_links (company_id, counterparty_id, token_hash, created_by) VALUES ($1,$2,$3,$4)", [companyId, counterpartyId, hash(token), userId]);
  return `${env.publicUrl}/portal/${token}${open ? `?open=${open}` : ""}`;
}

/** Sends one company's statements and reminders that are due today. */
async function sendDue({ companyId, userId }) {
  const who = { companyId, user: { id: userId } };
  const { due, company } = await asCompany(who, async (client) => ({
    due: await mail.due(client, { companyId }),
    company: (await client.query("SELECT name, trim(base_currency) AS base, payment_details, brand ->> 'email' AS email FROM companies WHERE id = $1", [companyId])).rows[0],
  }));
  const email = require("../services/email");
  const replyTo = company.email ? { replyTo: `${company.name} <${company.email}>` } : {};
  const pay = company.payment_details ? [`How to pay: ${company.payment_details}`] : [];
  let sent = 0;
  for (const s of due.statements) {
    try {
      const url = await pageLink({ companyId, counterpartyId: s.counterpartyId, userId });
      await email.send({
        to: s.email,
        subject: `Your statement from ${company.name}, ${monthName(s.month)}`,
        lines: [`${company.name}: ${company.base} ${s.owed} is still to pay on ${s.invoices} ${s.invoices === 1 ? "invoice" : "invoices"}.`, ...pay, "Your page shows each invoice, what is paid and what is left. Ask about anything there."],
        link: { label: "See your account", url },
        ...replyTo,
      });
      await asCompany(who, (client) => mail.logSent(client, { companyId, key: s.key, kind: "statement", counterpartyId: s.counterpartyId, to: s.email }));
      sent += 1;
    } catch (err) {
      console.error(JSON.stringify({ at: "statement-mail", company: companyId, error: err.message }));
    }
  }
  for (const r of due.reminders) {
    try {
      const url = await pageLink({ companyId, counterpartyId: r.counterpartyId, userId, open: `invoice:${r.invoiceId}` });
      await email.send({
        to: r.email,
        subject: `Reminder: invoice ${r.number} from ${company.name} is ${r.daysLate} days past its due date`,
        lines: [`Invoice ${r.number} was due on ${r.due}. ${company.base} ${r.owed} is still to pay.`, ...pay, "If it has been paid, thank you: reply and say when, and it will be matched. If something on it is wrong, ask on your page."],
        link: { label: `See invoice ${r.number}`, url },
        ...replyTo,
      });
      await asCompany(who, (client) => mail.logSent(client, { companyId, key: r.key, kind: "reminder", counterpartyId: r.counterpartyId, invoiceId: r.invoiceId, to: r.email }));
      sent += 1;
    } catch (err) {
      console.error(JSON.stringify({ at: "reminder-mail", company: companyId, error: err.message }));
    }
  }
  return { statements: due.statements.length, reminders: due.reminders.length, sent };
}

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    res.json(
      await asCompany(req, async (client) => ({
        settings: await mail.settings(client, { companyId: req.companyId }),
        due: await mail.due(client, { companyId: req.companyId }),
        recent: await mail.recent(client, { companyId: req.companyId }),
        noEmail: Number((await client.query("SELECT count(*) FROM counterparties WHERE company_id = $1 AND 'customer' = ANY(kind) AND archived_at IS NULL AND (email IS NULL OR email = '')", [req.companyId])).rows[0].count),
      }))
    );
  })
);

router.put(
  "/",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const p = z.object({ monthlyStatements: z.boolean(), reminders: z.boolean(), reminderDays: z.array(z.coerce.number().int()).max(6).optional() }).safeParse(req.body ?? {});
    if (!p.success) throw ApiError.badRequest(p.error.issues[0].message);
    try {
      res.json(await asCompany(req, (client) => mail.save(client, { companyId: req.companyId, userId: req.user.id, ...p.data })));
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

// Send what is due now, rather than waiting for the hour.
router.post(
  "/send",
  requireCan("record"),
  asyncHandler(async (req, res) => {
    res.json(await sendDue({ companyId: req.companyId, userId: req.user.id }));
  })
);

function schedule() {
  const tick = async () => {
    try {
      const { rows } = await pool.query("SELECT company_id, updated_by FROM customer_mail_settings WHERE (monthly_statements OR reminders) AND updated_by IS NOT NULL");
      for (const r of rows) await sendDue({ companyId: r.company_id, userId: r.updated_by }).catch((err) => console.error(JSON.stringify({ at: "customer-mail", company: r.company_id, error: err.message })));
    } catch (err) {
      console.error(JSON.stringify({ at: "customer-mail-schedule", error: err.message }));
    }
  };
  setTimeout(tick, 120_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}

module.exports = router;
module.exports.schedule = schedule;
module.exports.sendDue = sendDue;
