/**
 * A shipment, end to end, live, in the test company, shaped like a real one:
 * steel bars in two containers bought in dollars with the ocean freight on
 * the invoice, a clearing agent who is not GST-registered, and Customs paid
 * from the bank. Names and figures are made up.
 *
 * Starts the shipment from its bill of lading, links both bills, says what
 * each line was for (the adviser suggests the bars as stock and the freight
 * and clearing lines as landing costs), puts them in the books, pays Customs,
 * shares everything by weight, and reads each bar's landed cost per ton.
 *
 *   node tools/shipments.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const word = () => Array.from({ length: 6 }, () => "bcdfghjklmnpqrstvwxz"[Math.floor(Math.random() * 20)]).join("");
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const w = word();
    const ref = `CHK-${w.toUpperCase()}`;
    const bar10 = `Check bar 10mm ${w}`;
    const bar16 = `Check bar 16mm ${w}`;
    for (const name of [bar10, bar16]) await api(page, "POST", "/stock", { name, unit: "ton" });

    // Close shipments earlier runs left open, so the adviser has one to choose.
    for (const s of (await api(page, "GET", "/shipments")).json.shipments) {
      if (s.reference.startsWith("CHK-") && !s.closed) await api(page, "PATCH", `/shipments/${s.id}`, { closed: true });
    }

    await page.goto(BASE + "/shipments", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: /new shipment/i }).click();
    await page.fill("#ship-ref", ref);
    await page.fill("#ship-desc", "Steel bars, check");
    await page.getByLabel("Container 1: number").fill("ABCU1000001");
    await page.getByLabel("Container 1: CBM").fill("20");
    await page.getByRole("button", { name: /another container/i }).click();
    await page.getByLabel("Container 2: number").fill("ABCU1000002");
    await page.getByLabel("Container 2: CBM").fill("20");
    await page.selectOption("#ship-basis", "quantity");
    await page.getByRole("button", { name: /^start it$/i }).click();
    await page.waitForURL(/\/shipments\/[0-9a-f-]+$/, { timeout: 15000 });
    const shipmentUrl = page.url();
    ok(`${ref} started, two containers, shared by weight`);

    const steel = await api(page, "POST", "/bills", {
      supplierName: `Steel ${w} Trading`, billNo: `PI-${w}`, amount: "21000", currency: "USD", fxRate: "15.42", gstTreatment: "none_unregistered", issueDate: today(),
      lines: [
        { description: `${bar10} x 5.9m`, quantity: "20", amount: "12000" },
        { description: `${bar16} x 5.9m`, quantity: "10", amount: "6000" },
        { description: "Shipping charges", amount: "3000" },
      ],
    });
    const agent = await api(page, "POST", "/bills", {
      supplierName: `Agent ${w} Clearing`, billNo: `AG-${w}`, amount: "2689.75", gstTreatment: "none_unregistered", issueDate: today(),
      lines: [
        { description: "Form set", quantity: "2", amount: "50" },
        { description: "Customs process", amount: "200" },
        { description: "Clearance and labour", amount: "1800" },
        { description: "Transport charge", amount: "600" },
        { description: "Service charge 1.5%", amount: "39.75" },
      ],
    });
    if (steel.status !== 201 || agent.status !== 201) throw new Error("the bills were not recorded");

    // Both bills onto the shipment, from its page.
    for (const b of [steel, agent]) {
      await page.goto(shipmentUrl, { waitUntil: "networkidle" });
      const pick = page.getByLabel("Link a bill to this shipment");
      const value = await pick.locator("option", { hasText: b.json.bill.bill_no }).first().getAttribute("value");
      await pick.selectOption(value);
      await page.waitForTimeout(1500);
    }
    await page.goto(shipmentUrl, { waitUntil: "networkidle" });
    if ((await page.locator("text=" + `PI-${w}`).count()) && (await page.locator("text=" + `AG-${w}`).count())) ok("both bills linked from the shipment's page");
    else bad("the bills are not listed on the shipment");

    // The supplier's bill: bars as stock, freight as a landing cost.
    await page.goto(BASE + "/bills", { waitUntil: "networkidle" });
    await page.locator("div.group", { hasText: `PI-${w}` }).first().getByRole("button", { name: /^what the bill from .* was for$/i }).click();
    let cards = page.getByTestId("split-line");
    await cards.first().waitFor({ timeout: 15000 });
    const kinds = async (count) => {
      const out = [];
      for (let i = 0; i < count; i++) out.push(await cards.nth(i).locator('[role=tab][aria-selected="true"]').innerText());
      return out.join(",");
    };
    const first = await kinds(3);
    const itemPicked = await cards.nth(1).getByLabel("Line 2: item").locator("option:checked").innerText();
    if (first === "Stock,Stock,Shipment" && itemPicked === bar16) ok("the adviser read the bars as stock, each its own size, and the freight as a landing cost");
    else bad(`the supplier's bill was read as ${first}, line 2 as ${itemPicked}`);
    await page.screenshot({ path: "shots/shipment-split.png" });
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByText("Saved, and remembered").waitFor({ timeout: 15000 });
    await page.locator("div.group", { hasText: `PI-${w}` }).first().getByRole("button", { name: /put in the books/i }).click();
    await page.getByText(/Entry \d+ · MVR 323,820\.00/).waitFor({ timeout: 15000 });

    // The agent's bill: every line a landing cost; the service charge is said by hand.
    await page.locator("div.group", { hasText: `AG-${w}` }).first().getByRole("button", { name: /^what the bill from .* was for$/i }).click();
    cards = page.getByTestId("split-line");
    await cards.first().waitFor({ timeout: 15000 });
    const agentKinds = await kinds(5);
    if (agentKinds === "Shipment,Shipment,Shipment,Shipment,Cost") ok("the clearing agent's lines were read as landing costs, the service charge as a question");
    else bad(`the agent's bill was read as ${agentKinds}`);
    await cards.nth(4).getByRole("tab", { name: "Shipment" }).click();
    await cards.nth(4).getByLabel("Line 5: shipment").selectOption({ label: ref });
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByText("Saved, and remembered").waitFor({ timeout: 15000 });
    await page.locator("div.group", { hasText: `AG-${w}` }).first().getByRole("button", { name: /put in the books/i }).click();
    await page.getByText(/Entry \d+ · MVR 2,689\.75/).waitFor({ timeout: 15000 });
    ok("both bills in the books");

    // Customs, paid from the bank.
    await page.goto(shipmentUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /paid directly/i }).click();
    await page.fill("#pay-amount", "10000");
    const bank = await page.locator("#pay-from option", { hasText: /^Bank$/ }).first().getAttribute("value");
    await page.selectOption("#pay-from", bank);
    await page.getByRole("button", { name: /^add it$/i }).click();
    await page.getByText("Added to the landing costs").waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);
    const landed = await page.getByTestId("ship-landing-costs").innerText();
    // 3,000 x 15.42 = 46,260.00 freight + 2,689.75 agent + 10,000.00 Customs.
    if (/58,949\.75/.test(landed)) ok("landing costs: freight 46,260.00 + agent 2,689.75 + Customs 10,000.00 = 58,949.75");
    else bad(`landing costs read ${landed}`);
    await page.screenshot({ path: "shots/shipment-before.png", fullPage: true });

    await page.getByRole("button", { name: /^share mvr 58,949\.75 into the goods$/i }).click();
    await page.getByText(/shared into the goods/).first().waitFor({ timeout: 15000 });
    const items = (await api(page, "GET", "/stock")).json.items;
    const v10 = items.find((i) => i.name === bar10);
    const v16 = items.find((i) => i.name === bar16);
    // By weight, 20 t and 10 t: 39,299.83 and 19,649.92 onto 185,040.00 and 92,520.00.
    if (v10.value === "224,339.83" && v16.value === "112,169.92") ok(`shared by weight: 10mm now ${v10.averageCost} a ton, 16mm ${v16.averageCost} a ton (from 9,252.00)`);
    else bad(`after sharing, 10mm is worth ${v10.value} and 16mm ${v16.value}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.screenshot({ path: "shots/shipment-after.png", fullPage: true });
    await api(page, "PATCH", `/shipments/${shipmentUrl.split("/").pop()}`, { closed: true });

    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(shipmentUrl, { waitUntil: "networkidle" });
    await phone.page.getByTestId("ship-items").waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("the shipment fits a phone, no sideways scroll");
    else bad("the shipment page scrolls sideways on a phone");
    await phone.page.screenshot({ path: "shots/shipment-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
