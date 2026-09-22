/**
 * A foldable, open and shut.
 *
 * The board is drawn for one thumb at 390px. On an unfolded foldable it was
 * served across 800px of glass, so the figure, the fields and the buttons were
 * all a foot wide. This walks the same screens folded (390), unfolded (760)
 * and at a tablet width (1024), and says whether what is on screen stays the
 * size a person can use.
 *
 *   node tools/foldable.js
 */

const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const SIZES = [
  { name: "folded", width: 390, height: 844, board: true },
  { name: "unfolded", width: 760, height: 1000, board: true },
  { name: "tablet", width: 1024, height: 1000, board: false },
];
// /me is the field worker's own page and is the board at any width: whoever
// opens it is someone who only ever sees the board.
const ALWAYS_BOARD = new Set(["/me"]);
const PAGES = ["/dashboard", "/cash", "/me"];

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    console.log(`\n${BASE} — folded and unfolded\n`);
    for (const size of SIZES) {
      const { page, context } = await signIn(browser, { phone: true });
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const path of PAGES) {
        await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(800);
        const board = await page.locator(".phone-board").count();
        const wantBoard = size.board || ALWAYS_BOARD.has(path);
        if (wantBoard && !board) {
          bad(`${size.name} ${path}: the board is not there`);
          continue;
        }
        if (!wantBoard) {
          if (board) bad(`${size.name} ${path}: the phone board on a ${size.width}px screen`);
          else ok(`${size.name} ${path}: the desk register, as it should be`);
          continue;
        }
        const box = await page.locator(".phone-board").boundingBox();
        const wide = box.width > 570;
        const centred = Math.abs(box.x + box.width / 2 - size.width / 2) < 2;
        if (wide) bad(`${size.name} ${path}: the board is ${Math.round(box.width)}px wide`);
        else if (!centred) bad(`${size.name} ${path}: the board is not centred`);
        else ok(`${size.name} ${path}: ${Math.round(box.width)}px wide, centred`);
      }
      await page.goto(BASE + PAGES[0], { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `shots/fold-${size.name}.png` });
      await context.close();
    }
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
