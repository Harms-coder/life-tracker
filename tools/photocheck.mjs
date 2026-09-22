// The start view with test pictures in every photo slot: node tools/photocheck.mjs <photos.json> screenshots/photos.png
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
import fs from "node:fs";
const photos = fs.readFileSync(process.argv[2], "utf8"), OUT = process.argv[3] ?? "screenshots/photos.png";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript((p) => { localStorage.setItem("photos-2026-9", p); localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 })); }, photos);
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT });
  await browser.close();
});
