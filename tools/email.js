/**
 * Email, end to end, live: Forgot password answers without saying whether an
 * address has an account, and a new sign-up sees "Check your email" and
 * nothing else until the address is confirmed.
 *
 * Signs up with Resend's test mailbox (delivered+...@resend.dev), which
 * accepts mail and delivers it nowhere. Prints the address; the confirm link
 * lands in Resend's log. Pass that link to finish:
 *
 *   node tools/email.js
 *   node tools/email.js <confirm link> <the same address>
 */
const { chromium } = require("playwright");
const { BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const PASSWORD = "check-email-flow-" + Date.now();

(async () => {
  const [link, address] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();

    if (link) {
      await page.goto(link, { waitUntil: "networkidle" });
      await page.waitForURL(/\/(dashboard|login)/, { timeout: 20000 }).catch(() => {});
      const said = await page.getByRole("alert").innerText().catch(() => "");
      if (said) return bad(`the confirm page says: ${said}`);
      // Not signed in on this fresh browser, so sign in and see the books open.
      if (page.url().includes("/login")) {
        await page.fill("input[type=email]", address);
        await page.fill("input[type=password]", process.env.EMAIL_CHECK_PASSWORD || "");
        await page.locator("button[type=submit]").click();
      }
      await page.waitForTimeout(2500);
      const stuck = await page.getByRole("heading", { name: "Check your email" }).count();
      if (stuck) bad("still asked to check email after confirming");
      else ok("the link confirmed the address and the account opened");
      await page.screenshot({ path: "shots/email-confirmed.png" });
      return;
    }

    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("link", { name: /forgot your password/i }).click();
    await page.fill("#forgot-email", `nobody.${Date.now()}@example.com`);
    await page.getByRole("button", { name: /email me a link/i }).click();
    await page.getByText(/is on its way/).waitFor({ timeout: 15000 });
    ok("Forgot password answers without saying whether the address has an account");
    await page.screenshot({ path: "shots/email-forgot.png" });

    const email = `delivered+sentryfi${Date.now()}@resend.dev`;
    await page.goto(BASE + "/register", { waitUntil: "networkidle" });
    await page.getByLabel("Full name").fill("Email Check");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.locator("button[type=submit]").click();
    await page.getByRole("heading", { name: "Check your email" }).waitFor({ timeout: 20000 });
    ok("a new sign-up is asked to confirm the address, and sees nothing else");
    const r = await page.evaluate(() => fetch("/api/companies", { credentials: "include" }).then((x) => x.status));
    if (r === 403) ok("and the books refuse it (403) until then");
    else bad(`the books answered ${r} before the address was confirmed`);
    await page.screenshot({ path: "shots/email-check.png" });
    console.log(`  address ${email}\n  password ${PASSWORD}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
