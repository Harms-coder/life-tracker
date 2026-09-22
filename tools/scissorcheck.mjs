// Shots at the spots where clipping the under-the-pages passes could possibly change the picture: middle of a
// page (nothing under it shows), hard against each page edge (a strip of board/stack/shadow does), and tipped
// out. Run it on both versions and diff the two directories:
//   node tools/scissorcheck.mjs screenshots/scissor-foer
//   node tools/scissorcheck.mjs screenshots/scissor-efter
//   python3 tools/pngdiff.py screenshots/scissor-foer screenshots/scissor-efter
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { withServer, URL } from "./server.mjs";

const dir = process.argv[2] ?? "screenshots/scissor";
mkdirSync(dir, { recursive: true });

// name, pinches in, then which way to shove until the pan clamps
const SPOTS = [
  ["ud", 0, 0, 0],
  ["ind", 7, 0, 0],
  ["venstre", 7, 1, 0],
  ["hoejre", 7, -1, 0],
  ["op", 7, 0, 1],
  ["ned", 7, 0, -1],
  ["hjoerne", 7, 1, 1],
];

await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  for (const [name, pinches, dx, dy] of SPOTS) {
    await page.goto(URL);
    await page.waitForSelector(".viewport");
    await page.waitForTimeout(2500);
    const view = await page.evaluate(async ([pinches, dx, dy]) => {
      const el = document.querySelector(".viewport");
      const fire = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let p = 0; p < pinches; p++) {
        fire("pointerdown", 1, 185, 430); fire("pointerdown", 2, 205, 450);
        for (let i = 1; i <= 22; i++) { await raf(); const k = i * 2.2; fire("pointermove", 1, 185 - k, 430 - k); fire("pointermove", 2, 205 + k, 450 + k); }
        fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
        await new Promise((r) => setTimeout(r, 900));
      }
      // shove the same way over and over: it ends ON the pan limit, the same place every run
      for (let n = 0; n < 8 && (dx || dy); n++) {
        fire("pointerdown", 1, 195, 420);
        for (let i = 1; i <= 30; i++) { await raf(); fire("pointermove", 1, 195 + i * dx * 10, 420 + i * dy * 10); }
        fire("pointerup", 1, 195 + dx * 300, 420 + dy * 300);
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 1600)); // let the sharp redraw land
      const v = window.__view;
      return { x: Math.round(v.x), y: Math.round(v.y), s: +v.s.toFixed(3) };
    }, [pinches, dx, dy]);
    await page.screenshot({ path: `${dir}/${name}.png` });
    console.log(`${name.padEnd(10)} view ${JSON.stringify(view)}`);
  }
  await browser.close();
});
