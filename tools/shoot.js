/**
 * Look at the thing.
 *
 * Every screen in this project so far has been built without anyone seeing it.
 * Contrast was computed from the tokens, keyboard behaviour was read off the
 * code, and layout was hoped for. That is a poor way to build an interface,
 * and this fixes it: it drives the system Chrome that is already on the
 * machine, so nothing has to be downloaded.
 *
 *   node tools/shoot.js <url> [--out name] [--mobile] [--dark] [--full]
 *   node tools/shoot.js --routes            # the public screens, desk + phone
 *
 * Shots land in tools/shots/ which is git-ignored: they are for looking at,
 * not for keeping.
 */

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const OUT = path.resolve(__dirname, "shots");

const DESK = { width: 1440, height: 900 };
// A phone the owner might actually hold, not a designer's ideal.
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function shoot(browser, { url, name, viewport, dark, full }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    isMobile: viewport.isMobile || false,
    hasTouch: viewport.hasTouch || false,
    colorScheme: dark ? "dark" : "light",
  });
  const page = await context.newPage();

  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

  await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  // Let one authored motion moment finish rather than catching it mid-flight.
  await page.waitForTimeout(900);

  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: Boolean(full) });

  // The things a screenshot cannot tell you, measured while the page is open.
  const audit = await page.evaluate(() => {
    const out = { small: [], unlabelled: [], noAlt: 0, h1: [], overflow: null };

    for (const el of document.querySelectorAll("button, a[href], input, select, textarea")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const tag = el.tagName.toLowerCase();
      const label = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        ""
      ).trim();

      if ((r.height < 44 || r.width < 44) && tag !== "a") {
        out.small.push(`${tag}${label ? ` "${label.slice(0, 28)}"` : ""} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      if (!label && tag !== "a") {
        const id = el.id ? `#${el.id}` : "";
        out.unlabelled.push(`${tag}${id}`);
      }
    }

    for (const img of document.querySelectorAll("img")) {
      if (!img.hasAttribute("alt")) out.noAlt += 1;
    }
    for (const h of document.querySelectorAll("h1")) {
      out.h1.push((h.textContent || "").trim().slice(0, 50));
    }
    out.overflow =
      document.documentElement.scrollWidth > window.innerWidth + 1
        ? `${document.documentElement.scrollWidth}px wide in a ${window.innerWidth}px viewport`
        : null;

    return out;
  });

  await context.close();
  return { file, problems, audit };
}

function report(label, r) {
  console.log(`\n${label}`);
  console.log(`  saved ${path.relative(process.cwd(), r.file)}`);
  if (r.problems.length) r.problems.forEach((p) => console.log(`  ERROR  ${p}`));
  if (r.audit.overflow) console.log(`  SCROLLS SIDEWAYS  ${r.audit.overflow}`);
  if (r.audit.h1.length !== 1) {
    console.log(`  HEADINGS  ${r.audit.h1.length} h1: ${r.audit.h1.join(" | ") || "(none)"}`);
  } else {
    console.log(`  h1: "${r.audit.h1[0]}"`);
  }
  if (r.audit.unlabelled.length) {
    console.log(`  NO NAME (${r.audit.unlabelled.length})  ${r.audit.unlabelled.slice(0, 8).join(", ")}`);
  }
  if (r.audit.small.length) {
    console.log(`  UNDER 44px (${r.audit.small.length})  ${r.audit.small.slice(0, 6).join(" · ")}`);
  }
  if (r.audit.noAlt) console.log(`  IMAGES WITHOUT ALT  ${r.audit.noAlt}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const args = process.argv.slice(2);
  const base = process.env.SHOOT_BASE || "https://sentryfi.app";

  const browser = await chromium.launch({ channel: "chrome" });

  try {
    if (args.includes("--routes")) {
      const routes = [
        ["/", "landing"],
        ["/login", "login"],
        ["/register", "register"],
      ];
      for (const [route, name] of routes) {
        report(`DESK  ${route}`, await shoot(browser, {
          url: base + route, name: `${name}-desk`, viewport: DESK, full: true,
        }));
        report(`PHONE ${route}`, await shoot(browser, {
          url: base + route, name: `${name}-phone`, viewport: PHONE, full: true,
        }));
      }
      report("DESK  /login (dark)", await shoot(browser, {
        url: base + "/login", name: "login-desk-dark", viewport: DESK, dark: true, full: true,
      }));
    } else {
      const url = args[0]?.startsWith("http") ? args[0] : base + (args[0] || "/");
      const outIndex = args.indexOf("--out");
      const name = outIndex > -1 ? args[outIndex + 1] : "shot";
      report(url, await shoot(browser, {
        url,
        name,
        viewport: args.includes("--mobile") ? PHONE : DESK,
        dark: args.includes("--dark"),
        full: args.includes("--full"),
      }));
    }
  } finally {
    await browser.close();
  }
})();
