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
    await them.locator('nav[aria-label="Main"] a[href="/me"]').click();
    await them.waitForURL("**/me", { timeout: 10000 });
    await them.getByRole("button", { name: /sign out/i }).waitFor({ timeout: 10000 });
    ok("Me opens their own page, not Settings");
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

    const laari = (t) => Math.round(Number(String(t).replace(/[^0-9.-]/g, "")) * 100);
    const inTin = async () => laari(await them.locator(".phone-band-figure span").last().innerText());

    await them.goto(BASE + "/cash", { waitUntil: "networkidle" });
    await them.getByText(`In the tin: ${TIN}`).waitFor({ timeout: 15000 });
    // Anything left handed over from an earlier run is confirmed first.
    while (await them.getByTestId("handed").count()) {
      await them.getByTestId("handed").first().getByRole("button", { name: /yes, i received/i }).click();
      await them.waitForTimeout(1500);
    }
    const before = await inTin();

    // The office hands over 1,000.00.
    await page.reload({ waitUntil: "networkidle" });
    await tins.locator("li", { hasText: TIN }).getByRole("button", { name: /reimburse|give cash/i }).click();
    await page.fill("#give-amount", "1,000.00");
    await page.getByRole("button", { name: /^give mvr/i }).click();
    await page.locator("#give-amount").waitFor({ state: "detached", timeout: 10000 });
    await tins.locator("li", { hasText: TIN }).getByText(/waiting for .* to confirm/).waitFor({ timeout: 10000 });
    ok("the desk shows the cash waiting for the holder to confirm");

    await them.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await them.getByTestId("cash-waiting").waitFor({ timeout: 15000 });
    ok("their home says cash was handed to them");
    await them.screenshot({ path: "shots/tin-waiting-home.png" });
    await them.getByTestId("cash-waiting").click();
    await them.getByTestId("handed").waitFor({ timeout: 15000 });
    if ((await inTin()) === before) ok("it is not in the tin before they confirm");
    else bad("the cash was in the tin before it was confirmed");
    await them.screenshot({ path: "shots/tin-confirm.png", fullPage: true });
    await them.getByTestId("handed").getByRole("button", { name: /yes, i received 1,000\.00/i }).click();
    await them.getByTestId("handed").waitFor({ state: "detached", timeout: 10000 });
    await them.waitForTimeout(1000);
    const after = await inTin();
    if (after === before + 100000) ok("confirmed: 1,000.00 is in the tin");
    else bad(`after confirming, the tin went from ${before} to ${after}`);

    // They spend 200.00 more than the tin holds, out of their own pocket.
    const spend = (after + 20000) / 100;
    await them.getByRole("button", { name: /money out of the tin/i }).click();
    await them.fill("#cash-amount", spend.toFixed(2));
    await them.fill("#cash-what", "Boat fare, paid myself");
    await them.getByRole("button", { name: /^take mvr/i }).click();
    await them.locator("#cash-amount").waitFor({ state: "detached", timeout: 15000 });
    await them.waitForTimeout(1000);
    const end = await inTin();
    const said = await them.locator(".phone-band-lines").innerText();
    if (end === -20000 && /paid 200\.00 out of pocket/i.test(said)) ok("spending past empty shows -200.00, paid out of pocket");
    else bad(`after spending past empty: ${end}, "${said}"`);
    await them.screenshot({ path: "shots/tin-phone.png", fullPage: true });
    const others = await them.getByText("Other tins").count();
    if (!others) ok("they see only their own tin");
    else bad("they can see other people's tins");

    // What they paid themselves is what the office owes them back.
    await them.locator('nav[aria-label="Main"] a[href="/owed"]').click();
    await them.getByRole("heading", { name: /owed back to you/i }).waitFor({ timeout: 15000 });
    const owedBack = await them.locator(".phone-band-figure").innerText();
    if (/200\.00/.test(owedBack)) ok("Owed back says the office owes them 200.00");
    else bad(`Owed back reads "${owedBack}"`);
    await them.screenshot({ path: "shots/owed-phone.png", fullPage: true });
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
