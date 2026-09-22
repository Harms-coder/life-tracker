// Zoom right in and photograph the book's four corners and outer edges: the stripes, the white rim, the cover.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2];
const Z = Number(process.env.Z ?? 5); // pinch steps
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await page.goto(URL + (process.env.Q ?? "")); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const pinch = async (cx, cy, from, to, steps = 10) => {
    await touch("touchStart", [{ x: cx - from, y: cy - from }, { x: cx + from, y: cy + from }]);
    for (let i = 1; i <= steps; i++) { const d = from + ((to - from) * i) / steps; await touch("touchMove", [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }]); await page.waitForTimeout(16); }
    await touch("touchEnd", []); await page.waitForTimeout(400);
  };
  const view = () => page.evaluate(() => ({ ...window.__view }));
  // drag without flinging: end where the finger stops, then hold still a moment
  const drag = async (dx, dy) => {
    const x0 = 195 - dx / 2, y0 = 430 - dy / 2;
    await touch("touchStart", [{ x: x0, y: y0 }]);
    for (let i = 1; i <= 12; i++) { await touch("touchMove", [{ x: x0 + (dx * i) / 12, y: y0 + (dy * i) / 12 }]); await page.waitForTimeout(20); }
    await touch("touchMove", [{ x: x0 + dx, y: y0 + dy }]); await page.waitForTimeout(160);
    await touch("touchEnd", []); await page.waitForTimeout(600);
  };
  /** pan until the world point (wx, wy) sits at screen (sx, sy) */
  const panTo = async (wx, wy, sx, sy) => {
    for (let i = 0; i < 14; i++) {
      const v = await view();
      const dx = sx - (v.x + wx * v.s), dy = sy - (v.y + wy * v.s);
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) break;
      await drag(Math.max(-300, Math.min(300, dx)), Math.max(-600, Math.min(600, dy)));
    }
    await page.waitForTimeout(900);
  };
  for (let i = 0; i < Z; i++) await pinch(195, 430, 40, 40 * 1.6);
  await page.waitForTimeout(1200);
  console.log("zoom", await view());
  const shots = [
    ["nv", 0, 0], ["no", 1456, 0], ["sv", 0, 1048], ["so", 1456, 1048],
    ["kant-v", 0, 524], ["kant-n", 728, 1048],
  ];
  for (const [name, wx, wy] of shots) {
    await panTo(wx, wy, 195, 430);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(name, await view());
  }
  await browser.close();
});
