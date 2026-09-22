// Start-up and mid-pinch check: frames right after load (is the book ever black?), then a pinch held at 2.5x
// (how sharp is the writing while the fingers are still down?). node tools/startcheck.mjs screenshots/start
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/start";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "commit" });
  for (let i = 0; i < 8; i++) { await page.screenshot({ path: `${OUT}-load-${i}.png` }).catch(() => {}); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}-ready.png` });
  // pinch to 2.5x and HOLD
  await page.evaluate(async () => {
    const vp = document.querySelector(".viewport");
    const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    fire("pointerdown", 1, 185, 430); fire("pointerdown", 2, 205, 450);
    for (let i = 1; i <= 60; i++) { await raf(); fire("pointermove", 1, 185 - i * 2.2, 430 - i * 2.2); fire("pointermove", 2, 205 + i * 2.2, 450 + i * 2.2); }
    window.__hold = () => { fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0); };
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}-mid.png` });
  await page.evaluate(() => window.__hold());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}-after.png` });
  await browser.close();
});
