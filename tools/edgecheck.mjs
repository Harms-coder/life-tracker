// The page stack along the near edge: tipped back (whole spread) and half zoomed in at the bottom-left corner.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL + (process.env.Q ?? "")); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const setView = (s, cx, cy) => page.evaluate(([s, cx, cy]) => { const v = window.__view; v.s = s; v.x = 195 - cx * s; v.y = 422 - cy * s; window.__turnTo(1, 0); }, [s, cx, cy]);
  await page.screenshot({ path: `${OUT}/start.png` });
  await setView(0.249, 728, 524); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/fit.png` });
  for (const s of [0.28, 0.31]) { // part way in: the book still tipped a little, the corner big on screen
    await setView(s, 80, 980); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/corner-${s}.png` });
  }
  await browser.close();
});
