// Looks at onboarding and the developer dashboard on the local dev server, with made-up answers from the API.
const { chromium } = require("playwright");
const OUT = process.argv[2];
const user = { id: "u1", name: "Aisha Rameez", email: "demo@sentryfi.app", platformAdmin: true, mustVerify: false };
const company = { id: "c1", name: "Coralmark Builders Pvt Ltd", baseCurrency: "MVR", gstRegistered: true, tax: { tax: "GST" }, trial: { plan: "trial", endsAt: new Date(Date.now() + 5 * 864e5).toISOString(), daysLeft: 5, ended: false } };
const now = Date.now();
const iso = (d) => new Date(now - d * 864e5).toISOString();
const platform = {
  totals: { people: 6, verified: 5, active_week: 3, no_company: 1, companies: 4, on_trial: 2, ending_soon: 1, ended: 1, paid: 0 },
  signups: Array.from({ length: 30 }, (_, i) => ({ day: new Date(now - (29 - i) * 864e5).toISOString().slice(0, 10), signups: [0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][i] })),
  companies: [
    { id: "c1", name: "Coralmark Builders Pvt Ltd", openedAt: iso(20), country: "MV", currency: "MVR", industry: "construction", gst: { registered: true, sector: "general", tin: "1099842GST501" }, registrationNo: "C-0412/2019", yearStarts: 1, trial: { plan: "developer", daysLeft: null, ended: false }, owner: { name: "Aisha Rameez", email: "demo@sentryfi.app", verified: true }, people: [{ id: "u1", name: "Aisha Rameez", email: "demo@sentryfi.app", role: "administrator", verified: true, lastSeen: iso(0.01) }], lastSeen: iso(0.01), usage: { entries: 212, bills: 44, invoices: 9, lastEntry: iso(1) } },
    { id: "c2", name: "Lagoon View Guesthouse", openedAt: iso(26), country: "MV", currency: "MVR", industry: "tourism", gst: { registered: true, sector: "tourism", tin: null }, registrationNo: null, yearStarts: 1, trial: { plan: "trial", daysLeft: 4, ended: false, endsAt: iso(-4) }, owner: { name: "Hassan Ali", email: "hassan@example.test", verified: true }, people: [{ id: "u2", name: "Hassan Ali", email: "hassan@example.test", role: "administrator", verified: true, lastSeen: iso(2) }], lastSeen: iso(2), usage: { entries: 38, bills: 12, invoices: 3, lastEntry: iso(3) } },
    { id: "c3", name: "Harbour Trading", openedAt: iso(9), country: "MV", currency: "MVR", industry: "trading", gst: { registered: false }, yearStarts: 1, trial: { plan: "trial", daysLeft: 21, ended: false, endsAt: iso(-21) }, owner: { name: "Mariyam Shafa", email: "mariyam@example.test", verified: false }, people: [], lastSeen: iso(8), usage: { entries: 0, bills: 0, invoices: 0 } },
    { id: "c4", name: "Blue Reef Services", openedAt: iso(34), country: "MV", currency: "USD", industry: "services", gst: { registered: true, sector: "general" }, yearStarts: 7, trial: { plan: "trial", daysLeft: 0, ended: true, endsAt: iso(4) }, owner: { name: "Ibrahim Naseer", email: "ibrahim@example.test", verified: true }, people: [], lastSeen: iso(12), usage: { entries: 5, bills: 2, invoices: 0 } },
  ],
  noCompany: [{ id: "u9", name: "Ali Waheed", email: "ali@example.test", signedUp: iso(3), verified: false, lastSeen: iso(3) }],
  events: [{ at: iso(1), actor: "demo@sentryfi.app", action: "set_plan", target: "Coralmark Builders Pvt Ltd", detail: { plan: "developer", reason: "Our own demo" } }],
};

async function page(b, vp, withCompany) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route("**/api/**", (route) => {
    const u = new URL(route.request().url()).pathname;
    if (!u.startsWith("/api/")) return route.continue();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (u.endsWith("/auth/me")) return json({ user });
    if (u.endsWith("/companies")) return json({ companies: withCompany ? [{ id: "c1", name: company.name, roles: ["administrator"] }] : [] });
    if (u.endsWith("/companies/current")) return json({ company, roles: ["administrator"], can: { read: true, record: true, manage_settings: true } });
    if (u.endsWith("/platform")) return json(platform);
    return json({});
  });
  return p;
}

(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  for (const [name, vp] of [["desk", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const p = await page(b, vp, false);
    await p.goto("http://localhost:5199/dashboard", { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/ob-${name}-1.png`, fullPage: name === "phone" });
    await p.fill("#ob-name", "Lagoon View Guesthouse");
    await p.getByRole("radio", { name: /Tourism/ }).click();
    await p.getByRole("button", { name: /Continue/ }).click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/ob-${name}-2.png` });
    await p.getByRole("button", { name: /Continue/ }).click();
    await p.waitForTimeout(600);
    await p.getByRole("radio", { name: /Yes, tourism/ }).click();
    await p.fill("#ob-tin", "1099");
    await p.screenshot({ path: `${OUT}/ob-${name}-3.png`, fullPage: name === "phone" });
    await p.getByRole("button", { name: /Continue/ }).click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/ob-${name}-4.png`, fullPage: name === "phone" });
    const d = await page(b, vp, true);
    await d.goto("http://localhost:5199/developer", { waitUntil: "networkidle" });
    await d.waitForTimeout(1200);
    await d.screenshot({ path: `${OUT}/dev-${name}.png`, fullPage: true });
    await d.getByText("Lagoon View Guesthouse").first().click();
    await d.waitForTimeout(700);
    await d.screenshot({ path: `${OUT}/dev-${name}-detail.png` });
  }
  await b.close();
})();
