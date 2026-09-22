// Screenshots of every input sheet: node tools/sheets.mjs screenshots/sheet
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/sheet";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const points = await page.evaluate(async () => {
    const L = await import("/life-tracker/src/layout.ts");
    const cols = JSON.parse(localStorage.getItem("columns") || "null") ?? null;
    return { L: { RIGHT_PAGE: L.RIGHT_PAGE, CELL: L.CELL, HEADER_Y: L.HEADER_Y }, cols };
  });
  const tap = async (wx, wy) => { await page.evaluate(([x, y]) => window.__tap(x, y), [wx, wy]); await page.waitForTimeout(500); };
  const { CELL, RIGHT_PAGE, HEADER_Y } = points.L;
  const xs = await page.evaluate(async () => {
    const L = await import("/life-tracker/src/layout.ts");
    const types = ["number", "check", "check", "check", "check", "check", "check", "rating", "rating", "rating", "rating", "dots", "rating"]; // DEFAULT_COLUMNS in App.tsx
    const cols = JSON.parse(localStorage.getItem("columns") || "null") ?? types.map((type, i) => ({ id: "c" + i, name: "c", type }));
    return L.columnXs(cols);
  });
  const colX = (i) => RIGHT_PAGE.x + (xs[i + 1] + xs[i + 2]) / 2; // i = column index (xs[0..1] is the day column)
  const rowY = (day) => RIGHT_PAGE.y + HEADER_Y + (day - 0.5) * CELL;
  const shots = [
    ["tal", () => tap(colX(0), rowY(6))],            // Vægt
    ["rating", () => tap(colX(7), rowY(6))],          // Overskud
    ["kolonne", () => tap(colX(1), RIGHT_PAGE.y + HEADER_Y - 4 * CELL)],
    ["note", () => tap(200, 300)],                    // left page, the big plan field
    ["haand", async () => { await page.click(".hand-pick"); await page.waitForTimeout(400); }],
  ];
  for (const [name, act] of shots) {
    await act();
    await page.screenshot({ path: `${OUT}-${name}.png` });
    await page.evaluate(() => document.querySelector(".sheet-x")?.click()); await page.waitForTimeout(300);
  }
  await browser.close();
});
