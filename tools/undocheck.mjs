// Tap a check cell, press "Fortryd", and the cell must be back as it was; the button must go by itself.
// node tools/undocheck.mjs
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
await withServer(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const key = () => page.evaluate(() => { const m = new Date(); return JSON.parse(localStorage.getItem(`values-${m.getFullYear()}-${m.getMonth() + 1}`) || "{}")["1:loeb"] ?? null; });
  const before = await key();
  await page.evaluate(() => window.__tap(838, 214)); // day 1, "Løb"
  await page.waitForTimeout(200);
  const tapped = await key(), shown = await page.isVisible(".undo");
  await page.click(".undo"); await page.waitForTimeout(200);
  const after = await key(), gone = !(await page.isVisible(".undo"));
  await page.evaluate(() => window.__tap(838, 214)); await page.waitForTimeout(5400);
  const expired = !(await page.isVisible(".undo"));
  console.log({ before, tapped, shown, after, gone, expired }, before !== tapped && after === before && shown && gone && expired ? "OK" : "FEJL");
  await browser.close();
});
