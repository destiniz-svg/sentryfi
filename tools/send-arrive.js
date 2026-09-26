/**
 * Send and arrive, and use on a job, in the test company. Names are made up.
 *
 * Ten bags come in on a bill. From the desk, eight are sent to a site: they
 * show as on the way, not at the site. On a phone, the site says seven came,
 * with the reason one is short. Then two are used on the site's project and
 * department, and the job carries their cost.
 *
 *   node tools/send-arrive.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/arrive-${name}.png`, fullPage: false });

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const name = `Check cement ${w}`;
    const item = (await api(page, "POST", "/stock", { name, unit: "bag" })).json?.item;
    const project = (await api(page, "POST", "/projects", { name: `Check tower ${w}` })).json;
    const dept = (await api(page, "POST", "/dimensions", { kind: "department", name: `Check civil ${w}` })).json;
    const site = (await api(page, "POST", "/stock/places", { name: `Check site ${w}`, kind: "site", projectId: project?.id })).json;
    if (!item?.id || !project?.id || !site?.id) throw new Error("item, project or site not made");

    const bill = (await api(page, "POST", "/bills", { supplierName: `Check supplier ${w}`, billNo: `SA-${w}`, amount: "1000", gstTreatment: "none_unregistered", issueDate: today() })).json?.bill;
    if (!bill?.id) throw new Error("bill not recorded");
    await api(page, "PUT", `/bills/${bill.id}/split`, { lines: [{ kind: "stock", itemId: item.id, quantity: "10", amount: "1000" }] });
    const posted = await api(page, "POST", `/bills/${bill.id}/post`);
    if (posted.status !== 200) throw new Error(`post: ${JSON.stringify(posted.json)}`);

    // From the desk: send eight to the site.
    await page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    const row = page.getByTestId("stock-row").filter({ hasText: name });
    await row.getByRole("button", { name: "Move" }).click();
    await page.locator("#move-to").selectOption(site.id);
    await page.locator("#move-qty").fill("8");
    await page.waitForTimeout(700); // let the sheet finish opening
    await shot(page, "send");
    await page.getByRole("button", { name: "Send it" }).click();
    const card = page.getByTestId("on-the-way-card").filter({ hasText: name });
    await card.waitFor({ timeout: 20000 });
    await shot(page, "desk-on-the-way");
    const said = (await card.innerText()).replace(/\s+/g, " ");
    if (said.includes(`8 bag ${name}`) && said.includes(`Main store to Check site ${w}`)) ok(`on the way: "${said}"`);
    else bad(`the card reads "${said}"`);
    let held = (await api(page, "GET", "/stock")).json.items.find((i) => i.id === item.id);
    if (held.inTransit === "8" && !held.places?.some((p) => p.id === site.id)) ok("the eight are on the way, not yet at the site");
    else bad(`in transit ${held.inTransit}, kept at ${JSON.stringify(held.places)}`);

    // On a phone at the site: seven came, one split.
    const phone = await signIn(browser, { phone: true });
    const p = phone.page;
    await p.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    const pcard = p.getByTestId("on-the-way-card").filter({ hasText: name });
    await pcard.waitFor({ timeout: 20000 });
    await pcard.scrollIntoViewIfNeeded();
    await shot(p, "phone-on-the-way");
    const tap = await pcard.getByRole("button", { name: "It arrived" }).boundingBox();
    if (tap && tap.height >= 44) ok(`"It arrived" is ${Math.round(tap.height)}px tall`);
    else bad(`"It arrived" is ${tap && Math.round(tap.height)}px tall`);
    await pcard.getByRole("button", { name: "It arrived" }).click();
    await p.locator("#arrive-qty").fill("7");
    await p.locator("#arrive-reason").waitFor({ timeout: 5000 });
    if (await p.getByRole("button", { name: "Record what came" }).isDisabled()) ok("a shortfall waits for its reason");
    else bad("a shortfall could be recorded with no reason");
    await p.locator("#arrive-reason").fill("One bag split on the jetty");
    await p.waitForTimeout(700); // let the sheet finish opening
    await shot(p, "phone-arrive");
    await p.getByRole("button", { name: "Record what came" }).click();
    await pcard.waitFor({ state: "detached", timeout: 20000 });
    held = (await api(p, "GET", "/stock")).json.items.find((i) => i.id === item.id);
    const there = held.places?.find((x) => x.id === site.id)?.onHand;
    if (there === "7" && held.inTransit === "0" && held.onHand === "9") ok("seven at the site, one written off, nothing on the way");
    else bad(`site ${there}, in transit ${held.inTransit}, on hand ${held.onHand}`);

    // Two used on the site's project and a department.
    await p.getByTestId("stock-row").filter({ hasText: name }).getByRole("button", { name: "Use on a job" }).click();
    await p.locator("#use-from").selectOption(site.id);
    if ((await p.locator("#use-project").inputValue()) === project.id) ok("the site's project is filled in");
    else bad("the site's project was not filled in");
    await p.locator("#use-department").selectOption(dept.id);
    await p.locator("#use-qty").fill("2");
    const hint = await p.getByText(/About MVR 200\.00 at average cost/).count();
    if (hint) ok("the cost shows before it is used");
    else bad("no cost shown");
    await p.waitForTimeout(700); // let the sheet finish opening
    await shot(p, "phone-use");
    await p.getByRole("button", { name: "Use it" }).click();
    await p.locator("#use-qty").waitFor({ state: "detached", timeout: 20000 });
    const moves = (await api(p, "GET", `/stock/${item.id}/history`)).json.moves;
    const used = moves.find((m) => m.kind === "issued");
    if (used && used.value === "-200.00" && used.note.includes(`Check tower ${w}, Check civil ${w}`)) ok(`used: ${used.note}, ${used.value}`);
    else bad(`history: ${JSON.stringify(moves)}`);
    const arrived = moves.find((m) => m.kind === "moved");
    if (arrived?.note.includes("7 arrived")) ok(`history: ${arrived.note}`);
    else bad(`the move reads ${arrived?.note}`);

    const dark = await signIn(browser, { phone: true, dark: true });
    await dark.page.goto(`${BASE}/stock`, { waitUntil: "networkidle", timeout: 45000 });
    await dark.page.getByTestId("stock-row").filter({ hasText: name }).getByRole("button", { name: "Move" }).click();
    await dark.page.waitForTimeout(700); // let the sheet finish opening
    await shot(dark.page, "phone-dark-send");
    ok("dark phone captured");
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
