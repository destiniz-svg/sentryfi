/**
 * Signing off an audit, and the auditor's access ending by itself, in the
 * test company.
 *
 * The auditor (SHOOT_EMAIL, holding the Auditor role) opens a small period,
 * reads the readiness list, and signs off with a note for what is unfinished;
 * the period then refuses more work, and Closing shows it audited. The owner
 * (SHOOT_ANSWERER_EMAIL) ends the auditor's access, and the auditor is shut
 * out; a new last day lets them back in (so this check can run again).
 *
 *   SHOOT_EMAIL=<auditor> SHOOT_ANSWERER_EMAIL=<owner> node tools/signoff.js
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
const shot = (page, name) => page.screenshot({ path: `${process.env.TEMP}/signoff-${name}.png`, fullPage: false });
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
    console.log("  skip needs an auditor (SHOOT_EMAIL) and an owner (SHOOT_ANSWERER_EMAIL)");
    return;
  }
  const browser = await chromium.launch({ channel: "chrome" });
  let owner;
  let auditorId;
  try {
    const auditor = (await signIn(browser, { phone: false })).page;
    owner = await as(browser, process.env.SHOOT_ANSWERER_EMAIL, process.env.SHOOT_ANSWERER_PASSWORD || process.env.SHOOT_PASSWORD);
    auditorId = (await api(auditor, "GET", "/auth/me")).json.user.id;

    const name = `Sign-off check ${Date.now()}`;
    const period = { ...(await api(auditor, "POST", "/audit", { name, from: "2019-01-01", to: "2019-12-31" })).json, name };
    await auditor.goto(`${BASE}/audit/${period.id}?tab=signoff`, { waitUntil: "networkidle", timeout: 45000 });
    await auditor.getByTestId("readiness").waitFor({ timeout: 15000 });
    const list = (await auditor.getByTestId("readiness").innerText()).replace(/\s+/g, " ");
    if (/Seal/.test(list) && /Samples/.test(list) && /Not finished/.test(list)) ok("the readiness list shows each part, unfinished ones marked");
    else bad(`readiness reads "${list.slice(0, 200)}"`);
    const button = auditor.getByRole("button", { name: /^Sign off / });
    if (await button.isDisabled()) ok("it cannot be signed with work unfinished and no note");
    else bad("sign-off was open with no note");
    await auditor.locator("#signoff-note").fill("A dormant year: nothing to sample, the seal intact.");
    await settle(auditor);
    await shot(auditor, "ready");
    await button.click();
    await auditor.getByTestId("signed").waitFor({ timeout: 15000 });
    await settle(auditor);
    await shot(auditor, "signed");
    ok("signed off, with the chain's last entry recorded");
    const draw = await api(auditor, "POST", `/audit/${period.id}/samples`, { kind: "bill", how: "random", size: 1 });
    if (draw.status >= 400 && /signed off|nothing to draw/.test(JSON.stringify(draw.json))) ok("the period refuses more work");
    else bad(`a draw after sign-off answered ${draw.status}`);

    await owner.goto(`${BASE}/closing`, { waitUntil: "networkidle", timeout: 45000 });
    const audited = await owner.getByTestId("audited").innerText();
    if (audited.includes(period.name)) ok("Closing shows the period audited");
    else bad(`Closing shows "${audited}"`);

    // The owner ends the auditor's access; the auditor is shut out; a new last day lets them back.
    await owner.goto(`${BASE}/audit`, { waitUntil: "networkidle", timeout: 45000 });
    const row = owner.getByTestId("auditor-access").locator("li").filter({ hasText: (await api(auditor, "GET", "/auth/me")).json.user.email }).first();
    await row.getByRole("button", { name: "End now" }).click();
    await row.getByText(/access ended/).waitFor({ timeout: 15000 });
    await settle(owner);
    await shot(owner, "ended");
    const shut = await api(auditor, "GET", "/audit");
    if ([403, 404].includes(shut.status) || (shut.status === 400)) ok(`the auditor is shut out (${shut.status})`);
    else bad(`after ending, the auditor got ${shut.status}`);
  } catch (e) {
    bad(e.message);
  } finally {
    if (owner && auditorId) {
      const back = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
      const r = await api(owner, "PUT", `/companies/current/people/${auditorId}/access`, { until: back });
      if (r.status === 200) ok(`a new last day (${back}) lets the auditor back in`);
      else bad(`restoring access answered ${r.status}`);
    }
    await browser.close();
  }
})();
