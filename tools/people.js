/**
 * Adding someone, end to end.
 *
 * As the administrator of the checks company: Settings, People, add a new
 * email as site staff, take the link. In a separate browser with nobody
 * signed in: open the link, set a name and password, arrive in the books.
 * They must see only the camera, their tin and themselves: Settings and the
 * office pages send them home. The administrator hands them a tin with a
 * float from the desk; they see it, with what is owed back. Then the role is
 * taken away, so the check can run again.
 *
 *   node tools/people.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const TIN = "Checks tin";

setTimeout(() => {
  console.log("  FAIL the check did not finish within four minutes");
  process.exit(1);
}, 240000).unref?.();

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
    const name = `Joiner ${Date.now().toString(36).slice(-4)}`;

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/settings", { waitUntil: "networkidle", timeout: 45000 });
    await phone.page.getByRole("tab", { name: "People" }).click();
    await phone.page.getByTestId("people-list").waitFor({ timeout: 15000 });
    if (await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) bad("phone: the People tab scrolls sideways");
    else ok("phone: the People tab fits");
    await phone.page.screenshot({ path: "shots/people-phone.png", fullPage: true });

    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/settings", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("tab", { name: "People" }).click();
    await page.getByTestId("people-list").waitFor({ timeout: 15000 });
    await page.fill("#person-email", email);
    await page.selectOption("#person-role", "site_staff");
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.getByTestId("invite-link").waitFor({ timeout: 10000 });
    const link = (await page.getByLabel("Join link").inputValue()).replace(/^https?:\/\/[^/]+/, BASE);
    ok("a join link was made");
    await page.screenshot({ path: "shots/people-desk.png", fullPage: true });

    // Someone else, on their own phone, not signed in.
    const stranger = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const them = await stranger.newPage();
    await them.goto(link, { waitUntil: "networkidle" });
    await them.getByRole("heading", { name: /join sentryfi checks/i }).waitFor({ timeout: 15000 });
    ok("the link opens a join page naming the company");
    await them.screenshot({ path: "shots/people-join-phone.png" });
    await them.getByLabel("Your name").fill(name);
    await them.getByLabel("Choose a password").fill("a-long-password-1");
    await them.getByRole("button", { name: /join/i }).click();
    await them.waitForURL("**/dashboard", { timeout: 20000 });
    await them.getByRole("heading", { name: /send a bill/i }).waitFor({ timeout: 15000 });
    ok("they arrive signed in, on the send-a-bill home");

    for (const path of ["/settings", "/bank", "/statements"]) {
      await them.goto(BASE + path, { waitUntil: "networkidle" });
      if (new URL(them.url()).pathname === "/dashboard") ok(`${path} sends site staff home`);
      else bad(`site staff reached ${path}`);
    }
    await them.locator('nav[aria-label="Main"] a', { hasText: /more/i }).click();
    await them.waitForURL("**/me", { timeout: 10000 });
    await them.getByRole("button", { name: /sign out/i }).waitFor({ timeout: 10000 });
    ok("More opens their own page, not Settings");
    await them.screenshot({ path: "shots/people-me-phone.png" });

    // The office hands them a tin with a float.
    await page.goto(BASE + "/bank", { waitUntil: "networkidle" });
    const tins = page.getByTestId("cash-tins");
    await tins.waitFor({ timeout: 15000 });
    const row = tins.locator("li", { hasText: TIN });
    if (await row.count()) {
      await row.getByRole("button", { name: /change/i }).click();
    } else {
      await tins.getByRole("button", { name: /cash tin/i }).click();
      await page.fill("#tin-name", TIN);
    }
    await page.selectOption("#tin-holder", { label: name });
    await page.fill("#tin-float", "1,000.00");
    await page.getByRole("button", { name: /^(save|open it)$/i }).click();
    await tins.locator("li", { hasText: TIN }).getByText(`Held by ${name}`).waitFor({ timeout: 10000 });
    ok(`the office handed ${TIN} to them with a float of 1,000.00`);
    await page.screenshot({ path: "shots/tins-desk.png", fullPage: true });

    await them.goto(BASE + "/cash", { waitUntil: "networkidle" });
    await them.getByText(`In the tin: ${TIN}`).waitFor({ timeout: 15000 });
    const float = await them.getByTestId("tin-float").innerText();
    if (/1,000\.00/.test(float)) ok("they see their tin, its float and what is owed back");
    else bad(`their tin shows: ${float}`);
    const others = await them.getByText("Other tins").count();
    if (!others) ok("they see only their own tin");
    else bad("they can see other people's tins");
    await them.screenshot({ path: "shots/tin-phone.png", fullPage: true });
    await stranger.close();

    await page.goto(BASE + "/settings", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "People" }).click();
    const person = page.getByTestId("people-list").locator("li", { hasText: email });
    await person.getByRole("button", { name: /take site staff away/i }).click();
    await person.waitFor({ state: "detached", timeout: 10000 });
    ok("taking the role away removes them");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
