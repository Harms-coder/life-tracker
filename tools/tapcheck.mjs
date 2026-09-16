import { webkit } from "playwright";
import { withServer, URL } from "./server.mjs";
await withServer(async () => {
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL); await page.waitForSelector(".viewport");
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const vp = document.querySelector(".viewport");
  const fire = (type, id, x, y) => vp.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  // zoom in a lot so the tilt is gone
  const cx = 195, cy = 420;
  fire("pointerdown", 1, cx - 10, cy - 10); fire("pointerdown", 2, cx + 10, cy + 10);
  for (let i = 1; i <= 40; i++) { await raf(); fire("pointermove", 1, cx - 10 - i * 4, cy - 10 - i * 4); fire("pointermove", 2, cx + 10 + i * 4, cy + 10 + i * 4); }
  fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
  await new Promise((r) => setTimeout(r, 400));
  const v = window.__view;
  // world point of "Løb dag 5": right page x = 14+704, table: day col 2 cells, Løb is column index 1 (after Vægt 2 cells)
  const wx = 14 + 704 + 20 + 40 + 40 + 10, wy = 14 + 180 + 4 * 20 + 10;
  const sx = wx * v.s + v.x, sy = wy * v.s + v.y;
  // pan it into view if needed
  if (sx < 20 || sx > 370 || sy < 20 || sy > 800) {
    fire("pointerdown", 1, 200, 400);
    const dx = 195 - sx, dy = 420 - sy;
    for (let i = 1; i <= 10; i++) { await raf(); fire("pointermove", 1, 200 + dx * i / 10, 400 + dy * i / 10); }
    fire("pointerup", 1, 200 + dx, 400 + dy);
    await new Promise((r) => setTimeout(r, 1500)); // let the glide finish
  }
  const v2 = window.__view;
  const tx = wx * v2.s + v2.x, ty = wy * v2.s + v2.y;
  const before = JSON.parse(localStorage.getItem("values-2026-9") || "{}")["5:loeb"] ?? null;
  fire("pointerdown", 1, tx, ty); fire("pointerup", 1, tx, ty);
  await new Promise((r) => setTimeout(r, 500));
  const after = JSON.parse(localStorage.getItem("values-2026-9") || "{}")["5:loeb"] ?? null;
  // tap a header: Løb column header at y = 14 + 100
  const hx = wx * v2.s + v2.x, hy = (14 + 100) * v2.s + v2.y;
  fire("pointerdown", 1, hx, hy); fire("pointerup", 1, hx, hy);
  await new Promise((r) => setTimeout(r, 300));
  const sheet = document.querySelector(".sheet label")?.textContent ?? null;
  return { scale: v2.s.toFixed(2), tapAt: [tx.toFixed(0), ty.toFixed(0)], before, after, sheet };
});
console.log("tap check:", JSON.stringify(out));
await page.screenshot({ path: (process.argv[2] ?? "screenshots") + "/4-webkit-zoomet.png" });
await browser.close();
});
