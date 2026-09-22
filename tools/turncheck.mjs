// The leaf mid-turn, held at a few angles, plus a real turn end to end: node tools/turncheck.mjs screenshots/turn
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const Q = process.env.Q ?? "";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  await page.goto(URL + Q); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/0-start.png` });
  // two views: the start (the whole photo) and the spread filling the screen, tipped back
  for (const [name, s] of [["start", 0], ["fit", 0.249]]) {
    if (s) { await page.evaluate((s) => { const v = window.__view; v.s = s; v.x = (390 - 1456 * s) / 2; v.y = (844 - 1048 * s) / 2; window.__turnTo(1, 0); }, s); await page.waitForTimeout(600); }
    for (const p of [0.15, 0.4, 0.6, 0.85]) {
      await page.evaluate((p) => window.__turnTo(1, p), p);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${name}-fwd-${p}.png` });
    }
    await page.evaluate(() => window.__turnTo(1, 0));
    await page.waitForTimeout(300);
  }
  // a real turn forward, then back
  await page.evaluate(() => window.__turn(1));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/1-after-forward.png` });
  for (const p of [0.3, 0.68]) {
    await page.evaluate((p) => window.__turnTo(-1, p), p);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/back-${p}.png` });
  }
  await page.evaluate(() => window.__turnTo(-1, 0));
  await page.evaluate(() => window.__turn(-1));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/2-after-back.png` });
  await browser.close();
});
