// Frames of the pen writing in the book: node tools/writecheck.mjs screenshots/write
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/write";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL + "?pen=6"); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const shots = async (name) => { for (let i = 0; i < 5; i++) { await page.screenshot({ path: `${OUT}-${name}-${i}.png` }); await page.waitForTimeout(90); } };
  // a note: two points written one after the other
  await page.evaluate(([x, y]) => window.__tap(x, y), [200, 300]); // the plan under goal 1 on the left page
  await page.waitForSelector(".line input");
  const rows = page.locator(".line input:not([type=hidden])");
  await rows.nth(0).fill("Sove mere");
  await rows.nth(1).fill("Drikke vand");
  await page.click("button.primary");
  await shots("note");
  // zoom in on the table so single cells are readable
  await page.evaluate(async () => {
    const vp = document.querySelector(".viewport");
    const fire = (type, id, x, y) => vp.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const cx = 195, cy = 420;
    fire("pointerdown", 1, cx - 10, cy - 10); fire("pointerdown", 2, cx + 10, cy + 10);
    for (let i = 1; i <= 30; i++) { await raf(); fire("pointermove", 1, cx - 10 - i * 4, cy - 10 - i * 4); fire("pointermove", 2, cx + 10 + i * 4, cy + 10 + i * 4); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
    await new Promise((r) => setTimeout(r, 800));
  });
  // a weight: open the sheet through the book's own tap, type and press Skriv
  const xs = await page.evaluate(async () => {
    const L = await import("/life-tracker/src/layout.ts");
    const types = ["number", "check", "check", "check", "check", "check", "check", "rating", "rating", "rating", "rating", "dots", "rating"]; // DEFAULT_COLUMNS in App.tsx
    const cols = JSON.parse(localStorage.getItem("columns") || "null") ?? types.map((type, i) => ({ id: "c" + i, name: "c", type }));
    return { xs: L.columnXs(cols), RIGHT: L.RIGHT_PAGE, CELL: L.CELL, HEADER_Y: L.HEADER_Y };
  });
  const colX = (i) => xs.RIGHT.x + (xs.xs[i + 1] + xs.xs[i + 2]) / 2;
  const rowY = (day) => xs.RIGHT.y + xs.HEADER_Y + (day - 0.5) * xs.CELL;
  await page.evaluate(([x, y]) => window.__tap(x, y), [colX(0), rowY(8)]);
  await page.waitForSelector(".sheet");
  await page.fill(".hand-input", "70,4");
  await page.click("button.primary");
  await shots("tal");
  // and an X
  await page.evaluate(([x, y]) => window.__tap(x, y), [colX(1), rowY(9)]);
  await shots("kryds");
  await browser.close();
});
