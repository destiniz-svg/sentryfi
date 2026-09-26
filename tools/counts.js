/**
 * Counting, blind, in the test company. Names are made up.
 *
 * 1. The owner counts the main store: nothing shows what the books say until
 *    submitted, and one bag short posts at once (within the tolerance).
 * 2. With SHOOT_COUNTER="email:password" and SHOOT_COUNTER_NAME (their name;
 *    someone in the company who does not read the books, e.g. site staff),
 *    who looks after a new site: the owner gives them a count of it;
 *    their home screen says so, they count it on the board, never seeing money,
 *    and a large shortfall waits for the owner to approve.
 * 3. A spot check does not offer the place's person in charge as its counter.
 *
 *   node tools/counts.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/counts-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700); // let a sheet or page finish arriving

async function stockIn(page, w, name, qty, amount) {
  const item = (await api(page, "POST", "/stock", { name, unit: "bag" })).json?.item;
  const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `CT-${w}-${qty}`, amount, gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
  await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: qty, amount }] });
  if ((await api(page, "POST", `/bills/${bill.id}/post`)).status !== 200) throw new Error("bill not posted");
  return item;
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const me = (await api(page, "GET", "/auth/me")).json?.user;
    const cement = await stockIn(page, w, `Check cement ${w}`, "10", "1000");

    // 1. The owner counts the main store, blind. Anything already open there is cancelled first.
    for (const c of (await api(page, "GET", "/counts")).json.counts.filter((x) => x.place === "Main store" && ["counting", "submitted"].includes(x.status))) await api(page, "POST", `/counts/${c.id}/cancel`);
    await page.goto(`${BASE}/counts`, { waitUntil: "networkidle", timeout: 45000 });
    // The limit is the company's to change; put it back after.
    await page.getByTestId("tolerance").getByRole("button", { name: "Change" }).click();
    await page.locator("#count-tolerance").fill("1000");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByTestId("tolerance").filter({ hasText: "MVR 1,000.00" }).waitFor({ timeout: 15000 });
    await shot(page, "tolerance");
    ok("the approval limit changes on the page: MVR 1,000.00");
    await api(page, "PUT", "/counts/tolerance", { amount: "500" });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("start-full").click();
    await page.locator("#count-start-place").selectOption("");
    await page.locator("#count-start-counter").selectOption(me.id);
    await settle(page);
    await shot(page, "start");
    await page.getByRole("button", { name: "Start the count" }).click();
    await page.getByTestId("counting").waitFor({ timeout: 20000 });
    await shot(page, "counting");
    const blindText = await page.getByTestId("counting").innerText();
    if (!/Books said|books say \d|MVR/.test(blindText)) ok("the counting screen shows no book figure and no money");
    else bad("the counting screen gives the books away");
    const lines = page.getByTestId("count-line");
    const n = await lines.count();
    for (let i = 0; i < n; i++) {
      const line = lines.nth(i);
      const label = await line.innerText();
      // Our cement is one short; everything else is counted as the books have it, read from the API after, so the check stays blind on screen.
      await line.locator("input").fill(label.includes(`Check cement ${w}`) ? "9" : "__BOOK__");
    }
    // Fill the others with what the books say, taken from the stock list (the check knows; the screen does not tell).
    const items = (await api(page, "GET", "/stock")).json.items;
    for (let i = 0; i < n; i++) {
      const input = lines.nth(i).locator("input");
      if ((await input.inputValue()) !== "__BOOK__") continue;
      const label = await lines.nth(i).innerText();
      const it = items.find((x) => label.startsWith(x.name));
      const main = it.places ? it.places.find((p) => p.id === null)?.onHand || "0" : it.onHand;
      await input.fill(main);
    }
    await page.getByRole("button", { name: "Submit the count" }).click();
    await page.getByTestId("count-review").waitFor({ timeout: 30000 });
    await settle(page);
    await shot(page, "review-posted");
    const row = (await page.getByTestId("review-line").filter({ hasText: `Check cement ${w}` }).innerText()).replace(/\s+/g, " ");
    if (row.includes("10 bag") && row.includes("-1") && row.includes("100.00")) ok(`one bag short, posted at once: "${row}"`);
    else bad(`the cement line reads "${row}"`);
    const held = (await api(page, "GET", "/stock")).json.items.find((i) => i.id === cement.id);
    if (held.onHand === "9") ok("the books now say 9");
    else bad(`the books say ${held.onHand}`);

    // 3. A spot check does not offer the person in charge.
    const people = (await api(page, "GET", "/counts")).json.people;
    // The person who looks after the site: SHOOT_COUNTER_NAME when a field counter is given, else anyone but me.
    const keeper = process.env.SHOOT_COUNTER_NAME ? people.find((u) => u.name === process.env.SHOOT_COUNTER_NAME) : people.find((u) => u.id !== me.id);
    if (keeper) {
      const site = (await api(page, "POST", "/stock/places", { name: `Check site ${w}`, kind: "site", inChargeId: keeper.id })).json;
      await api(page, "POST", `/stock/${cement.id}/transfer`, { fromPlaceId: null, toPlaceId: site.id, quantity: "8", on: today(), arrived: true });
      await page.goto(`${BASE}/counts`, { waitUntil: "networkidle" });
      await page.getByTestId("start-spot").click();
      await page.locator("#count-start-place").selectOption(site.id);
      const offered = await page.locator("#count-start-counter option").allInnerTexts();
      if (!offered.includes(keeper.name)) ok(`a spot check at the site does not offer ${keeper.name}, who looks after it`);
      else bad(`${keeper.name} is offered for a spot check of their own place`);
      await settle(page);
      await shot(page, "spot");
      await page.keyboard.press("Escape");

      // 2. Someone who does not read the books counts the site on their phone.
      const [email, password] = (process.env.SHOOT_COUNTER || "").split(":");
      if (email && process.env.SHOOT_COUNTER_NAME) {
        const counter = (await api(page, "GET", "/counts")).json.people.find((u) => u.id === keeper.id);
        const c = (await api(page, "POST", "/counts", { kind: "full", placeId: site.id, counterId: counter.id })).json;
        const owner = { email: process.env.SHOOT_EMAIL, password: process.env.SHOOT_PASSWORD };
        Object.assign(process.env, { SHOOT_EMAIL: email, SHOOT_PASSWORD: password });
        const them = await signIn(browser, { phone: true });
        Object.assign(process.env, { SHOOT_EMAIL: owner.email, SHOOT_PASSWORD: owner.password });
        const p = them.page;
        await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 45000 });
        const strip = p.getByTestId("count-strip");
        await strip.waitFor({ timeout: 20000 });
        ok(`their home says: ${(await strip.innerText()).replace(/\s+/g, " ")}`);
        await strip.click();
        await p.getByTestId("counting").waitFor({ timeout: 20000 });
        await p.getByTestId("count-line").first().locator("input").fill("2"); // 6 short, 600.00: beyond MVR 500
        await settle(p);
        await shot(p, "field-counting");
        if (!/MVR|\d+\.\d\d/.test(await p.locator("body").innerText())) ok("the field counter sees no money");
        else bad("money shows on the field counter's screen");
        await p.getByRole("button", { name: "Submit the count" }).click();
        await p.getByTestId("count-state").waitFor({ timeout: 20000 });
        await shot(p, "field-sent");
        ok(`they see: ${await p.getByTestId("count-state").innerText()}`);

        await page.goto(`${BASE}/counts/${c.id}`, { waitUntil: "networkidle" });
        await page.getByTestId("count-review").waitFor({ timeout: 20000 });
        await settle(page);
        await shot(page, "review-waiting");
        if (await page.getByText("Beyond tolerance").count()) ok("the shortfall waits, marked beyond tolerance");
        else bad("no beyond-tolerance mark");
        await page.getByRole("button", { name: "Approve and post" }).click();
        await page.getByText(/In the books, approved by/).waitFor({ timeout: 20000 });
        const after = (await api(page, "GET", "/stock")).json.items.find((i) => i.id === cement.id);
        if (after.places.find((x) => x.id === site.id)?.onHand === "2") ok("approved: the site now shows 2");
        else bad(`the site shows ${JSON.stringify(after.places)}`);
      } else console.log("  --   no SHOOT_COUNTER and SHOOT_COUNTER_NAME, so the field counter part is skipped");
    }

    await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle" });
    const acc = page.getByTestId("place-accuracy").first();
    if (await acc.count()) ok(`the snapshot says: ${await acc.innerText()}`);
    else bad("no count accuracy on the snapshot");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
