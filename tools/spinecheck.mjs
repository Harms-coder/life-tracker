// Zoomed in, a leaf held mid-turn: the cover strip above and below the pages near the spine. node tools/spinecheck.mjs out
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL + (process.env.Q ?? "")); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  // the spine's top end in the middle of the screen, zoomed to s = 0.9
  await page.evaluate(() => { const v = window.__view; v.s = 0.9; v.x = 195 - 728 * 0.9; v.y = 200 - 0 * 0.9; window.__turnTo(1, 0); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/flat.png` });
  for (const [dir, p] of [[-1, 0.6], [1, 0.6], [-1, 0.2]]) {
    await page.evaluate(([d, p]) => window.__turnTo(d, p), [dir, p]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/turn-${dir}-${p}.png` });
    await page.evaluate(([d]) => window.__turnTo(d, 0), [dir]);
    await page.waitForTimeout(200);
  }
  await browser.close();
});
