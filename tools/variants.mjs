import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const vals = process.argv.slice(2);
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  for (const v of vals) {
    const page = await ctx.newPage();
    await page.goto(URL + "?sh=" + v); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/sh-${v}.png`, clip: { x: 20, y: 360, width: 350, height: 200 } });
    await page.close();
  }
  await browser.close();
});
