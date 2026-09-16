// Screenshots of the canvas book: fit view, zoomed on the right page, panned to the left page.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots";
await withServer(async () => {
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL); await page.waitForSelector(".viewport");
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + "/1-opslag.png" });
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
const pinch = async (cx, cy, from, to, steps = 14) => {
  await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
  for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(400);
};
const pan = async (dx, dy) => {
  await touch("touchStart", [{ x: 200, y: 500 }]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: 200 + (dx * i) / 10, y: 500 + (dy * i) / 10 }]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(1500);
};
await pinch(215, 470, 10, 60);   // zoom in on the right page (tilt goes away)
await pinch(215, 470, 10, 40);
await page.screenshot({ path: OUT + "/2-top.png" });
await pan(330, 260);             // over to the left page (title + goals)
await page.screenshot({ path: OUT + "/3-bund.png" });
await browser.close();
});
