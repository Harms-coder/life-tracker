// A note with emoji in it, zoomed in: node tools/emojicheck.mjs screenshots/emoji.png
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/emoji.png";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 }));
    localStorage.setItem("demo-notes-seeded-2", "1"); localStorage.setItem("demo-plans-seeded", "1");
    localStorage.setItem("notes-2026-9", JSON.stringify({ goal0: "Løbe 🏃‍♂️ hver uge 🇩🇰", plan0: "10 min meditation 🧘 hver morgen\nKaffe ☕ først kl. 9 😴\nEn fridag 🌲🔥 uden planer" }));
  });
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const vp = document.querySelector(".viewport");
    const fire = (t, id, x, y) => vp.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const cx = 95, cy = 415; // goal 1 and its plan, start view
    fire("pointerdown", 1, cx - 10, cy - 10); fire("pointerdown", 2, cx + 10, cy + 10);
    for (let i = 1; i <= 70; i++) { await raf(); fire("pointermove", 1, cx - 10 - i * 2.5, cy - 10 - i * 2.5); fire("pointermove", 2, cx + 10 + i * 2.5, cy + 10 + i * 2.5); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
    await new Promise((r) => setTimeout(r, 1500));
  });
  await page.screenshot({ path: OUT });
  await browser.close();
});
