import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = "/Users/lukasharms/Desktop/Life Tracker App/screenshots/turn";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.evaluate(() => { const v = window.__view; v.s = 0.249; v.x = (390 - 1456 * 0.249) / 2; v.y = (844 - 1048 * 0.249) / 2; window.__turnTo(1, 0); });
  await page.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  // finger on the right page, dragged slowly to the left
  let x = 300, y = 430;
  await touch("touchStart", x, y);
  for (let i = 0; i < 20; i++) { x -= 8; await touch("touchMove", x, y); await page.waitForTimeout(30); }
  await page.screenshot({ path: `${OUT}/drag-mid.png` });
  const p = await page.evaluate(() => window.__busy());
  for (let i = 0; i < 10; i++) { x -= 8; await touch("touchMove", x, y); await page.waitForTimeout(30); }
  await touch("touchEnd");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/drag-after.png` });
  console.log("month after drag:", await page.evaluate(() => localStorage.getItem("month")), "busy mid:", p);
  // a vertical drag on the book must pan, not turn
  const before = await page.evaluate(() => ({ ...window.__view }));
  await touch("touchStart", 200, 400); for (let i = 1; i <= 10; i++) { await touch("touchMove", 200, 400 + i * 8); await page.waitForTimeout(20); } await touch("touchEnd");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ ...window.__view }));
  console.log("pan dy:", (after.y - before.y).toFixed(1), "month:", await page.evaluate(() => localStorage.getItem("month")));
  // a short drag to the left, let go early: the leaf must fall back
  x = 300; await touch("touchStart", x, y); for (let i = 0; i < 5; i++) { x -= 6; await touch("touchMove", x, y); await page.waitForTimeout(30); } await touch("touchEnd");
  await page.waitForTimeout(800);
  console.log("after short drag:", await page.evaluate(() => localStorage.getItem("month")));
  await browser.close();
});
