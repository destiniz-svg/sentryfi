/**
 * Getting the books going, live, in the test company: the card agrees with
 * the books, names the next step with why, and "Do it now" goes there; on a
 * phone it fits the screen.
 *
 *   node tools/setup.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    const s = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      return fetch("/api/companies/current/setup", { credentials: "include", headers }).then((r) => r.json());
    });
    if (s.total === 8 && s.steps.every((x) => x.why && x.href)) ok(`the books say ${s.done} of ${s.total} done: ${s.steps.filter((x) => x.done).map((x) => x.key).join(", ") || "none"}`);
    else bad(`the steps read ${JSON.stringify(s).slice(0, 200)}`);
    const card = page.getByTestId("getting-started");
    if (s.done === s.total) {
      if (await card.count()) bad("every step is done, yet the card still shows");
      else ok("every step is done, so the card is gone");
    } else {
      await card.waitFor({ timeout: 10000 });
      const next = s.steps.find((x) => !x.done);
      const said = await page.getByTestId("next-step").innerText();
      if (said.includes(next.title) && said.includes(next.why) && (await card.innerText()).includes(`${s.done} of ${s.total} done`)) ok(`the card agrees, and the next step is "${next.title}" with why`);
      else bad(`the card reads ${said.slice(0, 200)}`);
      await page.screenshot({ path: "shots/setup-desk.png" });
      await page.getByRole("link", { name: /do it now/i }).click();
      await page.waitForURL((u) => (u.pathname + u.search).startsWith(next.href.split("?")[0]), { timeout: 10000 });
      ok(`"Do it now" goes to ${next.href}`);
    }
    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await phone.page.waitForTimeout(1500);
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (!wide) ok("on a phone, Home with the card fits the screen");
    else bad("Home is wider than the phone");
    await phone.page.screenshot({ path: "shots/setup-phone.png" });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
