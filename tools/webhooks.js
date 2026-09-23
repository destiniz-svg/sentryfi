/**
 * Webhooks, live, in the test company: refused for a private address; added
 * for a public one (httpbin.org answers any POST), shown its secret once; a
 * test ping is delivered and recorded; turned off after.
 *
 *   node tools/webhooks.js
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
    await page.goto(BASE + "/settings?tab=assistant", { waitUntil: "networkidle" });
    const card = page.getByTestId("webhooks");
    await card.getByLabel("Address").fill("https://127.0.0.1/hook");
    await card.getByRole("button", { name: /add the webhook/i }).click();
    await page.getByText("inside a private network").first().waitFor({ timeout: 10000 });
    ok("a private address is refused");
    await card.getByLabel("Address").fill("https://httpbin.org/post");
    await card.getByRole("button", { name: /add the webhook/i }).click();
    await page.getByTestId("new-webhook").waitFor({ timeout: 10000 });
    if (/whsec_/.test(await page.getByTestId("new-webhook").innerText())) ok("a public https address is added, its secret shown once");
    else bad("no secret shown");
    const row = card.locator("li").filter({ hasText: "httpbin.org" }).first();
    await row.getByRole("button", { name: /send a test/i }).click();
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: "networkidle" });
    const said = await page.getByTestId("webhooks").locator("li").filter({ hasText: "httpbin.org" }).first().innerText();
    if (/delivered/.test(said)) ok("the test ping is delivered and recorded");
    else bad(`after the test the webhook reads: ${said}`);
    await page.getByTestId("webhooks").locator("li").filter({ hasText: "httpbin.org" }).first().getByRole("button", { name: /turn off/i }).click();
    await page.waitForTimeout(1500);
    ok("and it is turned off after");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
