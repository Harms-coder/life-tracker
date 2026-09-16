// Screenshots: fit, max zoom-out, partial tilt, zoomed in + panned to the table's edge, and mid-pinch.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2];
await withServer(async () => {
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + "/v1-fit.png" });
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
const pinch = async (cx, cy, from, to, steps = 14, release = true) => {
  await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
  for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
  if (release) { await touch("touchEnd", []); await page.waitForTimeout(400); }
};
const pan = async (dx, dy) => {
  await touch("touchStart", [{ x: 200, y: 500 }]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: 200 + (dx * i) / 10, y: 500 + (dy * i) / 10 }]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(1500);
};
const v = () => page.evaluate(() => JSON.stringify(window.__view));
await pinch(195, 420, 100, 30); console.log("out", await v());
await page.screenshot({ path: OUT + "/v2-out.png" });
await pinch(195, 420, 30, 60); console.log("partial", await v());
await page.screenshot({ path: OUT + "/v3-partial.png" });
await pinch(195, 420, 20, 80); await pinch(215, 470, 10, 40); console.log("in", await v());
await pan(0, 700); await pan(0, 700); await pan(-700, 0); console.log("edge", await v());
await page.screenshot({ path: OUT + "/v4-edge.png" });
// mid-pinch, fingers still down: is the writing still sharp? Start from the fit view and zoom to ~4x
await pinch(195, 420, 150, 30); await pinch(195, 420, 150, 30); await pinch(195, 420, 150, 40); await page.waitForTimeout(300); console.log("back at fit", await v());
await pinch(215, 470, 10, 100, 30, false); console.log("mid", await v());
await page.screenshot({ path: OUT + "/v5-midpinch.png" });
await touch("touchEnd", []); await page.waitForTimeout(400);
await page.screenshot({ path: OUT + "/v6-released.png" });
await browser.close();
});
