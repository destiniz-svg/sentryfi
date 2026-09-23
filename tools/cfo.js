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
    await page.getByRole("group", { name: "About" }).getByRole("button", { name: "What worries us" }).click();
    await page.getByLabel("What it should know").fill(note);
    await page.getByRole("button", { name: /^tell it$/i }).click();
    await page.getByTestId("profile").getByText(note).waitFor({ timeout: 10000 });
    ok("a note told to it is kept on the profile");
    const checks = await page.getByTestId("health").locator("li").count();
    if (checks >= 3) ok(`the health checks list ${checks} things a CFO looks at`);
    else bad(`only ${checks} health checks`);
    await page.getByTestId("health").locator("li button").first().click();
    await page.getByTestId("basis").first().waitFor({ timeout: 5000 });
    ok("a check opens onto the figures it rests on");

    await page.getByLabel("Your question").fill("How much cash do we have, and what is due out in the next 30 days?");
    await page.getByRole("button", { name: /^ask$/i }).click();
    const answer = page.getByTestId("answer").first();
    await answer.waitFor({ timeout: 90000 });
    const said = await answer.innerText();
    if (/MVR [\d,]+\.\d\d/.test(said) && /Looked at:/.test(said)) ok(`asked, it answered from the books: "${said.split("\n").filter(Boolean)[1].slice(0, 140)}"`);
    else bad(`the answer reads ${said.slice(0, 300)}`);
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
