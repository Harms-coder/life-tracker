// The three header placements side by side: node tools/ovcheck.mjs screenshots/ov
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/ov";
await withServer(async () => {
  const browser = await chromium.launch();
  for (const n of (process.env.OX ?? "6,8.6,11,15").split(",")) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 })));
    await page.goto(URL + "?ox=" + n); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
    await page.evaluate(async () => {
      const vp = document.querySelector(".viewport");
      const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const cx = 240, cy = 400;
      fire("pointerdown", 1, cx - 10, cy - 10); fire("pointerdown", 2, cx + 10, cy + 10);
      for (let i = 1; i <= 62; i++) { await raf(); fire("pointermove", 1, cx - 10 - i * 2.5, cy - 10 - i * 2.5); fire("pointermove", 2, cx + 10 + i * 2.5, cy + 10 + i * 2.5); }
      fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
      await new Promise((r) => setTimeout(r, 1500));
    });
    await page.screenshot({ path: `${OUT}-${n}.png` });
    await ctx.close();
  }
  await browser.close();
});
