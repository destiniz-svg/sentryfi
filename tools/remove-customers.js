/**
 * Removes every customer except the ones named in KEEP, through the developer
 * dashboard's own API, as the developer account. Takes a fresh backup first and
 * stops if it fails. Run once, by the owner's decision of 24 September 2026.
 *
 *   SHOOT_EMAIL=demo@sentryfi.app SHOOT_PASSWORD=... node tools/remove-customers.js
 */
const { chromium } = require("playwright");

const KEEP = ["thinan@enricherholdings.com", "demo@sentryfi.app"];
const REASON = "Owner's clean-up of 24 Sept 2026: keep only Enricher Holdings and the demo account";

(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await (await b.newContext()).newPage();
  await p.goto("https://sentryfi.app/login", { waitUntil: "networkidle" });
  await p.fill("input[type=email]", process.env.SHOOT_EMAIL);
  await p.fill("input[type=password]", process.env.SHOOT_PASSWORD);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });

  const call = (method, url, body, headers = {}) =>
    p.evaluate(
      async ([method, url, body, headers]) => {
        const r = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
        let data = null;
        try { data = await r.json(); } catch { /* no body */ }
        return { status: r.status, data };
      },
      [method, url, body, headers]
    );

  const backup = await call("POST", "/api/backups/run");
  console.log("backup:", backup.status, JSON.stringify(backup.data).slice(0, 200));
  if (backup.status >= 300) {
    console.log("The backup did not run, so nothing was removed.");
    await b.close();
    process.exit(1);
  }

  let d = (await call("GET", "/api/platform")).data;
  const kept = (c) => c.people.some((x) => KEEP.includes(x.email.toLowerCase()));

  for (const c of d.companies.filter((c) => !kept(c))) {
    const r = await call("DELETE", `/api/platform/customers/${c.id}`, { confirm: c.name, reason: REASON });
    console.log("company", c.name, r.status, JSON.stringify(r.data));
  }

  // Anyone else inside a kept company is taken out of it, then removed.
  d = (await call("GET", "/api/platform")).data;
  for (const c of d.companies) {
    for (const x of c.people.filter((x) => !KEEP.includes(x.email.toLowerCase()))) {
      const r = await call("DELETE", `/api/companies/current/people/${x.id}/roles/${x.role}`, null, { "X-Company-Id": c.id });
      console.log("out of", c.name, x.email, x.role, r.status, JSON.stringify(r.data));
    }
  }

  d = (await call("GET", "/api/platform")).data;
  for (const u of d.noCompany.filter((u) => !KEEP.includes(u.email.toLowerCase()))) {
    const r = await call("DELETE", `/api/platform/people/${u.id}`, { confirm: u.email, reason: REASON });
    console.log("person", u.email, r.status, r.status >= 300 ? JSON.stringify(r.data) : "");
  }

  d = (await call("GET", "/api/platform")).data;
  console.log("left:", d.companies.map((c) => `${c.name} (${c.people.map((x) => x.email).join(", ")})`).join(" | "), "| no books:", d.noCompany.map((u) => u.email).join(", ") || "none");
  await b.close();
})();
