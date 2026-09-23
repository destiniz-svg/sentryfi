/**
 * Push, live, in the test company.
 *
 * Opens the bell, turns notifications on for this browser, and checks the
 * server took the device and could push to it; the inbox is there; then turns
 * it off again and checks the device is gone. On a phone the switch is on More.
 *
 *   node tools/push.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  // Chrome refuses push in incognito-like contexts ("permission denied"), which is
  // what Playwright gives by default: so a real, throwaway profile, with a window.
  const dir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "sentryfi-push-"));
  const persistent = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: false, viewport: { width: 1280, height: 900 } });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page, context } = await signIn({ newContext: async () => persistent }, { phone: false });
    await context.grantPermissions(["notifications"], { origin: BASE });
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.getByRole("button", { name: /what needs you/i }).click();
    const sw = page.getByTestId("push-switch");
    await sw.waitFor({ timeout: 10000 });
    if ((await sw.innerText()).trim() === "Turn off") await sw.click();
    await page.getByTestId("push-switch").filter({ hasText: "Turn on" }).waitFor({ timeout: 10000 });
    const tested = page.waitForResponse((r) => r.url().endsWith("/api/push/test"), { timeout: 30000 });
    await page.getByTestId("push-switch").click();
    const sent = (await (await tested).json()).sent;
    if (sent >= 1) ok(`turned on: the server pushed a test to this browser (${sent} device)`);
    else bad(`turned on, but the server pushed to ${sent} devices`);
    await page.screenshot({ path: "shots/push-bell.png" });

    await page.getByTestId("push-switch").filter({ hasText: "Turn off" }).click();
    await page.getByTestId("push-switch").filter({ hasText: "Turn on" }).waitFor({ timeout: 10000 });
    const gone = await page.evaluate(async () => !(await (await navigator.serviceWorker.ready).pushManager.getSubscription()));
    if (gone) ok("turned off: this browser no longer has a subscription");
    else bad("turned off, but the browser still holds a subscription");

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/more", { waitUntil: "networkidle" });
    await phone.page.getByRole("region", { name: "Notifications" }).waitFor({ timeout: 10000 });
    ok("on a phone, More has the notifications switch");
    await phone.page.screenshot({ path: "shots/push-more-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await persistent.close();
    await browser.close();
  }
})();
