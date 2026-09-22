// How many full drawings a pan zoomed in asks the worker for: node tools/pancheck.mjs
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const pm = Worker.prototype.postMessage;
    window.__renders = 0;
    Worker.prototype.postMessage = function (m, ...r) { if (m && !m.overview) window.__renders++; return pm.call(this, m, ...r); };
  });
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const out = await page.evaluate(async () => {
    const vp = document.querySelector(".viewport");
    const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    fire("pointerdown", 1, 185, 430); fire("pointerdown", 2, 205, 450);
    for (let i = 1; i <= 60; i++) { await raf(); fire("pointermove", 1, 185 - i * 2.2, 430 - i * 2.2); fire("pointermove", 2, 205 + i * 2.2, 450 + i * 2.2); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
    await new Promise((r) => setTimeout(r, 1200));
    const before = window.__renders, t0 = performance.now();
    // one long pan: 90 frames, 8 px per frame = 720 px ~ 480 px/s, then the finger lifts and the glide runs
    fire("pointerdown", 1, 300, 300);
    for (let i = 1; i <= 90; i++) { await raf(); fire("pointermove", 1, 300 - i * 4, 300 - i * 7); }
    fire("pointerup", 1, 300 - 360, 300 - 630);
    await new Promise((r) => setTimeout(r, 1500));
    return { renders: window.__renders - before, ms: Math.round(performance.now() - t0), s: window.__view.s.toFixed(2) };
  });
  console.log("pan zoomet ind:", JSON.stringify(out));
  await browser.close();
});
