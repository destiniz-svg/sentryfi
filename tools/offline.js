/**
 * Does a bill survive losing signal?
 *
 * The screenshot sweep in shoot.js cannot answer this: nothing is wrong on a
 * page that looks fine while the bill it was supposed to keep is gone. So this
 * cuts the connection the way a site does, records a bill, and then checks the
 * only thing that matters — that it turns up in the books afterwards, once,
 * with the right figure on it.
 *
 *   node tools/offline.js
 *
 * Needs SHOOT_EMAIL and SHOOT_PASSWORD. SHOOT_BASE defaults to production.
 */

const { chromium } = require("playwright");
const { signIn, putBack, BASE } = require("./session");

const AMOUNT = "13.37";
const SUPPLIER = `Offline Test ${Date.now().toString().slice(-6)}`;

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

async function main() {
  const email = process.env.SHOOT_EMAIL;
  const password = process.env.SHOOT_PASSWORD;
  if (!email || !password) throw new Error("Set SHOOT_EMAIL and SHOOT_PASSWORD.");

  const browser = await chromium.launch({ channel: "chrome" });
  // A phone, because that is where a bill is held.
  console.log(`
${BASE} — a bill through a lost connection
`);

  // Signs in and switches to the books a check is allowed to write in.
  const { page, context } = await signIn(browser);
  ok("signed in");

  await page.goto(BASE + "/bills", { waitUntil: "networkidle", timeout: 45000 });

  const before = await page.locator("text=" + SUPPLIER).count();
  if (before !== 0) bad("the test supplier already exists");

  // Cut the line. context.setOffline is what the browser itself reports to
  // navigator.onLine, so this is the same signal the app reacts to on site.
  await context.setOffline(true);
  ok("offline");

  // The phone board opens capture from the shutter; the desk register from a
  // named button. This check runs on a phone, so take whichever is there.
  const shutter = page.locator(".phone-shutter");
  if (await shutter.count()) await shutter.click();
  else await page.getByRole("button", { name: /record a bill/i }).first().click();
  await page.waitForTimeout(700);

  await page.fill("#bill-supplier", SUPPLIER);
  await page.fill("#bill-amount", AMOUNT);
  // The commit button names the money now, so it is matched by what it does
  // rather than by what it used to say.
  await page.locator("button[type=submit]").last().click();
  await page.waitForTimeout(1200);

  const strip = page.locator("text=/waiting on this phone|on this phone|sends itself when there is signal/i");
  if ((await strip.count()) > 0) ok("the bill is shown as waiting on the phone");
  else bad("nothing told the person the bill was held");

  const named = await page.locator("text=" + SUPPLIER).count();
  if (named > 0) ok("it is named, so it can be checked against the paper");
  else bad("the held bill is not named anywhere");

  // A queue that does not survive a closed tab is not a queue, so look at
  // what is actually on the disk rather than at what the screen says.
  const onDisk = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("sentryfi", 1);
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction("outbox", "readonly").objectStore("outbox").getAll();
          all.onsuccess = () =>
            resolve(
              all.result.map((r) => ({
                supplier: r.payload?.supplierName,
                amount: r.payload?.amount,
                clientRef: r.payload?.clientRef,
                ref: r.ref,
                files: (r.files || []).length,
              }))
            );
          all.onerror = () => resolve(null);
        };
      })
  );
  const held = (onDisk || []).find((r) => r.supplier === SUPPLIER);
  if (held) ok("it is on the phone's disk, so a closed tab does not lose it");
  else bad("nothing was written to disk — the queue is not durable");
  if (held && held.clientRef && held.clientRef === held.ref) {
    ok("it carries the key that stops a retry becoming a second bill");
  } else if (held) {
    bad("no idempotency key: a retry after a timeout would double the cost");
  }

  await context.setOffline(false);
  ok("back online");
  await page.waitForTimeout(6000);
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2500);

  const stillWaiting = await page
    .locator("text=/waiting on this phone|sends itself when there is signal/i")
    .count();
  if (stillWaiting === 0) ok("nothing is left waiting");
  else bad("it never sent");

  // The point of all of it: one bill, on the server, with the right figure.
  const rows = await page.locator("text=" + SUPPLIER).count();
  if (rows === 1) ok("it is on the server, once");
  else bad(`expected one bill on the server, found ${rows}`);

  const amountShown = await page.locator(`text=${AMOUNT}`).count();
  if (amountShown > 0) ok(`the figure came through: ${AMOUNT}`);
  else bad("the figure did not come through");

  // Take the test bill back out. It is a draft, so it never reached the
  // books, but it is still a row in a real set of records and it does not
  // belong there. One named bill, and only if exactly one matches.
  const cleaned = await putBack(page, SUPPLIER, "Check of the offline queue. Not a real bill.");
  console.log(`
  clean-up: ${SUPPLIER} — ${cleaned}`);

  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe bill survived\n");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
