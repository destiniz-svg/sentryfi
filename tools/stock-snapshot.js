/**
 * The owner's stock snapshot, in the test company. Names are made up.
 *
 * Ten bags come in, four are sent to a site and three arrive, one short with
 * its reason. The Stock page then shows them where they are, agrees with the
 * books, lists the shortfall under what looks wrong, and a figure opens onto
 * its moves. Desk, phone and dark phone, with nothing wider than the screen.
 *
 *   node tools/stock-snapshot.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/snapshot-${name}.png`, fullPage: false });
const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const name = `Check cement ${w}`;
    const item = (await api(page, "POST", "/stock", { name, unit: "bag" })).json?.item;
    const site = (await api(page, "POST", "/stock/places", { name: `Check site ${w}`, kind: "site" })).json;
    if (!item?.id || !site?.id) throw new Error("item or site not made");
    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `SN-${w}`, amount: "1000", gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: "10", amount: "1000" }] });
    if ((await api(page, "POST", `/bills/${bill.id}/post`)).status !== 200) throw new Error("bill not posted");
    const sent = (await api(page, "POST", `/stock/${item.id}/transfer`, { fromPlaceId: null, toPlaceId: site.id, quantity: "4", on: today() })).json;
    await api(page, "POST", `/stock/transfers/${sent.id}/arrive`, { received: "3", on: today(), reason: "One bag split" });

    await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByTestId("snapshot").waitFor({ timeout: 20000 });
    await shot(page, "desk");
    if (await page.getByRole("link", { name: "Stock", exact: true }).count()) ok("Stock is in the rail");
    else bad("no Stock in the rail");
    const agrees = await page.getByText("Agrees with the books").count();
    if (agrees) ok("the total agrees with the books");
    else bad(`the total reads ${await page.getByTestId("snapshot-total").innerText()} and does not agree`);
    const card = page.getByTestId("snapshot-place").filter({ hasText: `Check site ${w}` });
    const said = (await card.innerText()).replace(/\s+/g, " ");
    if (said.includes(name) && said.includes("3 bag") && said.includes("300.00")) ok(`the site: "${said}"`);
    else bad(`the site card reads "${said}"`);
    const wrong = (await page.getByTestId("snapshot-wrong").innerText()).replace(/\s+/g, " ");
    if (wrong.includes(`1 bag of ${name} short at Check site ${w}`) && wrong.includes("One bag split")) ok("the shortfall is under what looks wrong, with its reason");
    else bad(`what looks wrong reads "${wrong}"`);

    await card.getByRole("button", { name: new RegExp(name) }).click();
    const moves = page.getByTestId("snapshot-moves");
    await moves.waitFor({ timeout: 15000 });
    await page.waitForTimeout(700); // let the sheet finish opening
    await shot(page, "desk-moves");
    const listed = (await moves.innerText()).replace(/\s+/g, " ");
    if (/Sent · 4 bag/.test(listed) && /Counted · -1 bag/.test(listed)) ok("the figure opens onto its moves");
    else bad(`the moves read "${listed}"`);
    await page.keyboard.press("Escape");

    for (const dark of [false, true]) {
      const phone = await signIn(browser, { phone: true, dark });
      await phone.page.goto(`${BASE}/inventory`, { waitUntil: "networkidle", timeout: 45000 });
      await phone.page.getByTestId("snapshot").waitFor({ timeout: 20000 });
      await shot(phone.page, dark ? "phone-dark" : "phone");
      if (await wide(phone.page)) bad(`the ${dark ? "dark " : ""}phone scrolls sideways`);
      else ok(`the ${dark ? "dark " : ""}phone fits its screen`);
      const alert = phone.page.getByTestId("snapshot-alert");
      if (await alert.count()) {
        await alert.click();
        await phone.page.waitForTimeout(500);
        const top = await phone.page.locator("#looks-wrong").evaluate((el) => el.getBoundingClientRect().top);
        if (top < 300) ok("the alert takes you to what looks wrong");
        else bad(`what looks wrong is ${Math.round(top)}px down after the alert`);
        await shot(phone.page, dark ? "phone-dark-wrong" : "phone-wrong");
      } else bad("no alert on the phone");
    }
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
