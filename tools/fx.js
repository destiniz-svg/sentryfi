/**
 * Dollars, end to end, at a desk and on a phone.
 *
 * Finds (or opens) a USD bank account in the checks company, moves MVR
 * 1,542.00 = USD 100.00 into it through the screen, and reads both balances
 * back: the dollars must rise by exactly 100.00 and the rufiyaa by exactly
 * 1,542.00. Then the bill form, switched to USD, must offer that rate and
 * say what the bill will be in the books. Moves the money back at the end.
 *
 *   node tools/fx.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const NAME = "Checks USD";

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const cents = (text) => Math.round(Number(String(text).replace(/,/g, "")) * 100);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — another currency\n`);
    const { page } = await signIn(browser, { phone: false });
    const places = () =>
      page.evaluate(async () => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
        return (await fetch("/api/bank", { credentials: "include", headers }).then((r) => r.json())).places;
      });

    await page.goto(BASE + "/bank", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("heading", { name: /bank and cash/i }).waitFor({ timeout: 15000 });

    let all = await places();
    if (!all.some((p) => p.name === NAME)) {
      await page.getByRole("button", { name: /bank account/i }).click();
      await page.fill("#bank-name", NAME);
      await page.selectOption("#bank-currency", "USD");
      await page.getByRole("button", { name: /open it/i }).click();
      await page.getByText(`${NAME} is open`).waitFor({ timeout: 10000 });
      all = await places();
      ok(`opened ${NAME} in USD`);
    }
    const bank = all.find((p) => p.name === "Bank");
    const usd = all.find((p) => p.name === NAME);
    if (!usd?.foreign || usd.currency !== "USD") return bad(`${NAME} is not a USD account: ${JSON.stringify(usd)}`);
    ok(`${NAME} is kept in USD`);

    const move = async (from, to, button) => {
      await page.getByRole("button", { name: /move money/i }).click();
      await page.selectOption("#move-from", from.id);
      await page.selectOption("#move-to", to.id);
      await page.fill("#move-amount", "1542.00");
      if (!(await page.locator("#move-amount-fc").count())) bad("no dollar amount was asked for");
      await page.fill("#move-amount-fc", "100.00");
      await page.getByText("15.4200 MVR to 1 USD").waitFor({ timeout: 5000 });
      await page.getByRole("button", { name: button }).click();
      await page.locator("#move-amount").waitFor({ state: "detached", timeout: 10000 });
    };

    await move(bank, usd, /move usd 100\.00/i);
    const mid = (await places()).find((p) => p.id === usd.id);
    const fcRose = cents(mid.balanceFc) - cents(usd.balanceFc);
    const mvrRose = cents(mid.balance) - cents(usd.balance);
    if (fcRose === 10000 && mvrRose === 154200) ok("USD 100.00 arrived, carried at MVR 1,542.00 in the books");
    else bad(`dollars rose by ${fcRose} and rufiyaa by ${mvrRose}; expected 10000 and 154200`);
    await page.getByText(`USD ${mid.balanceFc}`).first().waitFor({ timeout: 10000 });
    ok("the page shows the dollar balance");
    await page.screenshot({ path: "shots/fx-bank-desk.png" });

    await page.goto(BASE + "/bills", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /record a bill|new bill|record/i }).first().click();
    await page.selectOption("#bill-currency", "USD");
    await page.fill("#bill-amount", "100");
    const offered = await page.locator("#bill-rate").inputValue({ timeout: 10000 }).catch(() => "");
    await page.waitForFunction(() => document.querySelector("#bill-rate")?.value, null, { timeout: 10000 }).catch(() => {});
    const rate = await page.locator("#bill-rate").inputValue();
    if (rate === "15.42") ok("the bill form offers the bank's rate, 15.42");
    else bad(`the bill form offered "${rate || offered}", expected 15.42`);
    if (await page.getByText("MVR 1,542.00 in the books.").count()) ok("the bill says what it will be in the books");
    else bad("the bill did not say its rufiyaa figure");
    await page.screenshot({ path: "shots/fx-bill-desk.png" });
    await page.keyboard.press("Escape");

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/bank", { waitUntil: "networkidle", timeout: 45000 });
    await phone.page.getByText(`USD ${mid.balanceFc}`).first().waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (!wide) ok("on a phone, the dollar balance fits with no sideways scroll");
    else bad("the phone page scrolls sideways");
    await phone.page.screenshot({ path: "shots/fx-bank-phone.png" });

    await page.goto(BASE + "/bank", { waitUntil: "networkidle" });
    await move(usd, bank, /move usd 100\.00/i);
    const end = (await places()).find((p) => p.id === usd.id);
    if (cents(end.balanceFc) === cents(usd.balanceFc) && cents(end.balance) === cents(usd.balance)) ok("moved back: where it started");
    else bad(`after moving back: USD ${end.balanceFc} (was ${usd.balanceFc}), MVR ${end.balance} (was ${usd.balance})`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
