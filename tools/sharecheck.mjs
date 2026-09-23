// "Del ... som billede" in the settings: the picture that comes out (a download here; the share sheet on a phone).
// node tools/sharecheck.mjs [photos.json] screenshots/delt.jpg
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
import fs from "node:fs";
const [photos, OUT = "screenshots/delt.jpg"] = process.argv.slice(2);
await withServer(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, acceptDownloads: true })).newPage();
  if (photos) await page.addInitScript((p) => { if (!sessionStorage.getItem("s")) { sessionStorage.setItem("s", "1"); localStorage.setItem("photos-2026-9", p); } }, fs.readFileSync(photos, "utf8"));
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(3000);
  await page.click(".hand-pick");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click(".wide-button")]);
  await dl.saveAs(OUT);
  console.log(dl.suggestedFilename(), fs.statSync(OUT).size, "bytes");
  await browser.close();
});
