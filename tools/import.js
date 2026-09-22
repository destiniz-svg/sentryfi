/**
 * Bringing history in, from the screen.
 *
 * Uploads a small Zoho-shaped journal export into the checks company, reads
 * the preview, checks every unknown account got a guess, brings it in, and
 * then uploads the same file again: the second time there must be nothing to
 * bring in. The journal numbers are fixed, so every later run is the "again"
 * case and the sandbox does not grow. Dated January 2024, before anything the
 * other checks touch.
 *
 *   node tools/import.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

const FILE = [
  '"Journal Date","Journal Number","Notes","Account","Debit","Credit"',
  '"05/01/2024","CHK-IMP-1","Opening","Bank","5,000.00",""',
  '"05/01/2024","CHK-IMP-1","Opening","Check Import Capital","","5,000.00"',
  '"20/01/2024","CHK-IMP-2","Diesel","Check Import Fuel","250.00",""',
  '"20/01/2024","CHK-IMP-2","Diesel","Bank","","250.00"',
  '"25/01/2024","CHK-IMP-3","Broken","Bank","10.00",""',
].join("\n");

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — bringing history in\n`);
    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/import", { waitUntil: "networkidle", timeout: 45000 });

    const upload = async () => {
      await page.setInputFiles("#import-file", { name: "zoho-journals.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) });
      await page.getByTestId("import-preview").waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      return page.getByTestId("import-preview").innerText();
    };

    const first = await upload();
    if (/3\s+transactions/.test(first) && /1 does not balance/.test(first)) ok("it reads 3 transactions and says 1 does not balance");
    else bad("the preview reads: " + first.replace(/\n/g, " | "));
    await page.screenshot({ path: "shots/import-preview.png", fullPage: true });

    const button = page.getByRole("button", { name: /^bring in \d+ transactions?$|^nothing new/i });
    const label = (await button.innerText()).trim();
    if (/Bring in 2 transactions/.test(label)) {
      const capital = page.getByLabel("What Check Import Capital is here");
      if ((await capital.inputValue()) === "new:equity") ok("an account it has not seen gets a guess: Check Import Capital is the owners' stake");
      else bad(`Check Import Capital was guessed as ${await capital.inputValue()}`);
      await button.click();
      await page.getByText(/2 transactions brought in/).waitFor({ timeout: 15000 });
      ok("2 transactions brought in, the unbalanced one left out");
    } else if (/Nothing new/.test(label)) {
      ok("already brought in on an earlier run");
    } else {
      bad(`the button reads "${label}"`);
    }

    const again = await upload();
    if (/2 were brought in before/.test(again) && /0\s+would go in now/.test(again)) ok("the same file again: nothing to bring in");
    else bad("the second preview reads: " + again.replace(/\n/g, " | "));
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
