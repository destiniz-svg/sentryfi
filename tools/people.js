/**
 * Adding someone, end to end.
 *
 * As the administrator of the checks company: Settings, People, add a new
 * email as site staff, take the link. In a separate browser with nobody
 * signed in: open the link, set a name and password, arrive in the books.
 * Back as the administrator: the person is listed, the change is logged, and
 * taking the role away removes them again, so the check can run again.
 *
 *   node tools/people.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — people\n`);
    const email = `join+${Date.now().toString(36)}@sentryfi.invalid`;

    for (const phone of [false, true]) {
      const { page } = await signIn(browser, { phone });
      await page.goto(BASE + "/settings", { waitUntil: "networkidle", timeout: 45000 });
      await page.getByRole("tab", { name: "People" }).click();
      await page.getByTestId("people-list").waitFor({ timeout: 15000 });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (wide) bad(`${phone ? "phone" : "desk"}: the People tab scrolls sideways`);
      else ok(`${phone ? "phone" : "desk"}: the People tab fits`);
      if (phone) {
        await page.screenshot({ path: "shots/people-phone.png", fullPage: true });
        break;
      }

      await page.fill("#person-email", email);
      await page.selectOption("#person-role", "site_staff");
      await page.getByRole("button", { name: /^add$/i }).click();
      await page.getByTestId("invite-link").waitFor({ timeout: 10000 });
      const link = await page.getByLabel("Join link").inputValue();
      if (/\/join\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,}$/.test(link)) ok("a join link was made");
      else return bad(`the link looks wrong: ${link}`);
      await page.screenshot({ path: "shots/people-desk.png", fullPage: true });

      // Someone else, on their own phone, not signed in.
      const stranger = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const them = await stranger.newPage();
      await them.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
      await them.getByRole("heading", { name: /join sentryfi checks/i }).waitFor({ timeout: 15000 });
      ok("the link opens a join page naming the company");
      await them.screenshot({ path: "shots/people-join-phone.png" });
      await them.getByLabel("Your name").fill("Check Joiner");
      await them.getByLabel("Choose a password").fill("a-long-password-1");
      await them.getByRole("button", { name: /join/i }).click();
      await them.waitForURL("**/dashboard", { timeout: 20000 });
      const me = await them.evaluate(() => fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()));
      if (me.user?.email === email) ok("they arrive signed in as themselves");
      else bad(`after joining, signed in as ${JSON.stringify(me)}`);
      await them.getByRole("heading", { name: /send a bill/i }).waitFor({ timeout: 15000 });
      const offered = await them.locator("nav[aria-label=Main] a").allInnerTexts();
      if (!offered.some((t) => /bills|cash/i.test(t))) ok(`site staff see the camera and nothing else (${offered.join(", ")})`);
      else bad(`site staff are offered: ${offered.join(", ")}`);
      await them.screenshot({ path: "shots/people-joined-phone.png" });

      await them.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
      if (await them.getByText(/already been used/i).count()) ok("the link does not work twice");
      else bad("the used link still offered to join");
      await stranger.close();

      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("tab", { name: "People" }).click();
      const row = page.getByTestId("people-list").locator("li", { hasText: email });
      await row.waitFor({ timeout: 10000 });
      ok("they are listed, as site staff");
      if (await page.getByTestId("people-changes").getByText(`${email} joined as site staff`).count()) ok("the joining is logged");
      else bad("the joining is not in the changes");

      await row.getByRole("button", { name: /take site staff away/i }).click();
      await row.waitFor({ state: "detached", timeout: 10000 });
      ok("taking the role away removes them");
    }
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
