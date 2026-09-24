// The website's product screens: the demo company's made-up books, read only.
const { chromium } = require("playwright");
const OUT = "frontend/public/site";
async function login(ctx) {
  const p = await ctx.newPage();
  await p.goto("https://sentryfi.app/login", { waitUntil: "networkidle" });
  await p.fill("input[type=email]", process.env.SHOOT_EMAIL);
  await p.fill("input[type=password]", process.env.SHOOT_PASSWORD);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45000 });
  return p;
}
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light" });
  let p = await login(phone);
  for (const [r, name] of [["/dashboard", "phone-home"], ["/money", "phone-money"]]) { await p.goto("https://sentryfi.app" + r, { waitUntil: "networkidle" }); await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/${name}.png` }); }
  const desk = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "light" });
  p = await login(desk);
  for (const [r, name] of [["/cfo", "desk-cfo"], ["/tax", "desk-tax"], ["/bank", "desk-bank"]]) { await p.goto("https://sentryfi.app" + r, { waitUntil: "networkidle" }); await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/${name}.png` }); }
  await p.goto("https://sentryfi.app/bank", { waitUntil: "networkidle" });
  await p.getByText("8 waiting to be answered").click();
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1800);
  await p.screenshot({ path: `${OUT}/desk-match.png` });
  await b.close();
})();
