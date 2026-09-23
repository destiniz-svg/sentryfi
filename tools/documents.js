/**
 * Documents, live, in the test company.
 *
 * Branding: a logo is uploaded and its colours offered; picking one and the
 * modern layout changes the paper beside the form at once; the receipt size
 * draws as a receipt. New invoice: the paper beside the form follows what is
 * typed, total included; saving opens the document, drawn the same, and the
 * draft is then discarded so the test books stay clean.
 *
 *   node tools/documents.js
 */
const path = require("path");
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const { page } = await signIn(browser, { phone: false });

    // ---- the brand kit
    await page.goto(BASE + "/branding", { waitUntil: "networkidle" });
    const preview = page.getByTestId("brand-preview");
    await preview.getByTestId("paper").waitFor({ timeout: 15000 });
    await page.getByTestId("logo-file").setInputFiles(path.join(__dirname, "..", "frontend", "public", "icon-512.png"));
    await preview.locator("img.logo").waitFor({ timeout: 10000 });
    ok("a logo uploaded shows on the paper at once");
    // The logo's own colours come first, once they have been read from it.
    await page.getByText("from your logo first").waitFor({ timeout: 10000 });
    const swatch = page.getByRole("button", { name: /^Colour #/ }).first();
    const colour = (await swatch.getAttribute("aria-label")).replace("Colour ", "");
    await swatch.click();
    // An invoice's design: the ready-made Band, in the logo's colour.
    await page.getByTestId("editing").selectOption("invoice");
    await page.getByTestId("design-modern").click();
    const band = await preview.locator(".band").evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
    if (band === `rgb(${r}, ${g}, ${b})`) ok(`the logo's colour ${colour} and the Band design reach the paper`);
    else bad(`band is ${band}, picked ${colour}`);
    // The light designs, and a QR code on the paper.
    await page.getByTestId("design-minimal").click();
    await preview.locator(".sd.minimal .qr svg").waitFor({ timeout: 5000 });
    ok("the Minimal design draws light, with a QR code to check it is genuine");
    // Changing a ready-made design keeps a copy of it; the ready-made stays.
    await page.getByRole("tab", { name: "What shows" }).click();
    await page.getByRole("button", { name: "Total in words" }).click();
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByRole("button", { name: /^Minimal, yours/ }).first().waitFor({ timeout: 5000 });
    ok("a change to a ready-made design is kept as the company's own copy");
    await page.getByRole("tab", { name: "Design" }).click();
    // The check's copies go again, so the test company's library does not grow run by run.
    const leftover = page.getByRole("button", { name: /^Delete Minimal, yours/ });
    while (await leftover.count()) await leftover.first().click();
    await page.getByTestId("design-modern").click();
    await page.getByTestId("save-brand").click();
    await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
    ok("the brand kit and templates are saved");
    await page.screenshot({ path: "shots/branding-desk.png" });
    await page.getByRole("group", { name: "Preview size" }).getByRole("button", { name: "80 mm" }).click();
    await preview.locator(".sd.receipt").waitFor({ timeout: 5000 });
    ok("the 80 mm size draws as a receipt");
    await preview.screenshot({ path: "shots/branding-receipt.png" });

    // ---- a signature drawn with a finger (not saved)
    await page.getByTestId("editing").selectOption("brand");
    await page.getByRole("tab", { name: "Signature" }).click();
    await page.getByTestId("draw-signature").click();
    const pad = page.getByLabel("Sign here");
    const box = await pad.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 90);
    await page.mouse.down();
    for (let x = 40; x < 260; x += 12) await page.mouse.move(box.x + x, box.y + 90 - Math.sin(x / 18) * 30);
    await page.mouse.up();
    await page.getByRole("button", { name: "Use this signature" }).click();
    await page.getByRole("group", { name: "Preview size" }).getByRole("button", { name: "A4" }).click();
    await preview.locator("img.sig").waitFor({ timeout: 5000 });
    ok("a signature drawn on the screen prints on the paper");

    // ---- an industry, and Dhivehi beside the English (not saved: the check leaves the kit as it was)
    await page.getByRole("tab", { name: "Industry" }).click();
    await page.getByTestId("preset-services").click();
    await preview.getByText(/^Hours/).first().waitFor({ timeout: 5000 });
    ok("a services preset relabels quantity as Hours on the paper");
    await page.getByTestId("editing").selectOption("invoice");
    await page.getByRole("tab", { name: "Wording" }).click();
    await page.getByRole("button", { name: "English and Dhivehi" }).click();
    const thaana = await preview.getByTestId("paper").innerText();
    if (/[ހ-޿]/.test(thaana) && thaana.includes("ތާރީޚު")) ok("English and Dhivehi prints the Thaana labels beside the English");
    else bad("no Thaana on the paper after choosing English and Dhivehi");
    await preview.screenshot({ path: "shots/branding-dhivehi.png" });
    page.on("dialog", (d) => d.accept());

    // ---- the customer's link draws the issued invoice
    const posted = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const list = (await fetch("/api/sales", { credentials: "include", headers }).then((r) => r.json())).invoices || [];
      return list.find((i) => i.status === "posted" && !i.voided && !i.foreign) || null;
    });
    if (!posted) bad("no posted invoice in the test company to show through a link");
    else {
      const link = await page.evaluate(async (customerId) => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
        const r = await fetch("/api/portal-links", { method: "POST", credentials: "include", headers, body: JSON.stringify({ counterpartyId: customerId }) });
        return (await r.json()).token;
      }, posted.customerId);
      const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
      await guest.goto(`${BASE}/portal/${link}`, { waitUntil: "networkidle" });
      await guest.getByRole("button", { name: new RegExp(posted.invoiceNo) }).click();
      const drawnForThem = guest.getByTestId("portal-paper").getByTestId("paper");
      await drawnForThem.waitFor({ timeout: 15000 });
      if ((await drawnForThem.textContent()).includes(posted.invoiceNo)) ok(`the customer's link draws ${posted.invoiceNo} as it was issued`);
      else bad("the customer's link did not draw the invoice");
      await guest.screenshot({ path: "shots/portal-invoice-phone.png", fullPage: true });
      await page.evaluate(async () => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
        const links = (await fetch("/api/portal-links", { credentials: "include", headers }).then((r) => r.json())).links || [];
        const last = links[0];
        if (last) await fetch(`/api/portal-links/${last.id}`, { method: "DELETE", credentials: "include", headers });
      });
    }

    // ---- a new invoice, drawn as it is filled in
    await page.goto(BASE + "/invoices/new", { waitUntil: "networkidle" });
    const paper = page.getByTestId("invoice-preview").getByTestId("paper");
    await paper.waitFor({ timeout: 15000 });
    // A name unlike any before it: a close one is filed under the existing customer, by design.
    const who = `${Array.from({ length: 7 }, () => "bcdfghjklmnpqrstvwz"[Math.floor(Math.random() * 19)]).join("")} Holdings`.replace(/^./, (c) => c.toUpperCase());
    await page.getByLabel("Who is it to?").fill(who);
    await page.getByLabel("Line 1: what it is").fill("Crane hire");
    await page.getByLabel("Line 1: quantity").fill("3");
    await page.getByLabel("Line 1: rate").fill("1,250.50");
    const text = await paper.innerText();
    if (text.includes(who) && text.includes("3,751.50") && /DRAFT/.test(text)) ok("the paper beside the form follows what is typed: customer, line and total");
    else bad(`the preview reads: ${text.slice(0, 400)}`);
    await page.screenshot({ path: "shots/invoice-new-desk.png", fullPage: true });
    await page.getByTestId("save-invoice").click();
    await page.waitForURL(/\/documents\/invoice\//, { timeout: 20000 });
    await page.getByTestId("paper").filter({ hasText: who }).first().waitFor({ timeout: 15000 }).catch(() => {});
    const drawn = await page.getByTestId("paper").first().textContent();
    if (drawn.includes(who) && drawn.includes("Crane hire")) ok("saving opens the document, drawn the same way");
    else bad(`the saved document reads: ${drawn.slice(0, 300)}`);
    await page.screenshot({ path: "shots/invoice-document.png", fullPage: true });

    // Into the books: the issued copy is kept, and its QR code's page confirms it.
    // Then credited in full, so the test books end where they started.
    const id = page.url().split("/").pop();
    const sha = await page.evaluate(async (invoiceId) => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
      const p = await fetch(`/api/sales/${invoiceId}/post`, { method: "POST", credentials: "include", headers, body: "{}" });
      if (!p.ok) return { error: (await p.json()).error?.message };
      const d = await fetch(`/api/documents/invoice/${invoiceId}`, { credentials: "include", headers }).then((r) => r.json());
      return { sha: d.issuedCopy?.sha256, number: d.data?.number };
    }, id);
    if (!sha.sha) bad(`could not put the check's invoice in the books: ${sha.error || "no issued copy"}`);
    else {
      const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
      await guest.goto(`${BASE}/v/${sha.sha}`, { waitUntil: "networkidle" });
      const said = await guest.locator("main").innerText();
      if (/Genuine/.test(said) && said.includes(sha.number)) ok(`the QR code's page confirms ${sha.number} is genuine`);
      else bad(`the check page reads: ${said.slice(0, 200)}`);
      await guest.screenshot({ path: "shots/genuine-phone.png", fullPage: true });
      await guest.goto(`${BASE}/v/${"0".repeat(64)}`, { waitUntil: "networkidle" });
      if (/No document matches/.test(await guest.locator("main").innerText())) ok("a code that matches nothing says so");
      else bad("an unknown fingerprint was not refused");
      const credited = await page.evaluate(async (invoiceId) => {
        const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company"), "Content-Type": "application/json" };
        return (await fetch(`/api/sales/${invoiceId}/credit`, { method: "POST", credentials: "include", headers, body: JSON.stringify({ reason: "documents check" }) })).ok;
      }, id);
      if (credited) ok("the check's invoice is credited back in full");
      else bad("the check's invoice could not be credited back");
    }

    // ---- an order's document, and a delivery note if it has one
    const order = await page.evaluate(async () => {
      const headers = { "X-Company-Id": localStorage.getItem("sentryfi.company") };
      const list = (await fetch("/api/orders", { credentials: "include", headers }).then((r) => r.json())).orders || [];
      return list.find((o) => o.kind === "sale" && o.delivered !== "0.00") || list[0] || null;
    });
    if (!order) bad("the test company has no orders to draw");
    else {
      await page.goto(`${BASE}/orders/${order.id}`, { waitUntil: "networkidle" });
      await page.getByTestId("order-document").click();
      await page.getByTestId("paper").first().waitFor({ timeout: 15000 });
      const t = await page.getByTestId("paper").first().innerText();
      if (t.includes(order.number) && t.includes(order.party)) ok(`order ${order.number} opens as its document`);
      else bad(`order document reads ${t.slice(0, 200)}`);
      await page.screenshot({ path: "shots/order-document.png", fullPage: true });
      await page.goto(`${BASE}/orders/${order.id}`, { waitUntil: "networkidle" });
      const dn = page.getByRole("link", { name: new RegExp(`${order.number}-D1`) });
      if (await dn.count()) {
        await dn.click();
        await page.getByTestId("paper").first().waitFor({ timeout: 15000 });
        const d = await page.getByTestId("paper").first().innerText();
        if (/Received by|RECEIVED/i.test(d) && !/Before GST/.test(d)) ok("its delivery note shows quantities, no prices, and a line to sign");
        else if (/Received from/i.test(d)) ok("its goods received note shows what arrived");
        else bad(`delivery note reads ${d.slice(0, 200)}`);
        await page.screenshot({ path: "shots/delivery-note.png", fullPage: true });
      }
    }

    // ---- on a phone
    const phone = await signIn(browser, { phone: true });
    await phone.page.goto(BASE + "/invoices/new", { waitUntil: "networkidle" });
    await phone.page.getByRole("button", { name: "preview" }).click();
    await phone.page.getByTestId("invoice-preview").getByTestId("paper").waitFor({ timeout: 15000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!wide) ok("on a phone, the preview is a tab and fits without sideways scroll");
    else bad("the invoice page scrolls sideways on a phone");
    await phone.page.screenshot({ path: "shots/invoice-new-phone.png", fullPage: true });
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
