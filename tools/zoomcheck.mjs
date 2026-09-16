// Does the book stay where it lies while you pinch in on it? Start, then three pinches on the book, then pan to its bottom.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots";
await withServer(async () => {
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
const pinch = async (cx, cy, from, to, steps = 14) => {
  await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
  for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(400);
};
const pan = async (x, y, dx, dy) => {
  await touch("touchStart", [{ x, y }]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(1500);
};
const v = () => page.evaluate(() => JSON.stringify(window.__view));
await page.screenshot({ path: OUT + "/z1.png" });
await pinch(195, 560, 20, 30); console.log("z2", await v()); await page.screenshot({ path: OUT + "/z2.png" });
await pinch(195, 560, 20, 40); console.log("z3", await v()); await page.screenshot({ path: OUT + "/z3.png" });
await pinch(195, 560, 20, 50); console.log("z4", await v()); await page.screenshot({ path: OUT + "/z4.png" });
await pinch(195, 560, 20, 80); await pinch(195, 500, 20, 80); console.log("z5", await v()); await page.screenshot({ path: OUT + "/z5.png" });
await pan(200, 700, 0, -600); await pan(200, 700, 0, -600); await pan(200, 700, 0, -600); console.log("z6 (bottom)", await v()); await page.screenshot({ path: OUT + "/z6.png" });
await browser.close();
});
