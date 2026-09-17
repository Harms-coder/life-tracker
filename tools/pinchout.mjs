// Zoom in on the right page, then pinch OUT (flat) and screenshot mid-pinch and after release.
import { chromium } from "playwright";
const URL = "http://localhost:5173/life-tracker/?maal";
const out = process.argv[2] ?? "screenshots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
const pinch = async (cx, cy, from, to, steps = 20) => {
  await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
  for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(33); }
};
const meter = () => page.evaluate(() => document.querySelector(".meter")?.textContent + " " + JSON.stringify(window.__view));
// zoom in on the right page
for (const to of [60, 90, 110]) { await pinch(280, 500, 20, to); await touch("touchEnd", []); await page.waitForTimeout(500); }
console.log("ind:", await meter());
await page.screenshot({ path: `${out}/po-1-ind.png` });
// pinch out, hold, screenshot mid-pinch
await pinch(195, 500, 120, 30, 30);
await page.waitForTimeout(300);
console.log("mid:", await meter());
await page.screenshot({ path: `${out}/po-2-mid.png` });
await touch("touchEnd", []);
await page.waitForTimeout(800);
console.log("slip:", await meter());
await page.screenshot({ path: `${out}/po-3-slip.png` });
await browser.close();
