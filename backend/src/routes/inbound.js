const crypto = require("crypto");
const express = require("express");
const env = require("../config/env");
const { send, FROM } = require("../services/email");

/**
 * Mail sent to any @sentryfi.app address (support@ above all) arrives at
 * Resend, which calls this. Sentryfi fetches the message and forwards it to
 * the inbox the owner reads, with Reply going straight back to the sender.
 *
 * Resend signs each call (Svix): HMAC-SHA256 over "id.timestamp.body" with the
 * webhook's secret. Anything unsigned, stale or wrongly signed is refused.
 * ponytail: attachments are listed by name, not carried; fetch them in Resend
 * if a customer sends one that matters.
 */

const router = express.Router();

function signedByResend(req) {
  const secret = env.resendWebhookSecret;
  const id = req.get("svix-id");
  const ts = req.get("svix-timestamp");
  const sigs = req.get("svix-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${req.body.toString("utf8")}`).digest();
  return sigs.split(" ").some((s) => {
    const got = Buffer.from(s.replace(/^v1,/, ""), "base64");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

router.post("/email", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  if (!signedByResend(req)) return res.status(401).json({ error: "Not signed by Resend" });
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Not JSON" });
  }
  if (event.type !== "email.received") return res.json({ ok: true, ignored: event.type });

  const meta = event.data || {};
  const from = String(meta.from || "");
  // Never forward a forward back round: that is how loops start. Forwards go
  // out as support@, so only that is skipped. Sentryfi's own account mail
  // (accounts@, security@) to a sentryfi.app person, such as the developer's
  // confirm-your-email and reset links, is exactly what must come through;
  // skipping every @sentryfi.app sender dropped those.
  if (/support@sentryfi\.app>?$/i.test(from)) return res.json({ ok: true, ignored: "own forward" });

  try {
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(meta.email_id)}`, {
      headers: { Authorization: `Bearer ${env.resendReceivingKey}` },
    });
    if (!r.ok) throw new Error(`Resend answered ${r.status} fetching the message`);
    const mail = await r.json();
    const to = [].concat(mail.to || meta.to || []).join(", ");
    const files = (mail.attachments || meta.attachments || []).map((a) => a.filename).filter(Boolean);
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      ...(files.length ? [`Attachments (open them in Resend): ${files.join(", ")}`] : []),
      "Reply to this email and your answer goes to the sender.",
      "———",
      // The HTML, when there is one, follows as it was sent; otherwise the text.
      ...(mail.html ? [] : String(mail.text || "(empty)").split(/\n{2,}/)),
    ];
    const box = (to.match(/([^\s<"]+)@sentryfi\.app/i) || [])[1] || "sentryfi";
    await send({
      from: FROM.support,
      to: env.supportForwardTo,
      replyTo: from,
      subject: `[${box}] ${mail.subject || meta.subject || "(no subject)"}`,
      lines,
      extraHtml: mail.html,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(`[inbound] ${err.message}`);
    // 500 so Resend retries later.
    res.status(500).json({ error: "Could not forward it yet" });
  }
});

module.exports = router;
