// Pages are turned by the arrows ONLY (Lukas, 22/9): a finger on the book must never turn a leaf, wherever it
// lands and whichever way it goes. node tools/swipecheck.mjs
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";

const SWIPES = [
  ["ude paa hoejre side, mod venstre", 300, 430, -8, 0],
  ["ude paa hoejre side, mod hoejre", 300, 430, 8, 0],
  ["ude paa venstre side, mod hoejre", 90, 430, 8, 0],
  ["ude paa venstre side, mod venstre", 90, 430, -8, 0],
  ["taet ved ryggen, mod venstre", 215, 430, -8, 0],
  ["hurtigt svirp mod venstre", 300, 430, -30, 0],
  ["skraat ned mod venstre", 300, 380, -8, 6],
  ["lodret ned", 200, 400, 0, 8],
];

await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  // pin the month, or on a first visit nothing is stored yet and "did it change" has nothing to compare to
  await page.addInitScript(() => localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 })));
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const month = () => page.evaluate(() => localStorage.getItem("month"));

  const start = await month();
  let bad = 0;
  for (const [name, x0, y0, dx, dy] of SWIPES) {
    await page.evaluate(() => { const v = window.__view; v.s = 0.249; v.x = (390 - 1456 * 0.249) / 2; v.y = (844 - 1048 * 0.249) / 2; });
    await page.waitForTimeout(400);
    let x = x0, y = y0;
    await touch("touchStart", x, y);
    for (let i = 0; i < 25; i++) { x += dx; y += dy; await touch("touchMove", x, y); await page.waitForTimeout(20); }
    await touch("touchEnd");
    await page.waitForTimeout(1200);
    const now = await month();
    const turned = now !== start;
    if (turned) bad++;
    console.log(`${turned ? "BLADREDE" : "ok      "}  ${name}`);
  }

  // the arrows must still work, both ways
  await page.evaluate(() => window.__turn(1)); await page.waitForTimeout(2500);
  const fwd = await month();
  await page.evaluate(() => window.__turn(-1)); await page.waitForTimeout(2500);
  const back = await month();
  const arrowsOk = fwd !== start && back === start;
  console.log(`${arrowsOk ? "ok      " : "FEJL    "}  pilene bladrer frem (${fwd}) og tilbage (${back})`);

  console.log(bad === 0 && arrowsOk ? "\nOK: fingeren bladrer aldrig, pilene goer" : `\nFEJL: ${bad} swipes bladrede`);
  await browser.close();
  if (bad || !arrowsOk) process.exitCode = 1;
});
