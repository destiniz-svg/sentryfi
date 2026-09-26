/**
 * Stock worth less than it cost, in the test company. Names are made up.
 *
 * Ten bags bought at MVR 100 are written down to MVR 60 each (water damage):
 * MVR 400 to Stock written down. Then they dry out and would fetch 120: they
 * are written back up by the 400 only, to what they cost, never above it.
 *
 *   node tools/worth.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const word = () => Array.from({ length: 6 }, () => "bcdfghjklmnpqrstvwxz"[Math.floor(Math.random() * 20)]).join("");
const day = () => new Date().toISOString().slice(0, 10);
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/worth-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let page;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const w = word();
    const name = `Check plaster ${w}`;
    const item = (await api(page, "POST", "/stock", { name, unit: "bag" })).json?.item;
    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `WL-${w}`, amount: "1000", gstTreatment: "none_unregistered", issueDate: day() })).json?.bill;
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: "10", amount: "1000" }] });
    if ((await api(page, "POST", `/bills/${bill.id}/post`)).status !== 200) throw new Error("bill not posted");

    const open = async () => {
      await page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
      await page.getByTestId("stock-row").filter({ hasText: name }).getByRole("button", { name: "Worth less" }).click();
      await page.getByTestId("worth-now").waitFor({ timeout: 15000 });
    };

    // Down to 60 a bag.
    await open();
    const now = (await page.getByTestId("worth-now").innerText()).replace(/\s+/g, " ");
    if (now.includes("10 bag held at MVR 100.00 each, MVR 1,000.00 in all")) ok(`it reads "${now}"`);
    else bad(`it reads "${now}"`);
    await page.locator("#worth-unit").fill("60");
    await page.locator("#worth-reason").fill("Water damage in the store");
    const said = await page.getByTestId("worth-change").innerText();
    if (said.includes("Writes it down by MVR 400.00")) ok(`before saving: "${said}"`);
    else bad(`before saving: "${said}"`);
    await settle(page);
    await shot(page, "down");
    await page.getByRole("button", { name: "Write it down" }).click();
    await page.getByTestId("worth-now").waitFor({ state: "detached", timeout: 15000 });
    let got = (await api(page, "GET", `/stock/${item.id}/worth`)).json;
    if (got.value === "600.00" && got.writtenDown === "400.00") ok("held at 600.00, with 400.00 written down");
    else bad(`worth reads ${JSON.stringify(got)}`);

    // Recovered to 120: back up by the 400 only.
    await open();
    await page.locator("#worth-unit").fill("120");
    await page.locator("#worth-reason").fill("Dried out, sells again");
    const back = await page.getByTestId("worth-change").innerText();
    if (back.includes("back up by MVR 400.00, no further than it was written down")) ok(`before saving: "${back}"`);
    else bad(`before saving: "${back}"`);
    await settle(page);
    await shot(page, "back");
    await page.getByRole("button", { name: "Write it back up" }).click();
    await page.getByTestId("worth-now").waitFor({ state: "detached", timeout: 15000 });
    got = (await api(page, "GET", `/stock/${item.id}/worth`)).json;
    if (got.value === "1,000.00" && got.writtenDown === "0.00") ok("back at its cost of 1,000.00, nothing written down");
    else bad(`worth reads ${JSON.stringify(got)}`);
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
