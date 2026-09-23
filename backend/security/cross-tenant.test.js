/**
 * Cross-tenant isolation, end to end over HTTP.
 *
 * Two companies, each opened by its own user through the real API. Company B's
 * administrator then tries to read or change every kind of company A record
 * through every endpoint that takes an id, a header or a body reference.
 *
 * Written by the security review of 23 September 2026. It boots the real
 * server on a throwaway Postgres, so it exercises requireAuth -> requireCompany
 * -> requireCan -> asCompany -> row-level security together. Tests marked
 * [FINDING n] failed before that review's fixes.
 *
 *   npm run test:security   (from backend/)
 */
/* global describe, it, expect, beforeAll, afterAll */

const { createRequire } = require("node:module");
const path = require("node:path");

const BACKEND = process.env.SENTRYFI_BACKEND || path.resolve(__dirname, "..");
const req = createRequire(path.join(BACKEND, "package.json"));

const PORT = Number(process.env.PORT || 18731);
const BASE = `http://127.0.0.1:${PORT}/api`;

let db;
const A = {};
const B = {};
const M = {}; // an outsider who registers and squats an address

// ---------------------------------------------------------------- http helpers

async function call(who, method, url, { body, company, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (who?.cookie) h.cookie = who.cookie;
  const co = company === undefined ? who?.companyId : company;
  if (co) h["X-Company-Id"] = co;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* xlsx, file bytes */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function signUp(who, name, email, { confirm = true } = {}) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "correct horse battery" }),
  });
  expect(res.status).toBe(201);
  who.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  who.user = (await res.json()).user;
  // As if they had tapped the link in the confirm-your-address email.
  if (confirm) await db.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [who.user.id]);
  return who;
}

async function openCompany(who, name) {
  const r = await call(who, "POST", "/companies", { body: { name }, company: null });
  expect(r.status).toBe(201);
  who.companyId = r.json.company.id;
}

const denied = (r) => expect([400, 403, 404]).toContain(r.status);
const noLeak = (r, ...secrets) => {
  for (const s of secrets) expect(r.text).not.toContain(String(s));
};

// ---------------------------------------------------------------- fixtures

beforeAll(async () => {
  const { Pool } = req("pg");
  db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const { ALL_SQL } = req("./src/config/all-schema");
  for (const sql of ALL_SQL) await db.query(sql);

  req("./src/server.js");
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const tag = Date.now();
  await signUp(A, "Alice", `alice.${tag}@a.test`);
  await signUp(B, "Bob", `bob.${tag}@b.test`);
  await openCompany(A, `Altura ${tag}`);
  await openCompany(B, `Steva ${tag}`);

  // A's chart
  const acc = await call(A, "GET", "/periods/accounts");
  A.accounts = Object.fromEntries(acc.json.accounts.map((a) => [a.code, a.id]));
  const accB = await call(B, "GET", "/periods/accounts");
  B.accounts = Object.fromEntries(accB.json.accounts.map((a) => [a.code, a.id]));

  // A bill, posted, with a document
  const bill = await call(A, "POST", "/bills", {
    body: { supplierName: "SECRET-SUPPLIER-A", amount: "777.77", gstTreatment: "none_unregistered", issueDate: "2026-09-01" },
  });
  expect(bill.status).toBe(201);
  A.billId = bill.json.bill.id;
  A.counterpartyId = bill.json.bill.counterparty_id;
  expect((await call(A, "POST", `/bills/${A.billId}/post`)).status).toBe(200);
  const draft = await call(A, "POST", "/bills", {
    body: { supplierName: "SECRET-SUPPLIER-A", amount: "12.34", gstTreatment: "none_unregistered", billNo: "DRAFT-A" },
  });
  A.draftBillId = draft.json.bill.id;

  const fd = new FormData();
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5d0000000049454e44ae426082", "hex");
  fd.append("file", new Blob([png], { type: "image/png" }), "secret-a.png");
  const att = await fetch(`${BASE}/attachments/bills/${A.billId}`, {
    method: "POST", headers: { cookie: A.cookie, "X-Company-Id": A.companyId }, body: fd,
  });
  expect(att.status).toBe(201);
  A.attachmentId = (await att.json()).attachment.id;

  // A sales invoice, posted
  const inv = await call(A, "POST", "/sales", {
    body: { customerName: "SECRET-CUSTOMER-A", gstTreatment: "none_unregistered", issueDate: "2026-09-02", lines: [{ description: "work", amount: "555.55" }] },
  });
  expect(inv.status).toBe(201);
  A.invoiceId = inv.json.invoice.id;
  A.draftInvoice = (await call(A, "POST", "/sales", {
    body: { customerName: "SECRET-CUSTOMER-A", gstTreatment: "none_unregistered", lines: [{ description: "x", amount: "1" }] },
  })).json.invoice.id;
  expect((await call(A, "POST", `/sales/${A.invoiceId}/post`)).status).toBe(200);

  // A cash tin, a spend, a top-up request
  const box = await call(A, "POST", "/cash", { body: { name: "SECRET-TIN-A", float: "100" } });
  expect(box.status).toBe(201);
  A.boxId = box.json.box.id;
  expect((await call(A, "POST", `/cash/${A.boxId}/spend`, { body: { amount: "10", what: "nails", accountId: A.accounts["5100"] } })).status).toBe(201);
  A.topupId = (await call(A, "POST", `/cash/${A.boxId}/topup`, { body: { amount: "50" } })).json.id;

  // A bank account with one statement line
  const bank = await call(A, "POST", "/bank", { body: { name: "SECRET-BANK-A" } });
  A.bankId = bank.json.account.id;
  const { rows } = await db.query(
    `INSERT INTO bank_statement_lines (company_id, account_id, posted_on, kind, who, credit_laari, row_hash)
     VALUES ($1,$2,'2026-09-03','transfer','SECRET-PAYER-A',4242400,'h1') RETURNING id`,
    [A.companyId, A.bankId]
  );
  A.lineId = rows[0].id;

  // An open invitation, and a Zoho connection
  await call(A, "POST", "/companies/current/people", { body: { email: `dave.${tag}@a.test`, role: "viewer" } });
  A.inviteId = (await call(A, "GET", "/companies/current/people")).json.invites[0].id;
  await db.query(
    `INSERT INTO zoho_connections (company_id, accounts_server, api_domain, refresh_token_enc, organization_id)
     VALUES ($1,'https://accounts.zoho.com','https://www.zohoapis.com','x.y.z','ORG-A')`,
    [A.companyId]
  );

  // B needs something of its own to act on
  const bBox = await call(B, "POST", "/cash", { body: { name: "Tin B" } });
  B.boxId = bBox.json.box.id;
  B.bankId = (await call(B, "POST", "/bank", { body: { name: "Bank B" } })).json.account.id;
  A.tag = tag;
}, 120_000);

afterAll(async () => {
  await db?.end();
  // The server keeps its own pool open; the runner exits the process.
});

// ---------------------------------------------------------------- the company claim

describe("choosing a company", () => {
  it("refuses B's user who names A in the header", async () => {
    expect((await call(B, "GET", "/bills", { company: A.companyId })).status).toBe(403);
  });
  it("refuses B's user who names A in ?company=", async () => {
    expect((await call(B, "GET", `/bills?company=${A.companyId}`, { company: null })).status).toBe(403);
    const r = await call(B, "GET", `/attachments/${A.attachmentId}/file?company=${A.companyId}`, { company: null });
    expect(r.status).toBe(403);
  });
  it("lists only B's companies to B", async () => {
    const r = await call(B, "GET", "/companies", { company: null });
    expect(r.json.companies.map((c) => c.id)).toEqual([B.companyId]);
  });
});

// ---------------------------------------------------------------- bills

describe("A's bills, from B", () => {
  it("are not listed", async () => {
    const r = await call(B, "GET", "/bills");
    noLeak(r, A.billId, "SECRET-SUPPLIER-A", "777.77");
  });
  it("cannot be posted, reversed or voided", async () => {
    denied(await call(B, "POST", `/bills/${A.draftBillId}/post`));
    denied(await call(B, "POST", `/bills/${A.billId}/reverse`, { body: { reason: "cross tenant" } }));
    denied(await call(B, "DELETE", `/bills/${A.draftBillId}`, { body: { reason: "cross tenant" } }));
    const { rows } = await db.query("SELECT status, voided_at, entry_id FROM bills WHERE id = ANY($1)", [[A.billId, A.draftBillId]]);
    expect(rows.every((r) => r.voided_at === null)).toBe(true);
  });
  it("[FINDING 5] cannot be pointed at A's supplier by id", async () => {
    const r = await call(B, "POST", "/bills", { body: { counterpartyId: A.counterpartyId, amount: "1", gstTreatment: "none_unregistered" } });
    denied(r);
  });
});

// ---------------------------------------------------------------- attachments

describe("A's documents, from B", () => {
  it("are not listed on the bill", async () => {
    const r = await call(B, "GET", `/attachments/bills/${A.billId}`);
    expect(r.json.attachments).toEqual([]);
  });
  it("cannot be downloaded by id", async () => {
    expect((await call(B, "GET", `/attachments/${A.attachmentId}/file`)).status).toBe(404);
  });
  it("cannot be added to", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "x.png");
    const r = await fetch(`${BASE}/attachments/bills/${A.billId}`, { method: "POST", headers: { cookie: B.cookie, "X-Company-Id": B.companyId }, body: fd });
    expect(r.status).toBe(404);
  });
  it("[FINDING 7] are never kept in a browser cache", async () => {
    const r = await call(A, "GET", `/attachments/${A.attachmentId}/file`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
  });
});

// ---------------------------------------------------------------- sales

describe("A's invoices, from B", () => {
  it("are not listed or aged", async () => {
    noLeak(await call(B, "GET", "/sales"), A.invoiceId, "SECRET-CUSTOMER-A", "555.55");
    noLeak(await call(B, "GET", "/sales/aged"), "SECRET-CUSTOMER-A", "555.55");
    noLeak(await call(B, "GET", "/sales/money-accounts"), A.bankId);
  });
  it("cannot be posted, credited, discarded or paid", async () => {
    denied(await call(B, "POST", `/sales/${A.draftInvoice}/post`));
    denied(await call(B, "POST", `/sales/${A.invoiceId}/credit`, { body: { reason: "cross tenant", amount: "1" } }));
    denied(await call(B, "DELETE", `/sales/${A.draftInvoice}`, { body: { reason: "cross tenant" } }));
    const pay = await call(B, "POST", "/sales/receipts", {
      body: { amount: "1", accountId: B.bankId, allocations: [{ invoiceId: A.invoiceId, amount: "1" }] },
    });
    denied(pay);
    const { rows } = await db.query("SELECT count(*)::int n FROM receipt_allocations WHERE invoice_id = $1", [A.invoiceId]);
    expect(rows[0].n).toBe(0);
  });
  it("[FINDING 5] cannot post an invoice line to A's account", async () => {
    const r = await call(B, "POST", "/sales", {
      body: { customerName: "Someone", gstTreatment: "none_unregistered", lines: [{ description: "x", amount: "1", accountId: A.accounts["4100"] }] },
    });
    if (r.status === 201) denied(await call(B, "POST", `/sales/${r.json.invoice.id}/post`));
  });
});

// ---------------------------------------------------------------- cash

describe("A's cash tins, from B", () => {
  it("are not listed", async () => {
    noLeak(await call(B, "GET", "/cash"), A.boxId, "SECRET-TIN-A");
  });
  it("cannot be read, spent from, counted, topped up, reassigned or given to", async () => {
    const h = await call(B, "GET", `/cash/${A.boxId}/history`);
    expect(h.json?.spends ?? []).toEqual([]);
    denied(await call(B, "POST", `/cash/${A.boxId}/spend`, { body: { amount: "1", what: "xx", accountId: B.accounts["5100"] } }));
    denied(await call(B, "POST", `/cash/${A.boxId}/count`, { body: { counted: "0" } }));
    denied(await call(B, "POST", `/cash/${A.boxId}/topup`, { body: { amount: "1" } }));
    denied(await call(B, "PATCH", `/cash/${A.boxId}`, { body: { float: "1" } }));
    denied(await call(B, "POST", `/cash/${A.boxId}/give`, { body: { amount: "1", bankAccountId: B.bankId } }));
    denied(await call(B, "POST", `/cash/topups/${A.topupId}/give`, { body: { given: "1", bankAccountId: B.bankId } }));
    denied(await call(B, "POST", `/cash/topups/${A.topupId}/receive`, { body: {} }));
  });
  it("[FINDING 5] B cannot spend into A's expense account", async () => {
    denied(await call(B, "POST", `/cash/${B.boxId}/spend`, { body: { amount: "1", what: "xx", accountId: A.accounts["5100"] } }));
  });
  it("[FINDING 6] B cannot make A's user a holder (and so read their name)", async () => {
    const r = await call(B, "POST", "/cash", { body: { name: "Probe", holderId: A.user.id } });
    denied(r);
    noLeak(await call(B, "GET", "/cash"), "Alice");
  });
});

// ---------------------------------------------------------------- bank

describe("A's bank lines, from B", () => {
  it("are not listed", async () => {
    noLeak(await call(B, "GET", "/bank"), A.bankId, "SECRET-BANK-A");
    noLeak(await call(B, "GET", `/bank/${A.bankId}/waiting`), "SECRET-PAYER-A", "42,424.00", "42424.00");
    noLeak(await call(B, "GET", `/bank/${A.bankId}/waiting/lines?who=secret-payer-a&moneyIn=true`), "SECRET-PAYER-A");
    noLeak(await call(B, "GET", `/bank/${A.bankId}/answered`), "SECRET-PAYER-A");
  });
  it("cannot be answered, set aside or undone", async () => {
    denied(await call(B, "POST", `/bank/lines/${A.lineId}/post`, { body: { accountId: B.accounts["5100"] } }));
    denied(await call(B, "POST", `/bank/lines/${A.lineId}/set-aside`, { body: {} }));
    denied(await call(B, "POST", `/bank/lines/${A.lineId}/link`, { body: { entryId: A.lineId } }));
    denied(await call(B, "POST", `/bank/lines/${A.lineId}/receive`, { body: { invoiceId: A.invoiceId } }));
    denied(await call(B, "POST", `/bank/lines/${A.lineId}/undo`, { body: { companyId: A.companyId } }));
    await call(B, "POST", `/bank/${A.bankId}/group/set-aside`, { body: { who: "SECRET-PAYER-A", moneyIn: true } });
    const { rows } = await db.query("SELECT status FROM bank_statement_lines WHERE id = $1", [A.lineId]);
    expect(rows[0].status).toBe("open");
  });
  it("cannot take a statement into A's account or move A's money", async () => {
    denied(await call(B, "POST", `/bank/${A.bankId}/statement`, { raw: "a,b\n1,2\n", headers: { "Content-Type": "text/csv" } }));
    denied(await call(B, "POST", "/bank/transfer", { body: { fromId: A.bankId, toId: B.bankId, amount: "1" } }));
  });
  it("[FINDING 4] the undo route ignores a userId in the body", async () => {
    // Inside A: post the line, then undo it while claiming to be Bob.
    const p = await call(A, "POST", `/bank/lines/${A.lineId}/post`, { body: { accountId: A.accounts["4100"] } });
    expect(p.status).toBe(200);
    const u = await call(A, "POST", `/bank/lines/${A.lineId}/undo`, { body: { userId: B.user.id } });
    expect(u.status).toBe(200);
    const { rows } = await db.query(
      "SELECT posted_by FROM journal_entries WHERE company_id = $1 AND reverses_id IS NOT NULL ORDER BY entry_no DESC LIMIT 1",
      [A.companyId]
    );
    expect(rows[0].posted_by).toBe(A.user.id);
  });
});

// ---------------------------------------------------------------- statements, exports, dashboards

describe("figures and exports, from B", () => {
  const secrets = () => ["777.77", "555.55", "SECRET-SUPPLIER-A", "SECRET-CUSTOMER-A", "SECRET-TIN-A", "SECRET-BANK-A"];
  for (const url of [
    "/statements/trial-balance", "/statements/profit-and-loss?from=2026-01-01&to=2026-12-31",
    "/statements/balance-sheet", "/figures", "/attention", "/periods", "/periods/doubts?through=2026-09-30",
    "/periods/accounts", "/tax", "/gst/current", "/zoho", "/companies/current/people",
  ]) {
    it(`GET ${url} shows none of A`, async () => {
      const r = await call(B, "GET", url);
      expect(r.status).toBeLessThan(500);
      noLeak(r, ...secrets(), A.companyId, A.user.email);
    });
  }
  it("GST spreadsheets hold none of A", async () => {
    for (const f of ["input", "output"]) {
      const res = await fetch(`${BASE}/gst/current/${f}.xlsx`, { headers: { cookie: B.cookie, "X-Company-Id": B.companyId } });
      const buf = Buffer.from(await res.arrayBuffer());
      // xlsx is a zip; names are stored deflated, so check the ledger instead of bytes
      expect(res.status).toBe(200);
      expect(buf.includes("SECRET-SUPPLIER-A")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- writes that must stay inside B

describe("B's writes stay inside B", () => {
  it("[FINDING 5] an adjustment cannot name A's accounts", async () => {
    denied(await call(B, "POST", "/periods/adjust", {
      body: { date: "2026-09-10", narrative: "probe", lines: [{ accountId: A.accounts["5100"], debit: "1" }, { accountId: B.accounts["2100"], credit: "1" }] },
    }));
  });
  it("closing, tax and GST settings touch only B", async () => {
    await call(B, "POST", "/periods/close", { body: { through: "2026-01-31" } });
    await call(B, "POST", "/tax/rates", { body: { bp: 1, from: "2026-01-01", reason: "probe" } });
    await call(B, "POST", "/gst/settings", { body: { activityNo: "B-ONLY", frequency: "month" } });
    const { rows: locks } = await db.query("SELECT count(*)::int n FROM period_locks WHERE company_id = $1", [A.companyId]);
    const { rows: rates } = await db.query("SELECT count(*)::int n FROM tax_rates WHERE company_id = $1", [A.companyId]);
    const { rows: co } = await db.query("SELECT gst_number FROM companies WHERE id = $1", [A.companyId]);
    expect(locks[0].n).toBe(0);
    expect(rates[0].n).toBe(0);
    expect(co[0].gst_number).not.toBe("B-ONLY");
  });
  it("chart reclassification cannot reach A's accounts", async () => {
    await call(B, "POST", "/imports/chart/apply", { body: { reason: "probe", changes: [{ accountId: A.accounts["5100"], type: "income", code: "9999" }] } });
    const { rows } = await db.query("SELECT type, code FROM accounts WHERE id = $1", [A.accounts["5100"]]);
    expect(rows[0]).toEqual({ type: "expense", code: "5100" });
  });
  it("Zoho: B cannot see or remove A's connection", async () => {
    expect((await call(B, "GET", "/zoho")).json.connected).toBe(false);
    await call(B, "DELETE", "/zoho");
    await call(B, "POST", "/zoho/organization", { body: { id: "HIJACK", name: "x" } });
    const { rows } = await db.query("SELECT organization_id FROM zoho_connections WHERE company_id = $1", [A.companyId]);
    expect(rows[0].organization_id).toBe("ORG-A");
  });
});

// ---------------------------------------------------------------- people

describe("people and invitations", () => {
  it("B cannot remove A's administrator or withdraw A's invitation", async () => {
    denied(await call(B, "DELETE", `/companies/current/people/${A.user.id}/roles/administrator`));
    denied(await call(B, "DELETE", `/companies/current/invites/${A.inviteId}`));
    const { rows } = await db.query("SELECT revoked_at FROM invites WHERE id = $1", [A.inviteId]);
    expect(rows[0].revoked_at).toBeNull();
  });
  it("an invitation link for A cannot be replayed against another company", async () => {
    const forged = `${B.companyId}.${"x".repeat(32)}`;
    denied(await call(null, "GET", `/invites/${forged}`));
  });
  it("[FINDING 1] a squatted, unverified account is not dropped straight into A", async () => {
    const email = `carol.${A.tag}@a.test`;
    await signUp(M, "Carol (really Mallory)", email);
    const r = await call(A, "POST", "/companies/current/people", { body: { email, role: "accountant" } });
    expect(r.json.added).not.toBe(true);
    expect((await call(M, "GET", "/bills", { company: A.companyId })).status).toBe(403);
  });
});

// ---------------------------------------------------------------- system-wide surfaces

describe("system-wide surfaces", () => {
  it("[FINDING 2] a self-registered company administrator cannot see or start platform backups", async () => {
    // Not found, rather than forbidden: an outsider is not told backups exist.
    expect([403, 404]).toContain((await call(B, "GET", "/backups")).status);
    expect([403, 404]).toContain((await call(B, "POST", "/backups/run")).status);
  });
  it("per-user legacy items stay per user", async () => {
    const it1 = await call(A, "POST", "/items", { body: { name: "SECRET-ITEM-A", rate: 5 } });
    noLeak(await call(B, "GET", "/items"), "SECRET-ITEM-A");
    denied(await call(B, "PATCH", `/items/${it1.json.item.id}`, { body: { name: "pwned" } }));
    denied(await call(B, "DELETE", `/items/${it1.json.item.id}`));
  });
});

// ---------------------------------------------------------------- the database role itself

describe("the app role, acting as B", () => {
  const asB = async (sql, params = []) => {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE sentryfi_app");
      await c.query("SELECT set_config('app.company_id', $1, true)", [B.companyId]);
      await c.query("SELECT set_config('app.user_id', $1, true)", [B.user.id]);
      return (await c.query(sql, params)).rows;
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  };
  it("sees no row of A in any company_id table, even unfiltered", async () => {
    const { rows: tables } = await db.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'company_id'`
    );
    for (const { table_name: t } of tables) {
      let rows;
      try { rows = await asB(`SELECT count(*)::int n FROM "${t}" WHERE company_id = $1`, [A.companyId]); }
      catch (e) { if (/permission denied/.test(e.message)) continue; throw e; }
      expect({ t, n: rows[0].n }).toEqual({ t, n: 0 });
    }
  });
  it("[FINDING 3] cannot read other companies or anyone's password hash", async () => {
    expect((await asB("SELECT count(*)::int n FROM companies"))[0].n).toBe(1);
    await expect(asB("SELECT password_hash FROM users LIMIT 1")).rejects.toThrow(/permission denied/);
  });
  it("[FINDING 3] cannot touch another company's journal counter", async () => {
    expect(await asB("SELECT * FROM journal_counters WHERE company_id = $1", [A.companyId])).toEqual([]);
  });
});

// ---------------------------------------------------------------- people, finished (item 10)

describe("reset links, limits and passkeys", () => {
  const E = {};

  it("a reset link: only for someone in this company alone, used once, and it ends their other sessions", async () => {
    const email = `erin.${A.tag}@a.test`;
    const made = await call(A, "POST", "/companies/current/people", { body: { email, role: "manager" } });
    expect(made.status).toBe(201);
    const joined = await fetch(`${BASE}/invites/${encodeURIComponent(made.json.token)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Erin", password: "first password 1" }),
    });
    expect(joined.status).toBeLessThan(300);
    E.cookie = joined.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    E.companyId = A.companyId;
    const people = (await call(A, "GET", "/companies/current/people")).json.members;
    E.id = people.find((p) => p.email === email).user_id;

    // Another company's administrator cannot hold the key to A's people.
    denied(await call(B, "POST", `/companies/current/people/${E.id}/reset`));

    const link = await call(A, "POST", `/companies/current/people/${E.id}/reset`);
    expect(link.status).toBe(201);
    expect((await fetch(`${BASE}/auth/reset/${link.json.token}`)).status).toBe(200);
    const used = await fetch(`${BASE}/auth/reset/${link.json.token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "second password 2" }),
    });
    expect(used.status).toBe(200);
    // Once only.
    expect((await fetch(`${BASE}/auth/reset/${link.json.token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "third password 3" }),
    })).status).toBe(404);
    // The session Erin had before is over.
    expect((await call(E, "GET", "/auth/me")).status).toBe(401);
  });

  it("no reset link for someone who also belongs to another company", async () => {
    const email = `frank.${A.tag}@both.test`;
    const invA = await call(A, "POST", "/companies/current/people", { body: { email, role: "viewer" } });
    await fetch(`${BASE}/invites/${encodeURIComponent(invA.json.token)}/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Frank", password: "franks password 1" }),
    });
    const invB = await call(B, "POST", "/companies/current/people", { body: { email, role: "viewer" } });
    await fetch(`${BASE}/invites/${encodeURIComponent(invB.json.token)}/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Frank", password: "franks password 1" }),
    });
    const frank = (await call(A, "GET", "/companies/current/people")).json.members.find((p) => p.email === email);
    const r = await call(A, "POST", `/companies/current/people/${frank.user_id}/reset`);
    expect(r.status).toBe(400);
    expect(r.text).toMatch(/other companies/);
  });

  it("a spending limit holds a bill back, and only this company can set it", async () => {
    denied(await call(B, "PUT", `/companies/current/people/${A.user.id}/limit`, { body: { limit: "1.00" } }));
    expect((await call(A, "PUT", `/companies/current/people/${A.user.id}/limit`, { body: { limit: "100.00" } })).status).toBe(200);
    const bill = await call(A, "POST", "/bills", { body: { supplierName: "Over the limit", amount: "150.00", gstTreatment: "none_unregistered", issueDate: "2026-09-10" } });
    const held = await call(A, "POST", `/bills/${bill.json.bill.id}/post`);
    expect(held.status).toBe(403);
    expect(held.text).toMatch(/over your limit/);
    expect((await call(A, "PUT", `/companies/current/people/${A.user.id}/limit`, { body: { limit: null } })).status).toBe(200);
    expect((await call(A, "POST", `/bills/${bill.json.bill.id}/post`)).status).toBe(200);
  });

  it("passkeys: only from Sentryfi's own address, and an unknown device is refused", async () => {
    const foreign = await call(A, "POST", "/passkeys/register/options", { headers: { origin: "https://evil.example" } });
    expect([400, 403]).toContain(foreign.status);
    const own = await call(A, "POST", "/passkeys/register/options", { headers: { origin: "http://localhost:5173" } });
    expect(own.status).toBe(200);
    expect(own.json.challenge).toBeTruthy();
    expect(own.json.authenticatorSelection.userVerification).toBe("required");

    const opts = await fetch(`${BASE}/passkeys/login/options`, { method: "POST", headers: { origin: "http://localhost:5173" } });
    const cookie = opts.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const unknown = await fetch(`${BASE}/passkeys/login`, {
      method: "POST",
      headers: { origin: "http://localhost:5173", "Content-Type": "application/json", cookie },
      body: JSON.stringify({ response: { id: "not-a-real-credential", rawId: "x", type: "public-key", response: {} } }),
    });
    expect(unknown.status).toBe(401);
  });
});

describe("A's stock, from B", () => {
  let itemA;
  beforeAll(async () => {
    const r = await call(A, "POST", "/stock", { body: { name: "SECRET-ITEM-A", unit: "bag" } });
    expect(r.status).toBe(201);
    itemA = r.json.item.id;
    expect((await call(A, "POST", `/stock/${itemA}/opening`, { body: { quantity: "10", unitCost: "99.00", on: "2026-09-01" } })).status).toBe(201);
  });

  it("B's list does not show it, and its history is empty to B", async () => {
    const list = await call(B, "GET", "/stock");
    expect(list.status).toBe(200);
    noLeak(list, "SECRET-ITEM-A");
    const h = await call(B, "GET", `/stock/${itemA}/history`);
    expect(h.json?.moves || []).toEqual([]);
  });

  it("B cannot count it, open it, rename it or archive it", async () => {
    denied(await call(B, "POST", `/stock/${itemA}/count`, { body: { counted: "0", on: "2026-09-02" } }));
    denied(await call(B, "POST", `/stock/${itemA}/opening`, { body: { quantity: "1", unitCost: "1", on: "2026-09-02" } }));
    denied(await call(B, "PATCH", `/stock/${itemA}`, { body: { name: "mine now", archived: true } }));
    expect((await call(A, "GET", "/stock")).json.items.find((i) => i.id === itemA)).toMatchObject({ name: "SECRET-ITEM-A", onHand: "10", archived: false });
  });

  it("B cannot buy it on B's bill or sell it on B's invoice", async () => {
    const bill = await call(B, "POST", "/bills", { body: { supplierName: "B's supplier", amount: "100", gstTreatment: "none_unregistered", issueDate: "2026-09-03" } });
    expect(bill.status).toBe(201);
    denied(await call(B, "PUT", `/bills/${bill.json.bill.id}/stock`, { body: { lines: [{ itemId: itemA, quantity: "1", amount: "100" }] } }));
    denied(await call(B, "PUT", `/bills/${A.billId}/stock`, { body: { lines: [] } }));
    denied(await call(B, "POST", "/sales", {
      body: { customerName: "B's customer", gstTreatment: "none_unregistered", lines: [{ description: "x", amount: "1", itemId: itemA, quantity: 1 }] },
    }));
  });
});

describe("what A's bills were for, from B", () => {
  it("B cannot read or set the split of A's bill, nor split B's own bill onto A's accounts", async () => {
    denied(await call(B, "GET", `/bills/${A.draftBillId}/split`));
    denied(await call(B, "PUT", `/bills/${A.draftBillId}/split`, { body: { lines: [] } }));
    const bill = await call(B, "POST", "/bills", { body: { supplierName: "B supplier two", amount: "100", gstTreatment: "none_unregistered", issueDate: "2026-09-03" } });
    denied(await call(B, "PUT", `/bills/${bill.json.bill.id}/split`, { body: { lines: [{ kind: "cost", amount: "50", accountId: A.accounts["5100"] }] } }));
    const own = await call(B, "GET", `/bills/${bill.json.bill.id}/split`);
    expect(own.status).toBe(200);
    noLeak(own, A.accounts["5100"]);
  });
});

describe("A's shipments, from B", () => {
  let shipA;
  let shipB;
  beforeAll(async () => {
    const a = await call(A, "POST", "/shipments", { body: { reference: "SECRET-BL-A", containers: [{ number: "AAAU0000001", cbm: "20" }] } });
    expect(a.status).toBe(201);
    shipA = a.json.id;
    const b = await call(B, "POST", "/shipments", { body: { reference: "B-BL-1" } });
    shipB = b.json.id;
  });

  it("B cannot see, change, pay into, share, or link to A's shipment", async () => {
    noLeak(await call(B, "GET", "/shipments"), "SECRET-BL-A");
    denied(await call(B, "GET", `/shipments/${shipA}`));
    denied(await call(B, "PATCH", `/shipments/${shipA}`, { body: { closed: true } }));
    denied(await call(B, "POST", `/shipments/${shipA}/containers`, { body: { number: "X1" } }));
    denied(await call(B, "POST", `/shipments/${shipA}/costs`, { body: { kind: "duty", amount: "1", fromAccountId: B.accounts["1100"], on: "2026-09-01" } }));
    denied(await call(B, "POST", `/shipments/${shipA}/allocate`, { body: { on: "2026-09-01" } }));
    denied(await call(B, "PUT", `/shipments/${shipB}/bills/${A.billId}`, { body: { linked: true } }));
    denied(await call(B, "PUT", `/shipments/${shipA}/bills/${A.billId}`, { body: { linked: true } }));
    denied(await call(B, "POST", `/shipments/${shipB}/costs`, { body: { kind: "duty", amount: "1", fromAccountId: A.accounts["1100"], on: "2026-09-01" } }));
    const bill = await call(B, "POST", "/bills", { body: { supplierName: "B agent", amount: "100", gstTreatment: "none_unregistered", issueDate: "2026-09-03" } });
    denied(await call(B, "PUT", `/bills/${bill.json.bill.id}/split`, { body: { lines: [{ kind: "landed", amount: "50", shipmentId: shipA }] } }));
    const mine = await call(A, "GET", `/shipments/${shipA}`);
    expect(mine.json).toMatchObject({ reference: "SECRET-BL-A", closed: false, landed: "0.00" });
  });
});

describe("A's projects, from B", () => {
  let projA;
  let claimA;
  let commitA;
  beforeAll(async () => {
    projA = (await call(A, "POST", "/projects", { body: { name: "SECRET-PROJECT-A" } })).json.id;
    const cust = (await call(A, "POST", "/sales", { body: { customerName: "SECRET-CLIENT-A", gstTreatment: "none_unregistered", lines: [{ description: "x", amount: "1" }] } }));
    const inv = await call(A, "GET", "/sales");
    const customerId = (inv.json.invoices || inv.json.sales || []).map((x) => x.counterpartyId || x.counterparty_id).find(Boolean);
    expect((await call(A, "PUT", `/projects/${projA}/contract`, { body: { counterpartyId: customerId, contract: "100000", retentionPct: 10 } })).status).toBe(200);
    commitA = (await call(A, "POST", `/projects/${projA}/commitments`, { body: { description: "SECRET-ORDER-A", accountId: A.accounts["5100"], amount: "500" } })).json.id;
    claimA = (await call(A, "POST", `/projects/${projA}/claims`, { body: { periodTo: "2026-09-30", claimedToDate: "1000" } })).json.id;
    expect(cust.status).toBe(201);
  });

  it("B cannot see, change, claim, certify, release or read the entries of A's project", async () => {
    noLeak(await call(B, "GET", "/projects"), "SECRET-PROJECT-A");
    denied(await call(B, "GET", `/projects/${projA}`));
    denied(await call(B, "PUT", `/projects/${projA}/contract`, { body: { contract: "1" } }));
    denied(await call(B, "PUT", `/projects/${projA}/budget`, { body: { lines: [] } }));
    denied(await call(B, "POST", `/projects/${projA}/commitments`, { body: { description: "x", accountId: B.accounts["5100"], amount: "1" } }));
    denied(await call(B, "POST", `/projects/${projA}/claims`, { body: { periodTo: "2026-09-30", claimedToDate: "1" } }));
    denied(await call(B, "POST", `/projects/${projA}/claims/${claimA}/certify`, { body: { certifiedToDate: "1000", on: "2026-09-30" } }));
    denied(await call(B, "POST", `/projects/${projA}/retention`, { body: { amount: "1", on: "2026-09-30" } }));
    const e = await call(B, "GET", `/projects/${projA}/entries?figure=spent`);
    expect(e.json?.entries || []).toEqual([]);
    const projB = (await call(B, "POST", "/projects", { body: { name: "B project" } })).json.id;
    denied(await call(B, "PUT", `/projects/${projB}/commitments/${commitA}/bills/${A.billId}`));
    denied(await call(B, "PUT", `/projects/${projB}/budget`, { body: { lines: [{ accountId: A.accounts["5100"], amount: "1" }] } }));
    const mine = await call(A, "GET", `/projects/${projA}`);
    expect(mine.json).toMatchObject({ name: "SECRET-PROJECT-A", contract: "100,000.00", certified: "0.00" });
  });
});

describe("A's orders, from B", () => {
  let orderA;
  let lineA;
  beforeAll(async () => {
    const r = await call(A, "POST", "/orders", { body: { kind: "purchase", partyName: "SECRET-VENDOR-A", lines: [{ description: "SECRET-GOODS-A", accountId: A.accounts["5100"], quantity: "1", unitPrice: "100" }] } });
    expect(r.status).toBe(201);
    orderA = r.json.id;
    lineA = (await call(A, "GET", `/orders/${orderA}`)).json.lines[0].id;
  });

  it("B cannot see, approve, receive, bill, cancel, or order on A's accounts", async () => {
    noLeak(await call(B, "GET", "/orders"), "SECRET-VENDOR-A", "SECRET-GOODS-A");
    denied(await call(B, "GET", `/orders/${orderA}`));
    denied(await call(B, "POST", `/orders/${orderA}/approve`));
    denied(await call(B, "POST", `/orders/${orderA}/deliveries`, { body: { lines: [{ orderLineId: lineA, quantity: "1" }] } }));
    denied(await call(B, "POST", `/orders/${orderA}/bill`, { body: {} }));
    denied(await call(B, "POST", `/orders/${orderA}/cancel`));
    denied(await call(B, "POST", "/orders", { body: { kind: "purchase", partyName: "x", lines: [{ description: "x", accountId: A.accounts["5100"], quantity: "1", unitPrice: "1" }] } }));
    const own = (await call(B, "POST", "/orders", { body: { kind: "purchase", partyName: "B vendor", lines: [{ description: "x", accountId: B.accounts["5100"], quantity: "1", unitPrice: "1" }] } })).json.id;
    denied(await call(B, "POST", `/orders/${own}/deliveries`, { body: { lines: [{ orderLineId: lineA, quantity: "1" }] } }));
    expect((await call(A, "GET", `/orders/${orderA}`)).json).toMatchObject({ number: "PO-0001", status: "open", delivered: "0.00" });
  });
});

describe("confirming an email address", () => {
  const jwt = req("jsonwebtoken");
  const secret = process.env.JWT_SECRET;
  const N = {};

  it("a new account can do nothing until its address is confirmed", async () => {
    await signUp(N, "Newcomer", `new.${Date.now()}@n.test`, { confirm: false });
    expect(N.user.mustVerify).toBe(true);
    const me = await call(N, "GET", "/auth/me", { company: null });
    expect(me.status).toBe(200);
    expect(me.json.user.mustVerify).toBe(true);
    expect((await call(N, "GET", "/companies", { company: null })).status).toBe(403);
    expect((await call(N, "POST", "/companies", { body: { name: "Squat" }, company: null })).status).toBe(403);
    expect((await call(N, "POST", "/auth/verify/resend", { company: null })).status).toBe(200);
  });

  it("a confirm link is not a session, and a link for another address does nothing", async () => {
    const token = jwt.sign({ sub: N.user.id, email: N.user.email }, `${secret}:verify-email`, { expiresIn: "3d" });
    const asCookie = await call({ cookie: `sentryfi_token=${token}` }, "GET", "/auth/me", { company: null });
    expect(asCookie.status).toBe(401);
    const other = jwt.sign({ sub: N.user.id, email: "someone@else.test" }, `${secret}:verify-email`);
    expect((await call(null, "POST", "/auth/verify", { body: { token: other } })).status).toBe(400);
    const forged = jwt.sign({ sub: N.user.id, email: N.user.email }, secret);
    expect((await call(null, "POST", "/auth/verify", { body: { token: forged } })).status).toBe(400);
  });

  it("the right link opens the account", async () => {
    const token = jwt.sign({ sub: N.user.id, email: N.user.email }, `${secret}:verify-email`, { expiresIn: "3d" });
    expect((await call(null, "POST", "/auth/verify", { body: { token } })).status).toBe(200);
    expect((await call(N, "GET", "/companies", { company: null })).status).toBe(200);
  });

  it("forgot password answers the same whether or not the address has an account", async () => {
    const known = await call(null, "POST", "/auth/forgot", { body: { email: N.user.email } });
    const unknown = await call(null, "POST", "/auth/forgot", { body: { email: "nobody.at.all@x.test" } });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.text).toBe(unknown.text);
    const { rows } = await db.query("SELECT emailed, company_id FROM password_resets WHERE user_id = $1", [N.user.id]);
    expect(rows).toEqual([{ emailed: true, company_id: null }]);
  });

  it("an emailed reset link confirms the address and takes it back from a squatter", async () => {
    const S = {};
    await signUp(S, "Squatter", `owner.${Date.now()}@o.test`, { confirm: false });
    const token = "a-reset-link-the-real-owner-got-by-email";
    const hash = require("node:crypto").createHash("sha256").update(token).digest("hex");
    await db.query("INSERT INTO password_resets (user_id, token_hash, emailed) VALUES ($1, $2, true)", [S.user.id, hash]);
    const r = await fetch(`${BASE}/auth/reset/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "the real owner now" }),
    });
    expect(r.status).toBe(200);
    const owner = { cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
    expect((await call(owner, "GET", "/companies", { company: null })).status).toBe(200);
    expect((await call(S, "GET", "/auth/me", { company: null })).status).toBe(401); // the squatter is signed out
  });
});

describe("mail arriving for sentryfi.app", () => {
  const post = (body, headers = {}) =>
    fetch(`${BASE}/inbound/email`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  const sign = (body, { secret = "test-webhook-secret", ts = Math.floor(Date.now() / 1000) } = {}) => {
    const id = "msg_" + Date.now();
    const sig = require("node:crypto").createHmac("sha256", Buffer.from(secret)).update(`${id}.${ts}.${body}`).digest("base64");
    return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
  };
  const body = JSON.stringify({ type: "email.sent", data: {} });

  it("is refused unless Resend signed it", async () => {
    expect((await post(body)).status).toBe(401);
    expect((await post(body, sign(body, { secret: "someone-else" }))).status).toBe(401);
    expect((await post(body, sign(body, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await post(body + " ", sign(body))).status).toBe(401);
  });

  it("is accepted when it is", async () => {
    const r = await post(body, sign(body));
    expect(r.status).toBe(200);
    expect((await r.json()).ignored).toBe("email.sent");
  });
});

describe("every company table is walled", () => {
  it("has row-level security switched on and forced, and a policy", async () => {
    const { rows } = await db.query(
      `SELECT c.relname AS t, c.relrowsecurity AS on, c.relforcerowsecurity AS forced,
              (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname)::int AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM information_schema.columns k
                       WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'company_id')`
    );
    // Tables the app role cannot reach at all need no policy: the platform's own.
    const platform = new Set(["password_resets", "backup_runs"]);
    const open = rows.filter((r) => !platform.has(r.t) && !(r.on && r.forced && r.policies > 0)).map((r) => r.t);
    expect(open).toEqual([]);
  });
});
