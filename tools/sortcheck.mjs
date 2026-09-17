// Zoom in on the book, then pinch OUT fast and look at the book while the fingers are still down (Lukas: "the book goes black")
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  const slow = Number(process.argv[3] ?? 1); // CPU throttling, to stand in for the phone
  if (slow > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow });
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const move = async (cx, cy, from, to, steps, wait) => {
    for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(wait); }
  };
  const pinch = async (cx, cy, from, to) => { await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]); await move(cx, cy, from, to, 14, 16); await touch("touchEnd", []); await page.waitForTimeout(400); };
  for (const to of [30, 40, 50, 80, 80]) await pinch(195, 560, 20, to);
  await page.waitForTimeout(600);
  // now out, fast, and look while the fingers are still down
  await touch("touchStart", [{ x: 195 - 120, y: 560 - 120 }, { x: 195 + 120, y: 560 + 120 }]);
  await move(195, 560, 120, 12, 6, 16);
  await page.screenshot({ path: OUT + "/sort1-midt.png", clip: { x: 20, y: 360, width: 350, height: 200 } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/sort2-holdt.png", clip: { x: 20, y: 360, width: 350, height: 200 } });
  await touch("touchEnd", []); await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + "/sort3-sluppet.png", clip: { x: 20, y: 360, width: 350, height: 200 } });
  await browser.close();
});
