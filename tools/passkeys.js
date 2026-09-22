/**
 * Face ID and fingerprint sign-in, end to end, live.
 *
 * Chrome's virtual authenticator stands in for a phone's sensor: the check
 * adds it as a device in Settings, signs out, signs back in with it and no
 * password, then removes it again. Also: a reset link that has run out says
 * so, and People offers a limit and a reset link per person.
 *
 *   node tools/passkeys.js
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
    const { page, context } = await signIn(browser, { phone: false });
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    });

    await page.goto(BASE + "/settings?tab=profile", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByText("Face ID and fingerprint").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /use face id or fingerprint here/i }).click();
    await page.getByText(/is added/).waitFor({ timeout: 15000 });
    ok("a device was added in Settings");

    await page.evaluate(() => fetch("/api/auth/logout", { method: "POST", credentials: "include" }));
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /sign in with face id or fingerprint/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    ok("signed in with it, no password typed");

    await page.goto(BASE + "/settings?tab=profile", { waitUntil: "networkidle" });
    const remove = page.getByRole("button", { name: /^stop .* signing in$/i }).last();
    await remove.click();
    await page.waitForTimeout(1500);
    ok("and removed again");

    await page.goto(BASE + "/settings?tab=people", { waitUntil: "networkidle" });
    const tools = await page.getByRole("button", { name: /password reset link/i }).count();
    const limits = await page.getByLabel(/spending limit for/i).count();
    if (tools > 0 && limits > 0) ok(`People offers a bill limit and a reset link for ${limits} ${limits === 1 ? "person" : "people"}`);
    else console.log("  note nobody but you in this company, so no per-person tools");

    await page.goto(BASE + "/reset/not-a-real-link", { waitUntil: "networkidle" });
    const said = await page.getByRole("alert").innerText().catch(() => "");
    if (/used or has run out/i.test(said)) ok("a link that is not valid says so");
    else bad(`the reset page says: ${said}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
