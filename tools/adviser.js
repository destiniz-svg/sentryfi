/**
 * The adviser, end to end, live, in the test company.
 *
 * A bill arrives with three lines read off it: diesel, boat freight and a
 * generator. "What it was for" suggests a fuel cost, a freight cost and an
 * asset, each as a question with its reason. Saved and put in the books, the
 * generator is on the asset register. The next bill from the same supplier
 * goes in with no questions, split the same way. Both are then reversed,
 * which takes the generators back off the register.
 *
 *   node tools/adviser.js
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
    const tag = Date.now() % 1000000;
    // A name no earlier run is like, so nothing has been learned about it yet.
    const supplier = `${word()} ${word()}`.replace(/^./, (c) => c.toUpperCase());
    const lines = (month) => [
      { description: `Diesel 200 ltr, ${month}`, quantity: "200", amount: "3500" },
      { description: "Boat freight Male to site", amount: "800" },
      { description: `Generator 20kVA ${tag}`, amount: "45000" },
    ];
    const first = await api(page, "POST", "/bills", { supplierName: supplier, billNo: `ADV-${tag}-1`, amount: "49300", gstTreatment: "none_unregistered", issueDate: today(), lines: lines("June") });
    if (first.status !== 201) throw new Error(`the bill was not recorded: ${JSON.stringify(first.json)}`);

    await page.goto(BASE + "/bills", { waitUntil: "networkidle", timeout: 45000 });
    const row = page.locator("div.group", { hasText: `ADV-${tag}-1` }).first();
    await row.getByRole("button", { name: /^what the bill from .* was for$/i }).click();
    const cards = page.getByTestId("split-line");
    await cards.first().waitFor({ timeout: 15000 });
    const kinds = [];
    for (let i = 0; i < 3; i++) kinds.push(await cards.nth(i).locator('[role=tab][aria-selected="true"]').innerText());
    const fuelAccount = await cards.nth(0).getByLabel("Line 1: kind of cost").locator("option:checked").innerText();
    const freightAccount = await cards.nth(1).getByLabel("Line 2: kind of cost").locator("option:checked").innerText();
    const assetKind = await cards.nth(2).getByLabel("Line 3: kind of asset").locator("option:checked").innerText();
    if (kinds.join() === "Cost,Cost,Asset" && /fuel/i.test(fuelAccount) && /freight/i.test(freightAccount) && /equipment/i.test(assetKind))
      ok(`suggested: fuel (${fuelAccount}), freight (${freightAccount}), and the generator as an asset (${assetKind})`);
    else bad(`suggested ${kinds.join(", ")} / ${fuelAccount} / ${freightAccount} / ${assetKind}`);
    const reasons = await page.getByTestId("split-because").allInnerTexts();
    if (reasons.length === 3 && reasons.every((r) => /^A suggestion\./.test(r))) ok("each is put as a question, with its reason");
    else bad(`the reasons read: ${reasons.join(" | ")}`);
    if (/every laari is accounted for/i.test(await page.getByTestId("split-rest").innerText())) ok("the lines account for the whole bill");
    else bad(`the remainder reads: ${await page.getByTestId("split-rest").innerText()}`);
    await page.screenshot({ path: "shots/adviser-asks.png" });
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByText("Saved, and remembered").waitFor({ timeout: 15000 });
    await row.getByRole("button", { name: /put in the books/i }).click();
    await page.getByText(/Entry \d+ · MVR 49,300\.00/).waitFor({ timeout: 15000 });
    ok("put in the books");

    await page.goto(BASE + "/assets", { waitUntil: "networkidle" });
    if (await page.getByText(`Generator 20kVA ${tag}`).count()) ok("the generator is on the asset register");
    else bad("the generator is not on the asset register");

    // The next bill from the same supplier: no questions.
    const partyId = (await api(page, "GET", "/bills")).json.bills.find((b) => b.id === first.json.bill.id).counterparty_id;
    const second = await api(page, "POST", "/bills", { counterpartyId: partyId, supplierName: supplier, billNo: `ADV-${tag}-2`, amount: "49300", gstTreatment: "none_unregistered", issueDate: today(), lines: lines("July") });
    const posted = await api(page, "POST", `/bills/${second.json.bill.id}/post`);
    const split = await api(page, "GET", `/bills/${second.json.bill.id}/split`);
    if (posted.status === 200 && split.json.decided && split.json.lines.map((l) => l.kind).join() === "cost,cost,asset") ok("the next bill from them went in split the same way, without asking");
    else bad(`the second bill: ${posted.status}, ${JSON.stringify(split.json?.lines?.map((l) => l.kind))}`);

    for (const b of [first, second]) {
      const r = await api(page, "POST", `/bills/${b.json.bill.id}/reverse`, { reason: "adviser check, putting it back" });
      if (r.status !== 200) bad(`reversing ${b.json.bill.bill_no}: ${JSON.stringify(r.json)}`);
    }
    const left = (await api(page, "GET", "/assets")).json.assets.filter((a) => a.name === `Generator 20kVA ${tag}`).length;
    if (left === 0) ok("both reversed, and the generators came back off the register");
    else bad(`${left} generators are still on the register after reversing`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
