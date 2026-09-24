// Money on a phone: a tap opens a bill's page and an invoice's document, and Back returns. Demo company, reads only.
const { chromium } = require("playwright");
const OUT = process.argv[2] || ".";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto("https://sentryfi.app/login", { waitUntil: "networkidle" });
  await p.fill("input[type=email]", process.env.SHOOT_EMAIL);
  await p.fill("input[type=password]", process.env.SHOOT_PASSWORD);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });
  const list = await p.evaluate(() => fetch("/api/companies").then((r) => r.json()));
  const co = list.companies.find((c) => c.name.startsWith("Coralmark"));
  await p.evaluate((id) => localStorage.setItem("sentryfi.company", id), co.id);

  await p.goto("https://sentryfi.app/money", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("a[href^='/bills/']").first().click();
  await p.waitForURL(/\/bills\//);
  await p.waitForTimeout(1500);
  console.log("bill page:", p.url().replace(/.*\/bills\//, "/bills/…"), "|", await p.locator("h1").first().innerText());
  await p.screenshot({ path: `${OUT}/money-bill.png`, fullPage: true });
  await p.getByRole("button", { name: /Money/ }).first().click();
  await p.waitForURL(/\/money/);
  console.log("back to:", new URL(p.url()).pathname);

  await p.goto("https://sentryfi.app/money?view=invoices", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("a[href^='/documents/invoice/']").first().click();
  await p.waitForURL(/\/documents\/invoice\//);
  await p.waitForTimeout(2500);
  console.log("invoice page:", await p.locator("h1").first().innerText());
  await p.screenshot({ path: `${OUT}/money-invoice.png` });
  await p.getByRole("link", { name: /Back/ }).first().click();
  await p.waitForTimeout(800);
  console.log("back to:", new URL(p.url()).pathname + new URL(p.url()).search);
  await b.close();
})();
