/**
 * The GST return, from the screen.
 *
 * In the checks company: sets the taxable activity number, opens the month
 * that is still running (the invoice check posts into it), reads the figures,
 * and downloads both statements. Each file is opened as a zip and its first
 * row compared with MIRA's own headings, because a statement the portal
 * rejects is worse than none. Records nothing in the books.
 *
 *   node tools/gst.js
 */

const { chromium } = require("playwright");
const fs = require("fs");
const zlib = require("zlib");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

/** The files inside a zip, by name, inflated. Enough to read an .xlsx back. */
function unzip(buf) {
  const out = {};
  for (let i = 0; i + 30 < buf.length && buf.readUInt32LE(i) === 0x04034b50; ) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const name = buf.toString("utf8", i + 30, i + 30 + nameLen);
    const data = buf.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + size);
    out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    i += 30 + nameLen + extra + size;
  }
  return out;
}
const firstRow = (xml) => [...(xml.match(/<row r="1">([\s\S]*?)<\/row>/)?.[1] || "").matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — the GST return\n`);
    const { page, context } = await signIn(browser, { phone: false });
    const call = (method, path, body) =>
      page.evaluate(
        async ([m, p, b]) => {
          const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
          const r = await fetch("/api" + p, { method: m, credentials: "include", headers, body: b ? JSON.stringify(b) : undefined });
          return r.json();
        },
        [method, path, body || null]
      );
    await call("POST", "/gst/settings", { activityNo: "9999999GST501", frequency: "month" });

    await page.goto(BASE + "/tax", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByTestId("gst-clock").waitFor({ timeout: 15000 });
    ok(`the page opens on the return due next: "${(await page.getByTestId("gst-clock").innerText()).trim()}"`);

    const running = new Date().toISOString().slice(0, 7);
    await page.selectOption("#gst-period", running);
    await page.getByTestId("gst-clock").filter({ hasText: /still running/ }).waitFor({ timeout: 10000 });
    const figs = (await page.getByTestId("gst-figures").innerText()).replace(/\n/g, " | ");
    const api = await call("GET", `/gst/${running}`);
    const payable = api.figures.at(-1);
    if (/Output tax/.test(figs) && figs.includes(payable.amount)) ok(`the running month shows its figures: ${payable.label} ${payable.amount}`);
    else bad("the figures read: " + figs);
    ok(`${api.problems.length} ${api.problems.length === 1 ? "thing" : "things"} would make it wrong${api.problems.length ? ": " + api.problems.map((p) => p.what).join("; ") : ""}`);
    await page.screenshot({ path: "shots/gst-return.png", fullPage: true });

    for (const [button, sheets, want] of [
      ["Input Tax Statement", ["Sheet1"], ["#", "Supplier TIN", "Supplier Name", "Supplier Invoice Number", "Invoice Date", "Invoice Total (excluding GST)", "GST Charged at 6%", "GST Charged at 8%", "GST Charged at 12%", "GST Charged at 16%", "Your Taxable Activity Number", "Revenue / Capital"]],
      ["Output Tax Statement", ["TaxInvoices", "OtherTransactions"], ["Customer TIN", "Customer Name", "Invoice No.", "Invoice Date", "Value of Supplies Subject to GST at 8% or 16% (excluding GST)", "Value of Zero-Rated Supplies", "Value of Exempt Supplies", "Value of Out-of-Scope Supplies", "Your Taxable Activity No."]],
    ]) {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: button }).click()]);
      const path = await dl.path();
      const files = unzip(fs.readFileSync(path));
      const names = [...(files["xl/workbook.xml"] || "").matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
      const head = firstRow(files["xl/worksheets/sheet1.xml"] || "");
      const rows = ((files["xl/worksheets/sheet1.xml"] || "").match(/<row /g) || []).length - 1;
      if (JSON.stringify(names) === JSON.stringify(sheets) && JSON.stringify(head) === JSON.stringify(want)) {
        ok(`${button}: ${dl.suggestedFilename()} opens, sheets ${names.join(" + ")}, MIRA's ${head.length} headings exactly, ${rows} ${rows === 1 ? "line" : "lines"}`);
      } else {
        bad(`${button}: sheets ${JSON.stringify(names)}, headings ${JSON.stringify(head)}`);
      }
    }
    void context;
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
