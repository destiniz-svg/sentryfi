const env = require("../config/env");

/**
 * The few emails Sentryfi sends, through Resend's HTTPS API (Railway blocks
 * outbound SMTP below its Pro plan). Each is a few plain lines and, when there
 * is something to do, one link.
 *
 * One address per kind of mail, so a person can filter them, and so trouble
 * with one kind never drags down the others:
 *   accounts@  confirming an address, forgotten passwords
 *   security@  "was this you?" alerts
 *   support@   the one people write to; every reply comes here
 * Later: invoices sent for a company go as "<Company> via Sentryfi" with
 * Reply going to that company; newsletters, if ever, from a subdomain of
 * their own so they cannot hurt these.
 */
const FROM = {
  accounts: "Sentryfi <accounts@sentryfi.app>",
  security: "Sentryfi Security <security@sentryfi.app>",
  support: "Sentryfi Support <support@sentryfi.app>",
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function html(lines, link, extraHtml) {
  const body = lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("");
  const button = link
    ? `<p style="margin:22px 0"><a href="${esc(link.url)}" style="background:#F2C300;color:#141414;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${esc(link.label)}</a></p>
       <p style="margin:0 0 14px;color:#6B7078;font-size:13px">Or open this: ${esc(link.url)}</p>`
    : "";
  return `<div style="font-family:Barlow,Helvetica Neue,Arial,sans-serif;font-size:15px;line-height:1.5;color:#141414;max-width:520px">${body}${button}<p style="margin:24px 0 0;color:#6B7078;font-size:12px">Sentryfi · sentryfi.app</p></div>${extraHtml ? `<hr>${extraHtml}` : ""}`;
}

async function send({ to, subject, lines, link, from = FROM.accounts, replyTo = env.mailReplyTo, extraHtml }) {
  if (!env.resendApiKey) {
    console.log(`[email off] "${subject}" not sent: RESEND_API_KEY is not set`);
    return;
  }
  const text = [...lines, ...(link ? ["", `${link.label}: ${link.url}`] : [])].join("\n\n");
  const r = await fetch(env.resendApiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, reply_to: replyTo, to: [to], subject, text, html: html(lines, link, extraHtml) }),
  });
  if (!r.ok) throw new Error(`Resend answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Sends without holding up the answer; a failure is logged, never shown. */
function sendLater(message) {
  send(message).catch((err) => console.error(`[email] "${message.subject}" failed: ${err.message}`));
}

// A confirm-your-address link is a token of its own kind, signed with a key
// no session uses, so it can never be passed off as a sign-in.
const verifySecret = () => `${env.jwtSecret}:verify-email`;

function sendVerification(user) {
  const jwt = require("jsonwebtoken");
  const token = jwt.sign({ sub: user.id, email: user.email }, verifySecret(), { expiresIn: "3d" });
  sendLater({
    to: user.email,
    subject: "Confirm your email for Sentryfi",
    lines: [
      `Hello ${user.name},`,
      "Tap the button to confirm this is your email address. Your Sentryfi account opens as soon as you do.",
      "The link works for three days. If you did not sign up for Sentryfi, ignore this email and nothing happens.",
    ],
    link: { label: "Confirm my email", url: `${env.publicUrl}/verify/${token}` },
  });
}

/** Tells someone that something about their sign-in changed, in case it was not them. */
function sendAlert(user, what) {
  sendLater({
    from: FROM.security,
    to: user.email,
    subject: `Sentryfi: ${what}`,
    lines: [
      `Hello ${user.name},`,
      `${what}.`,
      "If this was you, there is nothing to do.",
      "If it was not, set a new password now. That signs everyone else out.",
    ],
    link: { label: "Set a new password", url: `${env.publicUrl}/forgot` },
  });
}

module.exports = { FROM, send, sendLater, sendVerification, sendAlert, verifySecret };
