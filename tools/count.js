/**
 * The auditor at the year-end count (ISA 501), in the test company.
 *
 * The company (SHOOT_ANSWERER_EMAIL) starts a full count at the main store,
 * or uses the one open there; the auditor (SHOOT_EMAIL, holding the Auditor
 * role) opens a period ending today, attends the count (the cut-off is
 * captured), counts the picked sheet items, one of them one short of the
 * books, and adds an item seen on the floor. The company counts blind and
 * submits. The auditor then sees each test against the count, the summary,
 * and concludes; the company sees only that the count was attended.
 *
 *   SHOOT_EMAIL=<auditor> SHOOT_ANSWERER_EMAIL=<owner> node tools/count.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/count-${name}.png`, fullPage: false });
const settle = (page) => page.waitForTimeout(700);
const as = async (browser, email, password) => {
  const was = [process.env.SHOOT_EMAIL, process.env.SHOOT_PASSWORD];
  process.env.SHOOT_EMAIL = email;
  process.env.SHOOT_PASSWORD = password;
  try {
    return (await signIn(browser, { phone: false })).page;
  } finally {
    [process.env.SHOOT_EMAIL, process.env.SHOOT_PASSWORD] = was;
  }
};

(async () => {
  if (!process.env.SHOOT_ANSWERER_EMAIL) {
    console.log("  skip needs an auditor (SHOOT_EMAIL) and someone in the company (SHOOT_ANSWERER_EMAIL)");
    return;
  }
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const auditor = (await signIn(browser, { phone: false })).page;
    const company = await as(browser, process.env.SHOOT_ANSWERER_EMAIL, process.env.SHOOT_ANSWERER_PASSWORD || process.env.SHOOT_PASSWORD);
    const me = (await api(company, "GET", "/auth/me")).json.user;
    const listed = (await api(company, "GET", "/counts")).json.counts;
    let countId = listed.find((c) => c.status === "counting" && c.place === "Main store" && c.counterId === me.id)?.id;
    if (!countId) {
      const made = await api(company, "POST", "/counts", { kind: "full", placeId: null, counterId: me.id, note: "Year-end count, check" });
      if (made.status !== 201) throw new Error(`count not started: ${JSON.stringify(made.json)}`);
      countId = made.json.id || made.json.count?.id;
    }
    ok("the company's count is open at the main store");

    const today = new Date().toISOString().slice(0, 10);
    const period = (await api(auditor, "POST", "/audit", { name: `Count check ${Date.now()}`, from: `${today.slice(0, 4)}-01-01`, to: today })).json;
    await auditor.goto(`${BASE}/audit/${period.id}?tab=count`, { waitUntil: "networkidle", timeout: 45000 });
    const row = auditor.getByTestId("counts-near").locator("li").filter({ hasText: "Main store" }).first();
    await row.getByRole("button", { name: /Attend this count|Open/ }).click();
    await auditor.getByTestId("observation").waitFor({ timeout: 15000 });
    ok("the auditor attends; the cut-off is captured on arrival");

    // Count the picked items: the first one short of the books, the rest as the books say.
    const view = await api(auditor, "GET", `/audit/observations/${new URL(auditor.url()).searchParams.get("obs")}`);
    const obs = view.json;
    const books = Object.fromEntries((await api(company, "GET", "/stock")).json.items.map((i) => [i.id, Number(i.onHand)]));
    const sheet = obs.tests.filter((t) => t.direction === "sheet_to_floor");
    if (!sheet.length) throw new Error("no items were picked from the sheet");
    for (const [i, t] of sheet.entries()) {
      const want = String(Math.max(0, (books[t.itemId] || 0) - (i === 0 ? 1 : 0)));
      const r = auditor.getByTestId("test-count").filter({ hasText: t.name }).first();
      await r.getByLabel(`Counted: ${t.name}`).fill(want);
      await r.getByRole("button", { name: "Keep" }).click();
      await auditor.waitForTimeout(500);
    }
    ok(`the auditor counts ${sheet.length} picked item(s) from the sheet`);
    await settle(auditor);
    await shot(auditor, "tests");

    // The company counts blind: every line as the books say, and submits.
    const counting = (await api(company, "GET", `/counts/${countId}`)).json;
    const lines = counting.lines || counting.count?.lines || [];
    if (lines.some((l) => l.book !== undefined)) bad("the counter can see the books while counting");
    for (const l of lines) await api(company, "POST", `/counts/${countId}/lines/${l.itemId}`, { counted: String(books[l.itemId] || 0) });
    const sub = await api(company, "POST", `/counts/${countId}/submit`);
    if (sub.status !== 200) throw new Error(`count not submitted: ${JSON.stringify(sub.json)}`);
    ok("the company counts blind and submits");

    await auditor.reload({ waitUntil: "networkidle" });
    const summary = await auditor.getByTestId("count-summary").innerText();
    if (/1 with a finding/.test(summary)) ok(`the auditor sees: "${summary}"`);
    else bad(`the summary reads "${summary}"`);
    const first = await auditor.getByTestId("test-count").filter({ hasText: sheet[0].name }).first().innerText();
    if (/Count differs/.test(first) && /overcounted by 1/.test(first)) ok("the first item shows the count one over the auditor's own");
    else bad(`the first test reads "${first.replace(/\s+/g, " ")}"`);
    await auditor.locator("#obs-instructions").fill("Clear instructions; counted items tagged; damaged goods set apart.");
    await auditor.locator("#obs-conclusion").fill("One overcount found on a high-value item; extend testing at that place.");
    await auditor.getByRole("button", { name: "Conclude the count" }).click();
    await auditor.getByText(/Concluded .* stand as they are/).waitFor({ timeout: 15000 });
    await settle(auditor);
    await shot(auditor, "concluded");
    ok("the auditor concludes");

    await company.goto(`${BASE}/audit/${period.id}?tab=count`, { waitUntil: "networkidle", timeout: 45000 });
    const theirs = await company.getByTestId("attended").innerText();
    if (/attended the count at Main store/.test(theirs) && !/overcount/.test(await company.locator("main").innerText())) ok("the company sees only that the count was attended");
    else bad(`the company sees "${theirs}"`);
    const raw = await api(company, "GET", `/audit/observations/${obs.id}`);
    if (raw.status === 403) ok("and cannot open the auditor's test counts");
    else bad(`the company opening the test counts got ${raw.status}`);
  } catch (e) {
    bad(e.message);
  } finally {
    await browser.close();
  }
})();
