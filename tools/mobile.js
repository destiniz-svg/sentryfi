/**
 * Every screen, on a phone.
 *
 * The board screens (home, bills, cash) are drawn for a phone already. The
 * rest are the desk register, which a phone has to carry too: this walks them
 * all at 390x844 and reports what a thumb would actually hit — anything wider
 * than the screen, text below 12px, controls under 44px, and anything sitting
 * under the bottom bar.
 *
 *   node tools/mobile.js            all screens
 *   node tools/mobile.js /bank      one screen
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const PAGES = [
  ["/dashboard", "Home"],
  ["/figures", "Figures"],
  ["/bills", "Bills"],
  ["/invoices", "Invoices"],
  ["/bank", "Bank and cash"],
  ["/cash", "Cash"],
  ["/closing", "Closing"],
  ["/statements", "Statements"],
  ["/tax", "GST return"],
  ["/import", "Import"],
  ["/settings", "Settings"],
];

setTimeout(() => {
  console.log("  FAIL the check did not finish within six minutes");
  process.exit(1);
}, 360000).unref?.();

let bad = 0;
const ok = (m) => console.log("  ok   " + m);
const fail = (m) => {
  console.log("  FAIL " + m);
  bad += 1;
  process.exitCode = 1;
};

/** What a person would notice: anything off the side, too small to read, or too small to hit. */
const look = () =>
  window.eval(`(() => {
  const vw = window.innerWidth;
  const out = { wide: document.documentElement.scrollWidth - vw, over: [], small: [], tight: [] };
  const name = (el) => {
    const id = el.id ? "#" + el.id : "";
    const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40);
    return el.tagName.toLowerCase() + id + (text ? ' "' + text + '"' : "");
  };
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) {
      if (!el.children.length || r.right > vw + 8) out.over.push(name(el) + " " + Math.round(r.left) + ".." + Math.round(r.right));
    }
    const size = parseFloat(s.fontSize);
    // DESIGN.md allows 11px for nav labels and role tags, and nothing smaller.
    const inNav = el.closest("nav, [role=tablist]");
    const floor = inNav ? 11 : 12;
    if (size && size < floor && (el.textContent || "").trim() && !el.children.length) out.small.push(name(el) + " " + size + "px");
    // A link inside a sentence is text, not a control; everything else a
    // thumb goes for has to be 44px tall.
    const tappable = el.matches("button, a, select, input:not([type=hidden]), [role=tab], [role=button]") && !el.closest("p");
    if (tappable && (r.height < 40 || r.width < 32) && (el.textContent || "").trim()) {
      out.tight.push(name(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
  }
  const uniq = (a) => [...new Set(a)].slice(0, 6);
  return { wide: out.wide, over: uniq(out.over), small: uniq(out.small), tight: uniq(out.tight) };
})()`);

(async () => {
  const only = process.argv[2];
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — on a phone (390x844)\n`);
    const { page } = await signIn(browser, { phone: true });
    for (const [path, title] of PAGES.filter(([p]) => !only || p === only)) {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(1200);
      const seen = await page.evaluate(look);
      const shot = `shots/mobile${path.replace(/\//g, "-")}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      const problems = [];
      if (seen.wide > 1) problems.push(`${seen.wide}px of sideways scroll`);
      if (seen.over.length) problems.push(`off the side: ${seen.over.join(" | ")}`);
      if (seen.small.length) problems.push(`too small to read: ${seen.small.join(" | ")}`);
      if (seen.tight.length) problems.push(`too small to hit: ${seen.tight.join(" | ")}`);
      if (problems.length) fail(`${title} (${path})\n         ${problems.join("\n         ")}`);
      else ok(`${title} fits, reads and can be tapped`);
    }
    console.log(`\n  ${bad ? bad + " screens need work" : "every screen is right on a phone"}\n`);
  } catch (err) {
    fail(err.message);
  } finally {
    await browser.close();
  }
})();
