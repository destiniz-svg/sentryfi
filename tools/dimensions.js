/**
 * Dimensions, in the browser, against the live test company.
 *
 * Switches branches on in Settings, Tracking (once), records and posts a bill
 * for one branch through the API the bill sheet uses, then reads the split on
 * Statements. The bill sheet itself must offer the branch too.
 *
 *   node tools/dimensions.js
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
    const branch = "Check branch";

    await page.goto(BASE + "/settings?tab=tracking", { waitUntil: "networkidle", timeout: 45000 });
    await page.locator("#track-branch").waitFor({ timeout: 15000 });
    if (!(await page.getByText(branch, { exact: true }).count())) {
      await page.fill("#track-branch", branch);
      await page.locator("form", { has: page.locator("#track-branch") }).getByRole("button", { name: /add/i }).click();
      await page.getByText(branch, { exact: true }).waitFor({ timeout: 10000 });
    }
    ok(`branches are on: "${branch}" is one`);

    const posted = await page.evaluate(async (name) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const tags = await fetch("/api/dimensions", { credentials: "include", headers }).then((r) => r.json());
      const id = tags.values.find((v) => v.kind === "branch" && v.name === name)?.id;
      const made = await fetch("/api/bills", {
        method: "POST", credentials: "include", headers,
        body: JSON.stringify({ supplierName: "Dimension check supplier", amount: "123.45", gstTreatment: "none_unregistered", issueDate: new Date().toISOString().slice(0, 10), dimensionIds: [id] }),
      }).then((r) => r.json());
      const put = await fetch(`/api/bills/${made.bill.id}/post`, { method: "POST", credentials: "include", headers });
      return put.status;
    }, branch);
    if (posted === 200) ok("a bill for that branch is in the books");
    else bad(`posting the tagged bill answered ${posted}`);

    await page.goto(BASE + "/statements", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /profit and loss/i }).click();
    const split = page.getByTestId("split");
    await split.waitFor({ timeout: 15000 });
    const text = await split.innerText();
    if (text.includes(branch) && /Not tagged/.test(text)) ok("profit splits by branch, with what is untagged as its own row");
    else bad(`the split reads: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    await split.screenshot({ path: "shots/profit-by-branch.png" });

    await page.goto(BASE + "/bills", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /record a bill/i }).first().click();
    if (await page.locator("#tag-branch").count()) ok("the bill sheet asks which branch");
    else bad("the bill sheet does not offer a branch");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
