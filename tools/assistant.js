/**
 * An assistant's key, live, in the test company: made in Settings, shown once;
 * from outside any browser it reads the books, makes a draft in the person's
 * name, is refused putting it in the books, works the same over MCP; turned
 * off, it stops at once. The check's draft is discarded after.
 *
 *   node tools/assistant.js
 */
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/settings?tab=assistant", { waitUntil: "networkidle" });
    await page.getByPlaceholder("Claude on my laptop").fill(`Check ${Date.now() % 100000}`);
    await page.getByRole("button", { name: "Read and draft" }).click();
    await page.getByRole("button", { name: /make a key/i }).click();
    const shown = page.getByTestId("new-key");
    await shown.waitFor({ timeout: 10000 });
    const token = (await shown.locator("pre").first().innerText()).trim();
    if (/^sfk_/.test(token)) ok("a key is made in Settings and shown once, with the MCP settings beside it");
    else bad(`the key reads ${token.slice(0, 20)}`);
    await page.screenshot({ path: "shots/assistant-desk.png", fullPage: true });

    const api = (method, path, body) =>
      fetch(`${BASE}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

    const bills = await api("GET", "/bills");
    if (bills.status === 200 && Array.isArray(bills.json.bills)) ok(`from outside any browser, it reads the books: ${bills.json.bills.length} bills`);
    else bad(`reading bills gave ${bills.status}`);
    const draft = await api("POST", "/bills", { supplierName: "Drafted by the check's assistant", amount: "12.00", gstTreatment: "none_unregistered" });
    if (draft.status === 201) ok("it makes a draft bill in the person's name");
    else bad(`drafting gave ${draft.status} ${JSON.stringify(draft.json).slice(0, 120)}`);
    const post = await api("POST", `/bills/${draft.json?.bill?.id}/post`);
    if (post.status === 403) ok(`and is refused putting it in the books: "${post.json.error.message}"`);
    else bad(`posting gave ${post.status}`);

    const rpc = (method, params) => api("POST", "/mcp", { jsonrpc: "2.0", id: 1, method, params });
    const tools = await rpc("tools/list");
    const fig = await rpc("tools/call", { name: "figures", arguments: {} });
    if (tools.json?.result?.tools?.length > 10 && fig.json?.result?.isError === false) ok(`over MCP: ${tools.json.result.tools.length} tools, and figures read through the same door`);
    else bad(`MCP gave ${JSON.stringify(fig.json).slice(0, 160)}`);

    // Tidy: the draft goes, then the key is turned off from Settings.
    await page.evaluate(async (id) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      await fetch(`/api/bills/${id}`, { method: "DELETE", credentials: "include", headers, body: JSON.stringify({ reason: "assistant check" }) });
    }, draft.json?.bill?.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: /turn off check/i }).first().click();
    await page.waitForTimeout(1500);
    const after = await api("GET", "/bills");
    if (after.status === 401) ok("turned off in Settings, it is refused at once");
    else bad(`after turning off, reading gave ${after.status}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
