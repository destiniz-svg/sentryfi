/**
 * Signing in for a check, into the books a check is allowed to write in.
 *
 * Every browser check records real bills, posts them and reverses them. They
 * used to do that in Altura's own books, which left eight test entries in the
 * journal and once left 312.00 stranded in what the company thought it owed.
 *
 * So a check signs in and then switches to a separate company before it
 * touches anything. Companies are isolated by row-level security, so this is
 * a complete test environment at no cost — but it only works if the check
 * actually uses it, which is why this is the only way in.
 *
 *   const { page, context } = await signIn(browser, { phone: true });
 *
 * Run tools/checks-company.js once to create it.
 */

const CHECKS = process.env.SHOOT_COMPANY || "Sentryfi Checks";
const BASE = process.env.SHOOT_BASE || "https://sentryfi.app";

async function signIn(browser, { phone = true, dark = false, offline = false } = {}) {
  const email = process.env.SHOOT_EMAIL;
  const password = process.env.SHOOT_PASSWORD;
  if (!email || !password) throw new Error("Set SHOOT_EMAIL and SHOOT_PASSWORD.");

  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          colorScheme: dark ? "dark" : "light",
        }
      : { viewport: { width: 1280, height: 900 }, colorScheme: dark ? "dark" : "light" }
  );

  const page = await context.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });

  // Which books this check may write in. Refused rather than guessed: writing
  // a test bill into a real company is the failure this exists to prevent.
  const companyId = await page.evaluate(async (name) => {
    const list = await fetch("/api/companies", { credentials: "include" }).then((r) => r.json());
    const match = (list.companies || []).find((c) => c.name.toUpperCase() === name.toUpperCase());
    return match ? match.id : null;
  }, CHECKS);

  if (!companyId) {
    await context.close();
    throw new Error(
      `No company called "${CHECKS}". Run: node tools/checks-company.js — ` +
        "checks never write into real books."
    );
  }

  await page.evaluate((id) => localStorage.setItem("sentryfi.company", id), companyId);
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1200);

  if (offline) await context.setOffline(true);
  return { page, context, companyId, base: BASE };
}

module.exports = { signIn, BASE, CHECKS };

/**
 * Puts a check's own bill back.
 *
 * Money that has moved comes out through a reversal, and only then can the
 * document be voided — which is what the app now enforces. A check that just
 * voided a posted bill left its expense and its payable behind, and that is
 * exactly how 312.00 ended up stranded in a real company's figures.
 *
 * Refuses unless exactly one bill matches the name, because a clean-up that
 * guesses is worse than one that does nothing.
 */
async function putBack(page, supplier, why) {
  return page.evaluate(
    async ([target, reason]) => {
      const companyId = localStorage.getItem("sentryfi.company");
      const headers = { "X-Company-Id": companyId, "Content-Type": "application/json" };
      const bills = (
        await fetch("/api/bills", { credentials: "include", headers }).then((r) => r.json())
      ).bills;
      const match = bills.filter((b) => b.supplier_name === target && !b.voided_at);
      if (match.length !== 1) return `left alone: ${match.length} matched`;
      const bill = match[0];

      const steps = [];
      if (bill.entry_id) {
        const rev = await fetch(`/api/bills/${bill.id}/reverse`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ reason }),
        });
        const body = await rev.json().catch(() => ({}));
        steps.push(rev.ok ? `reversed as entry ${body.entryNo}` : `not reversed (${rev.status})`);
        if (!rev.ok) return steps.join(", ");
      }

      const res = await fetch(`/api/bills/${bill.id}`, {
        method: "DELETE",
        credentials: "include",
        headers,
        body: JSON.stringify({ reason }),
      });
      steps.push(res.ok ? "voided" : `not voided (${res.status})`);
      return steps.join(", ");
    },
    [supplier, why]
  );
}

module.exports.putBack = putBack;
