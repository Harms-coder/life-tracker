import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const slow = Number(process.argv[2] ?? 4);
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.text().startsWith("TIMING")) console.log(m.text()); });
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  if (slow > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow });
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const pinch = async (cx, cy, from, to, steps = 14) => {
    await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
    for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
    await touch("touchEnd", []); await page.waitForTimeout(500);
  };
  console.log("-- ind"); for (const to of [30, 40, 50, 80, 80]) await pinch(195, 560, 20, to);
  console.log("-- ud"); for (const to of [20, 20, 20]) await pinch(195, 560, 120, to);
  await browser.close();
});
