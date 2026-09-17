// Six zoom steps on the book, Chrome 3x, cropped to a sheet: how the tilt and the top-down table cross over.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] || "screenshots";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await page.goto(URL + (process.env.Q ?? "")); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const pinch = async (cx, cy, from, to, steps = 12) => {
    await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
    for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
    await touch("touchEnd", []); await page.waitForTimeout(500);
  };
  for (let i = 1; i <= 6; i++) {
    await page.screenshot({ path: `${OUT}/s${i}.png` });
    console.log("s" + i, await page.evaluate(() => JSON.stringify(window.__view)));
    if (i < 6) await pinch(195, 430, 60, 60 * 1.35);
  }
  await browser.close();
});
