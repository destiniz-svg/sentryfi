/**
 * Offline in the field, live, in the test company.
 *
 * A tin is opened; the line is cut; money goes out of the tin with no signal
 * and is kept on the phone, named in the waiting list; the app is reopened
 * with no signal and still opens on the tin (kept answers); the line comes
 * back and the spend goes by itself, once: the tin's history holds it one
 * time, however often the phone tried.
 *
 *   node tools/field.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
setTimeout(() => {
  console.log("  FAIL the check did not finish within four minutes");
  process.exit(1);
}, 240000).unref?.();

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page, context } = await signIn(browser, { phone: true });
    const name = `Field tin ${Date.now().toString().slice(-6)}`;
    const what = `offline sand ${Date.now().toString().slice(-5)}`;
    const boxId = await page.evaluate(async (n) => {
      const company = localStorage.getItem("sentryfi.company");
      const r = await fetch("/api/cash", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Company-Id": company }, body: JSON.stringify({ name: n }) });
      const box = (await r.json()).box;
      localStorage.setItem("sentryfi.cashbox." + company, box.id);
      return box.id;
    }, name);
    await page.goto(BASE + "/cash", { waitUntil: "networkidle" });
    await page.getByText(name).first().waitFor({ timeout: 15000 });
    ok(`a tin to work with: ${name}`);
    // A phone that has used the app has its offline copy; this fresh browser waits for it.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
    await page.getByText(name).first().waitFor({ timeout: 15000 });

    await context.setOffline(true);
    await page.getByRole("button", { name: /money out of the tin/i }).first().click();
    await page.fill("#cash-amount", "5");
    await page.fill("#cash-what", what);
    await page.locator("button[type=submit]").last().click();
    await page.getByText("Kept on this phone").first().waitFor({ timeout: 10000 });
    const list = page.getByTestId("waiting-to-send");
    await list.getByText(what).waitFor({ timeout: 10000 });
    ok("with no signal, the spend is kept on the phone and named in the waiting list");

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.getByText(name).first().waitFor({ timeout: 20000 });
    await page.getByTestId("waiting-to-send").getByText(what).waitFor({ timeout: 10000 });
    ok("reopened with no signal, the app still opens on the tin, and the spend is still waiting");
    await page.screenshot({ path: "shots/field-offline.png" });

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.getByTestId("waiting-to-send").waitFor({ state: "detached", timeout: 30000 });
    ok("back in signal, it sends itself and the waiting list goes");

    const times = await page.evaluate(async ({ id, w }) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const h = await fetch(`/api/cash/${id}/history`, { credentials: "include", headers }).then((r) => r.json());
      return JSON.stringify(h).split(w).length - 1;
    }, { id: boxId, w: what });
    if (times === 1) ok("the tin's history holds the spend once");
    else bad(`the spend is in the history ${times} times`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
