/**
 * A set of books for the checks to write in.
 *
 * The browser checks record real bills, post them and reverse them. Until now
 * they did that in Altura's own books, and it showed: the journal carried
 * eight test entries, and one of them was left stranded in the figures when a
 * void failed to take its money back out. A company's ledger is not a place
 * to rehearse in.
 *
 * Companies are isolated by row-level security, so a second one under the
 * same login is a complete, free test environment — no new database, no new
 * deployment, no chance of a check touching the real books.
 *
 *   node tools/checks-company.js          # make it, or say where it is
 *
 * The checks find it by name. Set SHOOT_COMPANY to use a different one.
 */

const { chromium } = require("playwright");

const BASE = process.env.SHOOT_BASE || "https://sentryfi.app";
const NAME = process.env.SHOOT_COMPANY || "Sentryfi Checks";

(async () => {
  const email = process.env.SHOOT_EMAIL;
  const password = process.env.SHOOT_PASSWORD;
  if (!email || !password) throw new Error("Set SHOOT_EMAIL and SHOOT_PASSWORD.");

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });

  const result = await page.evaluate(async (name) => {
    const list = await fetch("/api/companies", { credentials: "include" }).then((r) => r.json());
    const already = (list.companies || []).find((c) => c.name.toUpperCase() === name.toUpperCase());
    if (already) return { found: already.name, id: already.id };

    const res = await fetch("/api/companies", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gstRegistered: true, baseCurrency: "MVR" }),
    });
    const body = await res.json();
    if (!res.ok) return { failed: body?.error?.message || res.status };
    return { made: body.company.name, id: body.company.id };
  }, NAME);

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
