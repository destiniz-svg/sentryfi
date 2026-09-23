/**
 * The CFO, live, in the test company.
 *
 * Opens the morning brief: its headline agrees with the four figures; "due
 * out" opens onto what makes it up, and those add up to the tile; every
 * section is there; the profile is drawn from the books; a note told to it is
 * kept. Does not switch on the email, so no brief goes to a real mailbox.
 *
 *   node tools/cfo.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const n = (s) => Number(String(s).replace(/[^\d.-]/g, ""));

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/cfo", { waitUntil: "networkidle", timeout: 45000 });
    const headline = await page.getByTestId("brief-headline").innerText();
    const tile = async (k) => n((await page.getByTestId(`cfo-${k}`).innerText()).split("\n").pop());
    const [cash, dueIn, dueOut, leaves] = [await tile("cash-now"), await tile("due-in"), await tile("due-out"), await tile("leaves")];
    if (Math.abs(cash + dueIn - dueOut - leaves) < 0.005 && headline.includes(`Cash MVR`)) ok(`the brief: "${headline}"`);
    else bad(`the tiles do not add up: ${cash} + ${dueIn} - ${dueOut} vs ${leaves}`);

    await page.getByTestId("cfo-due-out").click();
    const parts = page.getByTestId("parts");
    await parts.waitFor({ timeout: 10000 });
    const amounts = (await parts.locator("li").allInnerTexts()).map((t) => n(t.split("\n").pop()));
    const total = amounts.reduce((a, b) => a + b, 0);
    if (Math.abs(total - dueOut) < 0.005) ok(`"due out" opens onto ${amounts.length} items that add up to MVR ${dueOut.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    else bad(`"due out" lists items adding to ${total}, not ${dueOut}`);
    await page.keyboard.press("Escape");

    const brief = await page.getByTestId("brief").innerText();
    const sections = ["YESTERDAY", "TODAY", "NOTICED", "THE MARKET", "LEARNED"].filter((s) => brief.toUpperCase().includes(s));
    if (sections.length === 5) ok("yesterday, today, noticed, the market and learned are all there");
    else bad(`the brief has only ${sections.join(", ")}`);

    const profile = await page.getByTestId("profile").innerText();
    if (/months? of books/.test(profile) && /Revenue MVR/.test(profile)) ok("the profile is drawn from the books");
    else bad(`the profile reads ${profile.slice(0, 200)}`);

    const note = `Checked ${Date.now() % 100000}`;
    await page.getByLabel("About").selectOption("What worries us");
    await page.getByLabel("What it should know").fill(note);
    await page.getByRole("button", { name: /^tell it$/i }).click();
    await page.getByTestId("profile").getByText(note).waitFor({ timeout: 10000 });
    ok("a note told to it is kept on the profile");
    await page.screenshot({ path: "shots/cfo-desk.png", fullPage: true });

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/cfo", { waitUntil: "networkidle" });
    await phone.page.getByTestId("brief-headline").waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("the brief fits a phone, no sideways scroll");
    else bad("the CFO page scrolls sideways on a phone");
    await phone.page.screenshot({ path: "shots/cfo-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
