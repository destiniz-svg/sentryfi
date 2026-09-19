/**
 * The home-screen icons, rendered from the mark that is already in the repo.
 *
 * Kept as a script rather than as two binary files somebody has to remember to
 * regenerate: the mark is the source, and these follow it.
 *
 *   node tools/icons.js
 *
 * A maskable icon is the same mark on a full-bleed yellow ground, because
 * Android crops to whatever shape the launcher uses and a transparent corner
 * comes out as a white notch.
 */

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", "frontend", "public");
const MARK = fs.readFileSync(path.join(OUT, "favicon.svg"), "utf8");

// On the register's own ground, not on ink: the mark's ring and rules are ink,
// so an ink ground swallows them and the lens comes out as a cut disc. Scaled
// to 62% so a launcher's circular crop never reaches the ring.
const page = (size) => `<!doctype html><html><head><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;}
  body{display:grid;place-items:center;background:#F4F5F6;}
  svg{width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;}
</style></head><body>${MARK}</body></html>`;

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const size of [192, 512]) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(page(size));
    await p.screenshot({ path: path.join(OUT, `icon-${size}.png`) });
    await p.close();
    console.log(`icon-${size}.png`);
  }
  await browser.close();
})();
