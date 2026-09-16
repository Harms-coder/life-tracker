// WebKit (iPhone engine) screenshots: fit view and max zoom-out.
import { webkit } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots";
await withServer(async () => {
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + "/w1-fit.png" });
await page.evaluate(async () => {
  const vp = document.querySelector(".viewport");
  const fire = (type, id, x, y) => vp.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  fire("pointerdown", 1, 45, 270); fire("pointerdown", 2, 345, 570);
  for (let i = 1; i <= 40; i++) { await raf(); const d = 150 - i * 3; fire("pointermove", 1, 195 - d, 420 - d); fire("pointermove", 2, 195 + d, 420 + d); }
  fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
});
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + "/w2-out.png" });
await browser.close();
});
