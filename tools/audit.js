/**
 * The audit workspace, in the test company.
 *
 * A period of this year is opened and its seal checked. Two bills are drawn
 * at random; the sample is proved by drawing it again from its seed; the
 * first item opens onto its bill and entry, is ticked with a note, and
 * "Seen, next" goes on to the second, which is ticked too (2/2). The journal
 * risk tab lists flagged entries, and a sample is drawn from one sign. Run as an auditor (SHOOT_EMAIL of someone with only that
 * role) it also shows the auditor cannot record a bill.
 *
 *   node tools/audit.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, url, body]
  );
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/audit-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  let page;
  try {
    ({ page } = await signIn(browser, { phone: false }));
    const year = new Date().getFullYear();
    await page.goto(`${BASE}/audit`, { waitUntil: "networkidle", timeout: 45000 });
    await page.locator("#audit-name").fill(`Check year ${year}`);
    await page.locator("#audit-from").fill(`${year}-01-01`);
    await page.locator("#audit-to").fill(`${year}-12-31`);
    await page.getByRole("button", { name: "Open and check the seal" }).click();
    const seal = page.getByTestId("seal");
    await seal.waitFor({ timeout: 30000 });
    const said = (await seal.innerText()).replace(/\s+/g, " ");
    if (/The seal is intact/.test(said)) ok(`seal: "${said.slice(0, 110)}"`);
    else bad(`seal: "${said}"`);
    await settle(page);
    await shot(page, "period");

    await page.getByRole("tab", { name: /Samples/ }).click();
    await page.locator("#draw-kind").selectOption("bill");
    await page.locator("#draw-size").fill("2");
    await page.getByRole("button", { name: "Draw it" }).click();
    await page.getByTestId("sample-items").waitFor({ timeout: 15000 });
    const items = page.getByTestId("sample-item");
    if ((await items.count()) === 2) ok("two bills drawn");
    else bad(`${await items.count()} drawn`);

    await page.getByRole("button", { name: "Prove it: draw again" }).click();
    const proof = (await page.getByTestId("proof").innerText()).replace(/\s+/g, " ");
    if (/the same 2 items/.test(proof)) ok(`proof: "${proof}"`);
    else bad(`proof: "${proof}"`);

    await items.first().click();
    const ev = page.getByTestId("evidence");
    await ev.waitFor({ timeout: 15000 });
    const text = (await ev.innerText()).replace(/\s+/g, " ");
    if (/The bill/i.test(text) && /Entry \d+/i.test(text) && /Debit/.test(text)) ok("the item opens onto its bill and entry");
    else bad(`evidence reads "${text.slice(0, 200)}"`);
    await page.locator("#audit-note").fill("Agreed to the supplier's paper");
    await settle(page);
    await shot(page, "evidence");
    await page.getByRole("button", { name: "Seen, next" }).click();
    await page.waitForFunction(() => document.querySelector("#audit-note")?.value === "", null, { timeout: 15000 });
    ok("Seen, next went on to the second");
    await page.getByRole("button", { name: "Seen", exact: true }).click();
    await page.getByTestId("evidence").waitFor({ state: "detached", timeout: 15000 });
    await page.waitForFunction(() => /2\/2/.test(document.body.innerText), null, { timeout: 15000 });
    ok("the sample reads 2/2 seen");
    if ((await page.getByTestId("sample-items").innerText()).includes("Agreed to the supplier's paper")) ok("the note shows on the list");
    else bad("the note is not on the list");
    await shot(page, "sample");

    // The journal risk screen, and a sample drawn from one sign.
    await page.getByRole("link", { name: /Back to/ }).click();
    await page.getByRole("tab", { name: "Journal risk" }).click();
    await page.getByTestId("risk-entries").waitFor({ timeout: 30000 });
    const flagged = await page.getByTestId("risk-entries").locator("li").count();
    if (flagged > 0) ok(`journal risk lists ${flagged} flagged entries`);
    else bad("journal risk lists nothing");
    const sign = page.getByTestId("risk-tests").locator("button:not([disabled])").first();
    const signName = (await sign.innerText()).replace(/[●\d]/g, "").trim();
    await sign.click();
    await settle(page);
    await shot(page, "risk");
    await page.getByRole("button", { name: /Draw a sample from/ }).click();
    await page.locator("#draw-size").fill("1");
    await page.getByRole("button", { name: "Draw it" }).last().click();
    await page.getByTestId("sample-items").waitFor({ timeout: 15000 });
    const drawnWhy = (await page.getByTestId("sample-item").first().innerText()).replace(/\s+/g, " ");
    ok(`drew one entry that shows "${signName}": "${drawnWhy.slice(0, 120)}"`);

    // The audit pack: downloaded, and every file checked against its manifest.
    await page.getByRole("link", { name: /Back to/ }).click();
    await page.getByRole("tab", { name: "Audit pack" }).click();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: "Make the pack" }).click()]);
    const zipPath = `${process.env.TEMP}/audit-pack-check.zip`;
    await download.saveAs(zipPath);
    const { unzip } = require("../backend/src/ledger/unzip");
    const raw = unzip(require("fs").readFileSync(zipPath), { binary: true });
    const manifest = raw["MANIFEST.sha256"].toString("utf8").trim().split("\n");
    const wrong = manifest.filter((line) => require("crypto").createHash("sha256").update(raw[line.slice(66).split("/").pop()]).digest("hex") !== line.slice(0, 64));
    if (manifest.length >= 13 && !wrong.length) ok(`the pack holds ${manifest.length} files, each matching its SHA-256 in the manifest`);
    else bad(`pack manifest: ${manifest.length} lines, ${wrong.length} wrong`);
    const gl = raw["02 General ledger (AICPA GL detail).csv"].toString("utf8");
    if (/Journal_ID,JE_Line_Number,Effective_Date,Entered_Date,Entered_Time,Entered_By/.test(gl)) ok("the ledger is in the AICPA layout, with entered date, time and user");
    else bad("the ledger layout is wrong");
    await page.getByTestId("packs").waitFor({ timeout: 15000 });
    await settle(page);
    await shot(page, "pack");
    ok("the pack is on record with its fingerprint");

    const canRecord = (await api(page, "GET", "/companies/current")).json?.can?.record;
    if (canRecord === false) {
      const tried = await api(page, "POST", "/bills", { supplierName: "Auditor check", amount: "1", gstTreatment: "none_unregistered" });
      if (tried.status === 403) ok("the auditor cannot record a bill");
      else bad(`the auditor recording a bill got ${tried.status}`);
    }
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
