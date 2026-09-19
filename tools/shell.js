/**
 * Does the app open with no signal?
 *
 * The queue keeps a bill safe once the app is on screen. This asks the
 * question before that: somebody on a site closed the tab, has a bill in
 * their hand and no bars — do they get the app, or the browser's error page?
 *
 *   node tools/shell.js
 */

const { chromium } = require("playwright");

const BASE = process.env.SHOOT_BASE || "https://sentryfi.app";
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const email = process.env.SHOOT_EMAIL;
  const password = process.env.SHOOT_PASSWORD;
  if (!email || !password) throw new Error("Set SHOOT_EMAIL and SHOOT_PASSWORD.");

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  console.log(`\n${BASE} — opening the app with no signal\n`);

  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });
  ok("signed in");

  await page.goto(BASE + "/bills", { waitUntil: "networkidle", timeout: 45000 });

  // Give the worker time to take over and finish precaching.
  const ready = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return reg ? (navigator.serviceWorker.controller ? "controlling" : "registered") : "none";
  });
  if (ready === "controlling" || ready === "registered") ok(`service worker ${ready}`);
  else bad(`no service worker (${ready})`);

  await page.waitForTimeout(4000);

  // The real thing: a closed tab, reopened on a dead connection.
  await page.close();
  await context.setOffline(true);

  const fresh = await context.newPage();
  const errors = [];
  fresh.on("pageerror", (e) => errors.push(e.message));

  let reached = true;
  await fresh
    .goto(BASE + "/bills", { waitUntil: "domcontentloaded", timeout: 45000 })
    .catch((e) => {
      reached = false;
      bad("the app did not open offline: " + e.message.split("\n")[0]);
    });

  if (reached) {
    ok("the app opened with no signal");
    await fresh.waitForTimeout(3000);

    const rootFilled = await fresh.evaluate(
      () => (document.getElementById("root")?.childElementCount || 0) > 0
    );
    if (rootFilled) ok("it rendered, rather than showing a blank shell");
    else bad("the shell loaded but nothing rendered");

    // A deep link, not just the front door.
    const deep = await fresh
      .goto(BASE + "/figures", { waitUntil: "domcontentloaded", timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (deep) ok("a deep link opens offline too");
    else bad("a deep link falls through to the error page");

    // And the books are never served stale.
    const apiOffline = await fresh.evaluate(() =>
      fetch("/api/bills", { credentials: "include" })
        .then((r) => "answered " + r.status)
        .catch(() => "refused")
    );
    if (apiOffline === "refused") ok("the books are not served from a cache");
    else bad(`a cached answer came back for the books: ${apiOffline}`);

    if (errors.length) console.log("  page errors: " + errors.slice(0, 3).join(" | "));
  }

  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe app opens on a dead connection\n");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
