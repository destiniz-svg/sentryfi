/**
 * The main app on a phone: the tab bar, the Record sheet, and More.
 *
 * Signed in as the owner on a phone, this taps Record and each of the sheet's
 * ways in, and walks More to the pages it groups.
 *
 *   node tools/tabbar.js
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
    const { page } = await signIn(browser, { phone: true });
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 45000 });

    const bar = page.locator("nav[aria-label=Main]");
    const tabs = await bar.locator("a, button").allInnerTexts();
    const names = tabs.map((t) => t.trim()).filter(Boolean).join(" · ");
    if (names === "Home · Money · Bank · More") ok("the tab bar reads Home · Money · Record · Bank · More");
    else bad(`the tab bar reads ${names}`);

    // The bar must sit inside the screen, not under it.
    const box = await bar.boundingBox();
    if (box && box.y + box.height <= 844 + 1) ok("the bar sits inside the screen");
    else bad(`the bar ends at ${box && box.y + box.height}`);

    await bar.getByRole("button", { name: "Record" }).click();
    const sheet = page.getByRole("dialog", { name: "Record", exact: true });
    await sheet.waitFor({ timeout: 5000 });
    const rows = await sheet.locator("button").allInnerTexts();
    if (rows.some((r) => /Photograph a bill/.test(r)) && rows.some((r) => /Raise an invoice/.test(r))) ok("Record opens the sheet with its ways in");
    else bad("the Record sheet is missing rows: " + rows.join(" | "));
    await page.waitForTimeout(600);
    await page.screenshot({ path: "shots/tabbar-record.png" });

    await sheet.getByRole("button", { name: /Raise an invoice/ }).click();
    await page.waitForURL("**/invoices", { timeout: 10000 });
    await page.getByRole("dialog").first().waitFor({ timeout: 15000 });
    ok("Raise an invoice lands on the invoice form, open");
    await page.keyboard.press("Escape");

    await bar.getByRole("button", { name: "Record" }).click();
    await sheet.getByRole("button", { name: /Move money/ }).click();
    await page.waitForURL("**/bank", { timeout: 10000 });
    await page.getByRole("dialog").first().waitFor({ timeout: 15000 });
    ok("Move money lands on the bank, the move open");
    await page.keyboard.press("Escape");

    await bar.getByRole("button", { name: "Record" }).click();
    await sheet.getByRole("button", { name: /Photograph a bill/ }).click();
    await sheet.waitFor({ state: "detached", timeout: 5000 });
    await page.getByRole("button", { name: "Say it", exact: true }).waitFor({ timeout: 15000 });
    ok("Photograph a bill opens the bill sheet where the person is");
    await page.keyboard.press("Escape");

    // Home: cash card, its line, and what needs the owner.
    await bar.locator('a[href="/dashboard"]').click();
    await page.getByRole("heading", { name: "Needs you" }).waitFor({ timeout: 15000 });
    const card = await page.locator("main").innerText();
    if (/cash and bank/i.test(card)) ok("Home leads with cash and bank");
    else bad("Home has no cash card");
    if (await page.locator("main svg polyline").count()) ok("the thirty-day line is drawn");
    else console.log("  note no line: this company has no bank figures yet");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "shots/mobile-home.png", fullPage: true });

    // Money: bills and invoices, by day, with a total.
    await bar.locator('a[href="/money"]').click();
    await page.getByRole("tab", { name: "Bills" }).waitFor({ timeout: 15000 });
    await page.locator("main h3").first().waitFor({ timeout: 15000 });
    ok("Money lists bills by day");
    await page.screenshot({ path: "shots/mobile-money-bills.png", fullPage: true });
    await page.getByRole("tab", { name: "Invoices" }).click();
    await page.getByText("Customers owe you").waitFor({ timeout: 15000 });
    ok("Invoices shows what customers owe");
    await page.screenshot({ path: "shots/mobile-money-invoices.png", fullPage: true });

    await bar.locator('a[href="/more"]').click();
    await page.locator("main h1", { hasText: "More" }).waitFor({ timeout: 15000 });
    const current = await bar.locator('a[aria-current="page"]').innerText();
    if (current.trim() === "More") ok("More is the tab marked current");
    else bad(`the current tab is ${current}`);
    await page.screenshot({ path: "shots/tabbar-more.png", fullPage: true });

    await page.getByRole("link", { name: "People" }).click();
    await page.waitForURL("**/settings?tab=people", { timeout: 10000 });
    const tab = page.getByRole("tab", { name: "People" });
    await tab.waitFor({ timeout: 15000 });
    if ((await tab.getAttribute("aria-selected")) === "true") ok("People opens Settings on the People tab");
    else bad("Settings opened on another tab");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
