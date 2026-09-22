const crypto = require("crypto");
const env = require("../config/env");
const { finish } = require("./historyImport");
const { toLaari } = require("./money");

/**
 * A direct connection to Zoho Books, for bringing history in.
 *
 * OAuth 2.0, the server-based flow: the person is sent to Zoho, says yes, and
 * Zoho sends them back with a one-time code that is exchanged for a refresh
 * token. Zoho runs several data centres; the one the person's account lives in
 * arrives on the redirect as `accounts-server`, and the token response names
 * the API host (`api_domain`), so nothing here assumes zoho.com.
 *
 * Read-only scopes. The connection reads Zoho's chart of accounts and every
 * account's transactions over a date range, turns them into the same
 * transactions a CSV import makes, and hands them to the same preview and
 * commit. It posts nothing by itself.
 *
 * The refresh token is encrypted at rest with a key derived from the server's
 * secret, so a copy of the database alone is not a key to anybody's Zoho.
 */

const SCOPES = ["ZohoBooks.settings.READ", "ZohoBooks.accountants.READ"].join(",");
const REDIRECT = () => `${env.publicUrl}/api/zoho/callback`;
const configured = () => Boolean(env.zohoClientId && env.zohoClientSecret);

// ---- secrets -----------------------------------------------------------------

const key = () => crypto.createHash("sha256").update(`zoho-token:${env.jwtSecret}`).digest();

function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

function open(sealed) {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

/**
 * The state that travels to Zoho and back: which company, which person, and
 * until when. Signed, so a callback cannot be pointed at another company.
 */
function makeState({ companyId, userId }) {
  const body = Buffer.from(JSON.stringify({ c: companyId, u: userId, e: Date.now() + 10 * 60_000, n: crypto.randomBytes(8).toString("hex") })).toString("base64url");
  const sig = crypto.createHmac("sha256", env.jwtSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readState(state) {
  const [body, sig] = String(state || "").split(".");
  const want = crypto.createHmac("sha256", env.jwtSecret).update(body || "").digest("base64url");
  if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) {
    throw new Error("That sign-in did not start here.");
  }
  const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (s.e < Date.now()) throw new Error("That sign-in took too long. Start it again.");
  return { companyId: s.c, userId: s.u };
}

// ---- OAuth ---------------------------------------------------------------------

/** Where to send the person. accounts.zoho.com redirects to their own data centre. */
function authorizeUrl(state) {
  const q = new URLSearchParams({
    scope: SCOPES,
    client_id: env.zohoClientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: REDIRECT(),
    state,
  });
  return `https://accounts.zoho.com/oauth/v2/auth?${q}`;
}

// Only Zoho's own account servers are ever sent the client secret.
const ZOHO_ACCOUNTS = /^https:\/\/accounts\.zoho(cloud)?\.(com|eu|in|com\.au|jp|ca|com\.cn|sa|uk)$/;

async function tokenCall(accountsServer, params) {
  if (!ZOHO_ACCOUNTS.test(accountsServer)) throw new Error("That is not a Zoho accounts server.");
  const r = await fetch(`${accountsServer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.zohoClientId, client_secret: env.zohoClientSecret, ...params }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || !data.access_token) throw new Error(`Zoho refused the sign-in: ${data.error || r.status}.`);
  return data;
}

/** The code from the redirect, for a refresh token and the API host. */
async function exchange({ code, accountsServer }) {
  const t = await tokenCall(accountsServer, { grant_type: "authorization_code", code, redirect_uri: REDIRECT() });
  if (!t.refresh_token) throw new Error("Zoho did not give a lasting sign-in. Connect again and allow access.");
  return { accessToken: t.access_token, refreshToken: t.refresh_token, apiDomain: t.api_domain || "https://www.zohoapis.com" };
}

// ---- the API ---------------------------------------------------------------------

// Zoho's data centres, by name. A pattern like www.zohoapis.[a-z.]+ also
// matched www.zohoapis.evil.com (security review, 23 September 2026).
const ZOHO_API_HOSTS = new Set(
  ["com", "eu", "in", "com.au", "jp", "ca", "com.cn", "sa", "uk"].map((tld) => `https://www.zohoapis.${tld}`)
);

/**
 * A client for one connection. Access tokens last an hour, so one is fetched
 * per use from the stored refresh token. Zoho allows 100 calls a minute per
 * organisation; a 429 waits and tries again.
 */
async function clientFor(conn) {
  if (!ZOHO_API_HOSTS.has(conn.api_domain)) throw new Error("The stored Zoho API host is not Zoho's.");
  const t = await tokenCall(conn.accounts_server, { grant_type: "refresh_token", refresh_token: open(conn.refresh_token_enc) });
  const get = async (path, params = {}) => {
    const q = new URLSearchParams({ ...params, ...(conn.organization_id ? { organization_id: conn.organization_id } : {}) });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const r = await fetch(`${conn.api_domain}/books/v3/${path}?${q}`, { headers: { Authorization: `Zoho-oauthtoken ${t.access_token}` } });
      if (r.status === 429) {
        await new Promise((ok) => setTimeout(ok, 15_000 * (attempt + 1)));
        continue;
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok || (data.code && data.code !== 0)) throw new Error(`Zoho answered ${r.status}: ${data.message || "no reason given"}.`);
      return data;
    }
    throw new Error("Zoho kept saying it was too busy. Try again in a few minutes.");
  };
  return { get };
}

async function organizations(z) {
  const data = await z.get("organizations");
  return (data.organizations || []).map((o) => ({ id: String(o.organization_id), name: o.name }));
}

/** Every page of a list. */
async function all(z, path, params, field) {
  const out = [];
  for (let page = 1; page < 500; page += 1) {
    const data = await z.get(path, { ...params, page, per_page: 200 });
    out.push(...(data[field] || []));
    if (!data.page_context?.has_more_page) break;
  }
  return out;
}

const amountOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? toLaari(Math.abs(n).toFixed(2)) : 0n;
};

/**
 * One side of a transaction, however Zoho spells it: debit_amount and
 * credit_amount, or an amount with debit_or_credit.
 */
function sidesOf(t) {
  let debit = amountOf(t.debit_amount ?? t.bcy_debit_amount);
  let credit = amountOf(t.credit_amount ?? t.bcy_credit_amount);
  if (!debit && !credit) {
    const amt = amountOf(t.bcy_amount ?? t.amount);
    if (/debit/i.test(t.debit_or_credit || "")) debit = amt;
    else if (/credit/i.test(t.debit_or_credit || "")) credit = amt;
  }
  return { debit, credit };
}

/**
 * Zoho's books over a date range, as balanced transactions. Each Zoho
 * transaction shows up once under every account it touches; gathering those
 * by its type and id gives back its lines.
 */
async function transactions(z, { from, to }) {
  const accounts = await all(z, "chartofaccounts", {}, "chartofaccounts");
  const byKey = new Map();
  for (const a of accounts) {
    const rows = await all(
      z,
      "chartofaccounts/transactions",
      { account_id: a.account_id, "date.start": from, "date.end": to },
      "transactions"
    ).catch(() => all(z, "chartofaccounts/accounttransactions", { account_id: a.account_id, "date.start": from, "date.end": to }, "transactions"));
    for (const t of rows) {
      const { debit, credit } = sidesOf(t);
      if (!debit && !credit) continue;
      const type = t.transaction_type_formatted || t.transaction_type || "";
      const theirId = String(t.transaction_id || t.categorized_transaction_id || t.entry_number || "");
      const date = String(t.transaction_date || t.date || "").slice(0, 10);
      const k = `${t.transaction_type || type}|${theirId}|${date}`;
      if (!byKey.has(k)) {
        byKey.set(k, { key: k, date, type, theirId: t.entry_number || t.reference_number || theirId, memo: t.description || t.payee || "", lines: [] });
      }
      byKey.get(k).lines.push({ account: a.account_name, code: a.account_code || "", debit, credit, memo: t.description || null });
    }
  }
  return [...byKey.values()].map(finish).sort((a, b) => (a.date < b.date ? -1 : 1));
}

module.exports = { configured, makeState, readState, authorizeUrl, exchange, clientFor, organizations, transactions, seal, open, sidesOf };
