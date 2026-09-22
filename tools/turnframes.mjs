// Rapid screenshots through a real turn, to catch a frame where the text is gone: node tools/turnframes.mjs screenshots/frames
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.evaluate(() => { const v = window.__view; v.s = 0.249; v.x = (390 - 1456 * 0.249) / 2; v.y = (844 - 1048 * 0.249) / 2; window.__turnTo(1, 0); });
  await page.waitForTimeout(800);
  for (const dir of [1, -1]) {
    const t0 = Date.now();
    await page.evaluate((d) => window.__turn(d), dir);
    let i = 0;
    while (Date.now() - t0 < 2200) { await page.screenshot({ path: `${OUT}/${dir > 0 ? "fwd" : "back"}-${String(i++).padStart(2, "0")}-${Date.now() - t0}ms.png`, clip: { x: 0, y: 330, width: 390, height: 260 } }); }
    await page.waitForTimeout(500);
  }
  await browser.close();
});
