/** Looks at the phone board on a real phone viewport, light and dark. */
const { chromium } = require("playwright");
const BASE = process.env.SHOOT_BASE || "https://sentryfi.app";
const OUT = process.env.BOARD_OUT || require("node:os").tmpdir();
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: dark ? "dark" : "light",
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 140)));

    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.fill("input[type=email]", process.env.SHOOT_EMAIL);
    await page.fill("input[type=password]", process.env.SHOOT_PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });

    for (const route of ["/dashboard", "/bills"]) {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(1800);
      const name = `${route.slice(1)}-${dark ? "dark" : "light"}.png`;
      await page.screenshot({ path: path.join(OUT, name) });

      const audit = await page.evaluate(() => {
        const small = [];
        document.querySelectorAll("a,button,[role=button]").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.height < 44 || r.width < 44) {
            small.push(`${el.tagName}:${(el.innerText || el.ariaLabel || "?").trim().slice(0, 22)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        });
        const unnamed = [];
        document.querySelectorAll("button,a").forEach((el) => {
          const name = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
          if (!name) unnamed.push(el.outerHTML.slice(0, 60));
        });
        // One yellow field per screen.
        const yellow = [...document.querySelectorAll("*")].filter((el) => {
          const bg = getComputedStyle(el).backgroundColor;
          return bg === "rgb(242, 195, 0)";
        }).length;
        return {
          h1: document.querySelectorAll("h1").length,
          sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          small,
          unnamed,
          yellow,
        };
      });
      console.log(`${route} ${dark ? "dark " : "light"} → h1=${audit.h1} sideways=${audit.sideways} yellowFields=${audit.yellow} small=${audit.small.length} unnamed=${audit.unnamed.length}`);
      if (audit.small.length) console.log("    small: " + audit.small.join(" | "));
      if (audit.unnamed.length) console.log("    unnamed: " + audit.unnamed.join(" | "));
    }
    if (errors.length) console.log("  errors: " + [...new Set(errors)].slice(0, 4).join(" | "));
    await ctx.close();
  }
  console.log("shots in " + OUT);
  await browser.close();
})();
