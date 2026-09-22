// Frames of the pen writing in the book: node tools/writecheck.mjs screenshots/write
// Uses ?pen=6 (slow) so a screenshot can catch it half-written.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/write";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL + "?pen=6"); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const shots = async (name, n = 6, gap = 200) => { for (let i = 0; i < n; i++) { await page.screenshot({ path: `${OUT}-${name}-${i}.png` }); await page.waitForTimeout(gap); } };

  // ONE new point added to a list that already has three: only the new one may be written
  await page.evaluate(([x, y]) => window.__tap(x, y), [200, 300]); // the plan under goal 1
  await page.waitForSelector(".line input");
  const rows = page.locator(".line input:not([type=hidden])");
  await rows.nth(await rows.count() - 1).fill("Hej med dig");
  await page.click("button.primary");
  await shots("note");

  // zoom in so one cell fills a good part of the screen, then tick a box
  await page.evaluate(async () => {
    const vp = document.querySelector(".viewport");
    const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    fire("pointerdown", 1, 185, 410); fire("pointerdown", 2, 205, 430);
    for (let i = 1; i <= 40; i++) { await raf(); fire("pointermove", 1, 185 - i * 4, 410 - i * 4); fire("pointermove", 2, 205 + i * 4, 430 + i * 4); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
    await new Promise((r) => setTimeout(r, 900));
  });
  const L = await page.evaluate(async () => {
    const m = await import("/life-tracker/src/layout.ts");
    const types = ["number", "check", "check", "check", "check", "check", "check", "rating", "rating", "rating", "rating", "dots", "rating"]; // DEFAULT_COLUMNS
    const cols = JSON.parse(localStorage.getItem("columns") || "null") ?? types.map((type, i) => ({ id: "c" + i, name: "c", type }));
    return { xs: m.columnXs(cols), RIGHT: m.RIGHT_PAGE, CELL: m.CELL, HEADER_Y: m.HEADER_Y };
  });
  const colX = (i) => L.RIGHT.x + (L.xs[i + 1] + L.xs[i + 2]) / 2;
  const rowY = (day) => L.RIGHT.y + L.HEADER_Y + (day - 0.5) * L.CELL;
  const on = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("values-2026-9") || "{}")));
  // find an empty check cell so the X is being put IN, not taken away
  let day = 1; while (on.includes(`${day}:loeb`) && day < 28) day++;
  await page.evaluate(([x, y]) => window.__tap(x, y), [colX(1), rowY(day)]);
  await shots("kryds", 8, 520);
  await browser.close();
});
