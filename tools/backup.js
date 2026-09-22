/**
 * A real backup, from the Settings page, proven to restore.
 *
 * Signs in as an administrator, opens Settings, Backups, presses Back up now
 * and waits for the run to finish. Passes only if the run says it was stored,
 * fetched back, restored into an empty database and matched.
 *
 *   node tools/backup.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

setTimeout(() => {
  console.log("  FAIL the check did not finish within five minutes");
  process.exit(1);
}, 300000).unref?.();

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — backups\n`);
    const { page } = await signIn(browser, { phone: false });
    await page.goto(BASE + "/settings", { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("tab", { name: "Backups" }).click();
    const before = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      return (await fetch("/api/backups", { credentials: "include", headers }).then((r) => r.json())).runs[0]?.id || null;
    });
    await page.getByRole("button", { name: /back up now/i }).click();

    let run = null;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(4000);
      const data = await page.evaluate(async () => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
        return fetch("/api/backups", { credentials: "include", headers }).then((r) => r.json());
      });
      run = data.runs[0];
      if (run && run.id !== before && run.finished_at) break;
    }
    if (!run || run.id === before || !run.finished_at) return bad("the backup did not finish");
    if (run.ok) ok(`stored, fetched back, restored and matched: ${run.companies} companies, ${run.entries} entries, ${run.bytes} bytes`);
    else bad(`the backup failed: ${run.problem}`);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Backups" }).click();
    await page.getByTestId("backup-status").waitFor({ timeout: 10000 });
    await page.screenshot({ path: "shots/backups-desk.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
