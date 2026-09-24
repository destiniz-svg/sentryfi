/**
 * Emailing an invoice, live: a draft is refused, a posted one goes out as a
 * private link to the customer's page. It only ever sends to Resend's test
 * inbox, which accepts and discards, so no real person gets test mail.
 *
 *   node tools/send-invoice.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};
const SAFE = "delivered@resend.dev";
const api = (page, m, u, b) =>
  page.evaluate(
    async ([m, u, b]) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const r = await fetch("/api" + u, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    },
    [m, u, b]
  );

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    const list = (await api(page, "GET", "/sales")).json;
    const all = list.invoices || list.sales || [];
    const posted = all.find((i) => i.status === "posted" && !i.voided_at && !i.voidedAt);
    const draft = all.find((i) => i.status === "draft");
    if (draft) {
      const r = await api(page, "POST", `/sales/${draft.id}/email`, { to: SAFE });
      if (r.status >= 400 && r.status < 500) ok(`a draft is refused: ${r.json.error?.message || r.json.message || r.status}`);
      else bad(`a draft was answered ${r.status}`);
    } else ok("no draft in the check books to try (skipped)");
    if (!posted) throw new Error("No posted invoice in the check books.");

    await page.goto(`${BASE}/documents/invoice/${posted.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("share-document").click();
    const to = page.getByRole("dialog").locator("input[type=email]");
    ok(`the form opens with "${await to.inputValue()}" filled in`);
    await to.fill(SAFE);
    await page.getByRole("dialog").locator("textarea").fill("A check from Sentryfi.");
    await page.screenshot({ path: "shots/email-form.png" });
    await page.getByRole("button", { name: /^Email to/i }).click();
    await page.getByText(`sent to ${SAFE}`).first().waitFor({ timeout: 20000 });
    ok("it sends, and says where it went");
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
