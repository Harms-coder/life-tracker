// The pen at work: add a question mark to one line, then remove it again. Frames of each.
// node tools/pencheck.mjs screenshots/pen
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/pen";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 }));
    localStorage.setItem("demo-notes-seeded-2", "1"); localStorage.setItem("demo-plans-seeded", "1");
    localStorage.setItem("notes-2026-9", JSON.stringify({ plan0: "Ingen mail før kl. 9\nEn fridag om ugen" }));
  });
  await page.goto(URL + "?pen=5"); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  // zoom onto the plan under goal 1: at the start view the writing is two pixels tall
  await page.evaluate(async () => {
    const vp = document.querySelector(".viewport");
    const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const cx = 95, cy = 415;
    fire("pointerdown", 1, cx - 10, cy - 10); fire("pointerdown", 2, cx + 10, cy + 10);
    for (let i = 1; i <= 70; i++) { await raf(); fire("pointermove", 1, cx - 10 - i * 2.5, cy - 10 - i * 2.5); fire("pointermove", 2, cx + 10 + i * 2.5, cy + 10 + i * 2.5); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
    await new Promise((r) => setTimeout(r, 1500));
  });
  const shots = async (name, n = 6, gap = 260) => { for (let i = 0; i < n; i++) { await page.screenshot({ path: `${OUT}-${name}-${i}.png` }); await page.waitForTimeout(gap); } };
  const edit = async (text) => {
    await page.evaluate(([x, y]) => window.__tap(x, y), [200, 300]); // the plan under goal 1
    await page.waitForSelector(".line input");
    const rows = page.locator(".line input:not([type=hidden])");
    await rows.nth(0).fill(text);
    await page.click("button.primary");
  };
  await edit("Ingen mail før kl. 9?");
  await shots("tilfoej");
  await page.waitForTimeout(3000);
  await edit("Ingen mail før kl. 9");
  await shots("fjern");
  await browser.close();
});
