// Zoomed-in shots of a spot on the spread, with test photos and two goals ticked off:
// node tools/lookshot.mjs <photos.json> <out.png> <cx> <cy> [query]   (cx, cy = screen point in the start view to pinch open)
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
import fs from "node:fs";
const [photos, OUT, CX, CY, Q = ""] = process.argv.slice(2);
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript((p) => {
    if (sessionStorage.getItem("set")) return;
    sessionStorage.setItem("set", "1");
    localStorage.setItem("photos-2026-9", p);
    localStorage.setItem("look-ticks", "1");
  }, fs.readFileSync(photos, "utf8"));
  await page.goto(URL + Q); await page.waitForSelector(".viewport"); await page.waitForTimeout(1500);
  // tick two goals off in the demo month
  await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("values-2026-9") || "{}"); v["done-goal0"] = "x"; v["done-goal3"] = "x"; localStorage.setItem("values-2026-9", JSON.stringify(v)); });
  await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.evaluate(async ([cx, cy]) => {
    const vp = document.querySelector(".viewport");
    const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    fire("pointerdown", 1, cx - 10, cy - 10); fire("pointerdown", 2, cx + 10, cy + 10);
    for (let i = 1; i <= 12; i++) { await raf(); fire("pointermove", 1, cx - 10 - i * 3, cy - 10 - i * 3); fire("pointermove", 2, cx + 10 + i * 3, cy + 10 + i * 3); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
    await new Promise((r) => setTimeout(r, 1800));
  }, [Number(CX), Number(CY)]);
  await page.screenshot({ path: OUT });
  await browser.close();
});
