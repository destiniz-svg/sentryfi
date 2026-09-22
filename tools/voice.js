/**
 * Recording a bill by voice, end to end.
 *
 * Chrome is given a fake microphone playing a WAV, so the whole path is real:
 * permission, MediaRecorder, the upload, the reader, and what comes back on
 * screen. The tone says nothing, so the reader should answer that it could not
 * make anything out — which is the honest answer and the one that must not
 * turn into invented figures.
 *
 *   node tools/voice.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { signIn, BASE } = require("./session");

const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  console.log("  FAIL " + m);
  process.exitCode = 1;
};

/** Three seconds of a quiet tone, as a WAV Chrome can play into the page. */
function tone() {
  const rate = 16000;
  const seconds = 3;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 6000), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  const file = path.join(os.tmpdir(), "sentryfi-voice.wav");
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return file;
}

(async () => {
  const wav = tone();
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  try {
    console.log(`\n${BASE} — a bill said out loud\n`);
    const { page, context } = await signIn(browser, { phone: true });
    await context.grantPermissions(["microphone"], { origin: BASE });

    let answered = null;
    page.on("response", (r) => {
      if (r.url().includes("/api/bills/listen")) answered = r.status();
    });

    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 45000 });
    await page.locator("nav[aria-label=Main] button").click(); // the shutter opens the bill sheet
    await page.getByRole("button", { name: /say it/i }).waitFor({ timeout: 15000 });
    ok("the bill sheet offers Say it, beside photographing it");

    await page.getByRole("button", { name: /say it/i }).click();
    await page.getByRole("button", { name: /stop and read it/i }).waitFor({ timeout: 10000 });
    ok("it is recording");
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /stop and read it/i }).click();

    for (let i = 0; i < 40 && answered === null; i++) await page.waitForTimeout(1000);
    if (answered === 200) ok("the recording was read by the server");
    else return bad(`the reader answered ${answered}`);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: "shots/voice-phone.png", fullPage: true });
    const amount = await page.locator("#bill-amount").inputValue();
    if (!amount) ok("a tone with no words fills nothing in: it does not invent figures");
    else bad(`a wordless recording produced an amount: ${amount}`);
  } catch (err) {
    bad(err.message);
  } finally {
    await browser.close();
  }
})();
