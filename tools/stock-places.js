/**
 * Stock places for real, live, in the test company. Names are made up.
 *
 * A site is added from the Stock page with its kind, a person in charge and
 * its project. A bill's goods are said to have come into that site, and once
 * the bill is posted the item shows its stock there.
 *
 *   node tools/stock-places.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const word = () => Array.from({ length: 6 }, () => "bcdfghjklmnpqrstvwxz"[Math.floor(Math.random() * 20)]).join("");
const today = () => new Date().toISOString().slice(0, 10);
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/places-${name}.png`, fullPage: false });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const item = (await api(page, "POST", "/stock", { name: `Check cement ${w}`, unit: "bag" })).json?.item;
    const project = (await api(page, "POST", "/projects", { name: `Check tower ${w}` })).json;
    if (!item?.id || !project?.id) throw new Error("item or project not made");

    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: "Add a place" }).click();
    await page.locator("#place-name").fill(`Check site ${w}`);
    await page.locator("#place-kind").selectOption("site");
    await page.locator("#place-person").selectOption({ index: 1 });
    await page.locator("#place-project").selectOption({ label: `Check tower ${w}` });
    await shot(page, "form");
    await page.getByRole("button", { name: "Add it" }).click();
    const chip = page.getByRole("button", { name: `Change Check site ${w}` });
    await chip.waitFor({ timeout: 20000 });
    const said = await chip.innerText();
    await shot(page, "chips");
    if (/Site/.test(said) && said.includes(`Check tower ${w}`)) ok(`the place reads "${said.replace(/\s+/g, " ")}"`);
    else bad(`the chip reads "${said}"`);
    const site = (await api(page, "GET", "/stock")).json.places.find((p) => p.name === `Check site ${w}`);
    if (site?.inChargeId) ok(`${site.inCharge} is in charge`);
    else bad("no one is in charge");

    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `PL-${w}`, amount: "500", gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
    if (!bill?.id) throw new Error("bill not recorded");
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: "5", amount: "500" }] });
    await page.goto(`${BASE}/bills`, { waitUntil: "networkidle", timeout: 45000 });
    await page.locator("div.group", { hasText: `PL-${w}` }).first().getByRole("button", { name: /^what the bill from .* was for$/i }).click();
    const into = page.getByLabel("Goods came into");
    await into.waitFor({ timeout: 15000 });
    await into.selectOption({ label: `Check site ${w}` });
    await shot(page, "bill");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await into.waitFor({ state: "detached", timeout: 15000 });
    const posted = await api(page, "POST", `/bills/${bill.id}/post`);
    if (posted.status !== 200) throw new Error(`post: ${JSON.stringify(posted.json)}`);
    const held = (await api(page, "GET", "/stock")).json.items.find((i) => i.id === item.id);
    const there = held?.places?.find((p) => p.id === site.id)?.onHand;
    if (there === "5") ok("the bill's 5 bags came into the site, not the main store");
    else bad(`the item is kept at ${JSON.stringify(held?.places)} (${held?.onHand} on hand)`);

    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: `Change Check site ${w}` }).click();
    await page.locator("#place-kind").selectOption("godown");
    if (!(await page.locator("#place-project").count())) ok("only a site asks for a project");
    else bad("a godown still asks for a project");
    await page.keyboard.press("Escape");

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    await phone.page.getByTestId("stock-places").waitFor({ timeout: 20000 });
    await shot(phone.page, "phone");
    ok("the phone shows the places");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
