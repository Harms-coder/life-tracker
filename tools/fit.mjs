// One screenshot of the start view (fit) in Chrome at 3x: node tools/fit.mjs screenshots/fit.png
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2];
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT });
  await browser.close();
});
