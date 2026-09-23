const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");

/**
 * Telling a company's own software when something goes into the books.
 *
 * Events are thin: which record, its entry number and total. The receiver
 * fetches the rest with a key (middleware/apiKey.js), so nothing about a
 * customer travels to an address that holds no key. Each delivery is signed
 * (Sentryfi-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">) with the
 * webhook's secret, tried up to three times, and kept.
 *
 * Addresses are https only and never inside a private network, checked when
 * sending as well as when saved, so a webhook cannot be used to reach the
 * server's own neighbours.
 *
 * ponytail: retries are timers in this process; a restart between attempts
 * drops the retry. A delivery queue table polled by the hourly job is the
 * upgrade when a missed event matters.
 */

const EVENTS = ["invoice.posted", "bill.posted", "money.received", "ping"];

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
}

/** Throws unless the address is a public https one. */
async function checkUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error("That is not an address.");
  }
  if (u.protocol !== "https:") throw new Error("Webhooks go to https addresses only.");
  if (u.username || u.password) throw new Error("No passwords in the address; use the signature to check it is us.");
  const found = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!found.length) throw new Error("That address does not resolve.");
  if (found.some((a) => isPrivate(a.address))) throw new Error("That address is inside a private network.");
  return u.toString();
}

const sign = (secret, t, body) => crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

async function attempt(pool, deliveryId) {
  const { rows } = await pool.query(
    `SELECT d.id, d.event, d.body, d.attempts, w.url, w.secret, w.disabled_at
       FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id WHERE d.id = $1`,
    [deliveryId]
  );
  const d = rows[0];
  if (!d || d.disabled_at) return;
  const body = JSON.stringify(d.body);
  const t = Math.floor(Date.now() / 1000);
  let status = null;
  let error = null;
  try {
    await checkUrl(d.url);
    const r = await fetch(d.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Sentryfi-Webhooks/1", "Sentryfi-Event": d.event, "Sentryfi-Signature": `t=${t},v1=${sign(d.secret, t, body)}` },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    status = r.status;
    if (!r.ok) error = `Answered ${r.status}`;
  } catch (err) {
    error = String(err.message || err).slice(0, 300);
  }
  const attempts = d.attempts + 1;
  await pool.query("UPDATE webhook_deliveries SET attempts = $2, status = $3, error = $4, delivered_at = CASE WHEN $4::text IS NULL THEN now() END WHERE id = $1", [d.id, attempts, status, error]);
  if (error && attempts < 3) setTimeout(() => attempt(pool, d.id).catch(() => {}), attempts === 1 ? 30_000 : 300_000).unref?.();
}

/** Something went into the books: tell every webhook of the company that asked for it. Never throws. */
async function emit(companyId, event, data) {
  try {
    const { pool } = require("../config/db");
    const { rows } = await pool.query("SELECT id FROM webhooks WHERE company_id = $1 AND disabled_at IS NULL AND $2 = ANY(events)", [companyId, event]);
    for (const w of rows) {
      const body = { id: crypto.randomUUID(), event, created: new Date().toISOString(), companyId, data };
      const { rows: d } = await pool.query("INSERT INTO webhook_deliveries (webhook_id, event, body) VALUES ($1,$2,$3) RETURNING id", [w.id, event, JSON.stringify(body)]);
      attempt(pool, d[0].id).catch(() => {});
    }
  } catch {
    /* telling others never stops the books */
  }
}

module.exports = { EVENTS, emit, checkUrl, sign, attempt, isPrivate };
