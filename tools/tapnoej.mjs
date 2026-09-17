// Does a tap land in the cell you touched? Zoom in, tap a few points, and mark each one on the screenshot.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots", Q = process.env.Q ?? "";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("FEJL:", e.message));
  await page.goto(URL + Q); await page.waitForSelector(".viewport"); await page.waitForTimeout(2200);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const pinch = async (cx, cy, from, to, steps = 12) => {
    await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
    for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
    await touch("touchEnd", []); await page.waitForTimeout(500);
  };
  for (let i = 0; i < 4; i++) await pinch(195, 430, 60, 60 * 1.6);
  await touch("touchStart", [{ x: 300, y: 500 }]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: 300 - i * 22, y: 500 }]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(900);
  console.log("view", await page.evaluate(() => JSON.stringify(window.__view)));
  const pts = [[90, 300], [150, 300], [210, 300], [270, 300], [120, 460], [240, 460]];
  for (const [x, y] of pts) { await touch("touchStart", [{ x, y }]); await page.waitForTimeout(40); await touch("touchEnd", []); await page.waitForTimeout(260); }
  await page.waitForTimeout(500);
  // draw a ring where each tap went, so the offset to the X is visible
  await page.evaluate((pts) => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99";
    d.innerHTML = pts.map(([x, y]) => `<div style="position:absolute;left:${x - 9}px;top:${y - 9}px;width:18px;height:18px;border:2px solid #d00;border-radius:50%"></div>`).join("");
    document.body.appendChild(d);
  }, pts);
  await page.screenshot({ path: `${OUT}/tap-${Q ? "3d" : "2d"}.png` });
  await browser.close();
});
