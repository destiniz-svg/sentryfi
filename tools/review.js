/**
 * Does the review behave like a review?
 *
 * Two rules from DESIGN.md, neither of which a screenshot can check:
 *
 *   Yellow Follows The Risk — the one yellow field lands on whatever is most
 *   uncertain about the money, and moves to the button that commits when
 *   nothing is. Two yellow fields is a defect, not emphasis.
 *
 *   The Review Only Asks What It Doubts — a field the reader was sure of
 *   arrives checked. A field that is always unchecked teaches somebody to
 *   clear it without reading, which is worse than no review at all.
 *
 * It drives the real sheet on a phone and reads the computed styles, because
 * "the yellow is on the amount" is a fact about the rendered page and nothing
 * else can confirm it.
 *
 *   node tools/review.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

const YELLOW = "rgb(242, 195, 0)";

let browser;
setTimeout(() => {
  console.log("  FAIL the check did not finish within three minutes");
  process.exit(1);
}, 180000).unref?.();

(async () => {
  browser = await chromium.launch({ channel: "chrome" });
  console.log(`\n${BASE} — what the review asks about\n`);
  const { page } = await signIn(browser);

  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.locator(".phone-shutter").click();
  await page.waitForTimeout(900);

  // Nothing read, nothing doubted: the yellow belongs on the commitment, and
  // it says what is missing rather than a verb.
  const fresh = await yellowNow(page);
  if (fresh.length === 1 && fresh[0].tag === "BUTTON") {
    ok("with nothing in doubt, the commitment carries the yellow");
  } else {
    bad(`expected the yellow on the commit button, found: ${describe(fresh)}`);
  }

  const asks = await page.locator("button[type=submit]").last().innerText();
  if (/who is it from/i.test(asks)) ok(`and it names what is missing: "${asks.trim()}"`);
  else bad(`the commitment says "${asks.trim()}" rather than naming the blocker`);

  await page.fill("#bill-supplier", "Lily Enterprises");
  await page.fill("#bill-amount", "4250.50");
  await page.waitForTimeout(400);

  const ready = await page.locator("button[type=submit]").last().innerText();
  if (/record mvr 4,250\.50/i.test(ready)) ok(`the commitment names the money: "${ready.trim()}"`);
  else bad(`the commitment reads "${ready.trim()}"`);

  const filled = await yellowNow(page);
  if (filled.length === 1) ok("still exactly one yellow field");
  else bad(`${filled.length} yellow fields: ${describe(filled)}`);

  // Every field says whether it was read or typed. Nothing was read here, so
  // nothing should claim to have been.
  const claims = await page.locator("text=/read off the bill/i").count();
  if (claims === 0) ok("nothing typed by hand claims to have been read off the bill");
  else bad(`${claims} fields claim to have been read when nothing was`);

  // And a field that is in doubt is reachable and editable, not merely loud.
  const amountEditable = await page.evaluate(() => {
    const el = document.querySelector("#bill-amount");
    return el ? !el.disabled && !el.readOnly : false;
  });
  if (amountEditable) ok("the field at risk can still be corrected");
  else bad("the field at risk cannot be edited");

  // ---- and now the half that matters -----------------------------------
  //
  // The yellow moving onto a doubtful field needs a reading the model was
  // unsure about, which is not something to obtain by photographing a blurry
  // bill and hoping. The reader's answer is served to the sheet directly, so
  // the rule is checked rather than the model.
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1200);

  await page.route("**/api/bills/scan", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        read: {
          supplierName: "Island Zone Construction",
          grossAmount: "4250.00",
          billNo: "244",
          issueDate: "2026-08-30",
          gstTreatment: "unknown",
        },
        questions: [
          {
            field: "gstTreatment",
            asks: "How was the GST quoted on this bill?",
            because: "It could not be read from the paper, and guessing it would be an 8% error.",
          },
        ],
        supplier: null,
      }),
    })
  );

  await page.locator(".phone-shutter").click();
  await page.waitForTimeout(900);

  // A one-pixel file is enough: nothing reads it, the route answers instead.
  await page.setInputFiles('input[type=file][accept*="pdf"]', {
    name: "bill.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await page.waitForTimeout(3500);

  const doubted = await yellowNow(page);
  if (doubted.length === 1) ok("with something in doubt, there is still exactly one yellow field");
  else bad(`${doubted.length} yellow fields: ${describe(doubted)}`);

  if (doubted.length === 1 && /gst/i.test(doubted[0].about)) {
    ok(`and it is on the tax, which is what was doubted - set to "${doubted[0].text}"`);
  } else {
    bad("the yellow is not on the field the reader doubted: " + describe(doubted));
  }

  const commitYellow = await page
    .locator("button[type=submit]")
    .last()
    .evaluate((el, yellow) => getComputedStyle(el).backgroundColor === yellow, YELLOW);
  if (!commitYellow) ok("the commitment gives up its yellow while a doubt holds it");
  else bad("both the doubt and the commitment are yellow");

  const read = await page.locator("text=/read off the bill/i").count();
  if (read > 0) ok(`${read} fields say they were read off the bill`);
  else bad("nothing was marked as read, so every field looks equally doubtful");

  const taxLegend = await page
    .locator("legend", { hasText: /how was the gst quoted/i })
    .innerText()
    .catch(() => "");
  if (!/read off the bill/i.test(taxLegend)) ok("and the doubted one does not claim to have been read");
  else bad("the field in doubt also claims to have been read off the bill");


  await browser.close();
  console.log(process.exitCode ? "\nsomething is wrong\n" : "\nthe review asks the right question\n");
})().catch(async (e) => {
  console.error(e.message);
  if (browser) await browser.close();
  process.exit(1);
});

/**
 * Every yellow field on screen, excluding the two DESIGN.md exempts by name:
 * the shutter, which is persistent chrome, and a graduated bar's fill, which
 * is data rather than emphasis.
 */
async function yellowNow(page) {
  return page.evaluate((yellow) => {
    return [...document.querySelectorAll(".phone-sheet *, .phone-sheet")]
      .filter((el) => getComputedStyle(el).backgroundColor === yellow)
      .filter((el) => !el.closest(".phone-shutter") && !el.classList.contains("phone-bar-fill"))
      .map((el) => {
        // Which question the yellow belongs to, rather than what it happens
        // to say. The tax chooser's set option can read "I am not sure",
        // which is that chooser being exactly right, and a check that matched
        // on wording failed it for that.
        const group = el.closest("fieldset");
        const legend = group && group.querySelector("legend");
        const labelled = el.id
          ? document.querySelector(`label[for="${el.id}"]`)
          : null;
        const first = (node) => (node ? node.innerText.trim().split(/\r?\n/)[0] : null);

        return {
          tag: el.tagName,
          id: el.id || null,
          about: first(legend) || first(labelled) || el.id || el.tagName,
          text: (el.innerText || "").trim().split(/\r?\n/)[0].slice(0, 40),
        };
      });
  }, YELLOW);
}

function describe(list) {
  if (!list.length) return "nothing";
  return list.map((y) => `${y.about} → "${y.text}"`).join(" | ");
}
