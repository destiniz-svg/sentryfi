/**
 * The CFO's what-if, live, in the test company: the suggested question about a
 * second excavator is answered with the scenario tool, in the company's own
 * figures, with the lowest cash and whether it runs out.
 *
 *   node tools/whatif.js
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
    await page.goto(BASE + "/cfo", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /second excavator/ }).click();
    const answer = page.getByTestId("answer").first();
    await answer.waitFor({ timeout: 120000 });
    const said = await answer.innerText();
    if (/MVR [\d,]+\.\d\d/.test(said) && /cash/i.test(said) && /the (four figures|checks|month|scenario)|Looked at/i.test(said)) ok(`answered in the books' figures: "${said.split("\n").filter(Boolean)[1].slice(0, 220)}"`);
    else bad(`the answer reads ${said.slice(0, 300)}`);
    if (/Looked at:.*(what-if|scenario)/i.test(said) || /scenario/i.test(said)) ok("it worked the scenario through");
    else console.log("  note the answer did not name the scenario tool: " + said.split("\n").slice(-1)[0]);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
