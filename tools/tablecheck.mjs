// Zoomed in (flat), is the top-down table drawn over the photo? Compares with ?bord=0 and prints GL errors.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
await withServer(async () => {
  const browser = await chromium.launch();
  for (const q of ["", "?bord=0"]) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
    page.on("console", (m) => { if (m.type() === "error") console.log(q, m.type(), m.text().slice(0, 300)); });
    await page.goto(URL + q); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
    await page.evaluate(async () => {
      const v = document.querySelector(".viewport");
      for (let i = 0; i < 40; i++) { v.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, clientX: 195, clientY: 420, bubbles: true })); await new Promise((r) => setTimeout(r, 16)); }
      await new Promise((r) => setTimeout(r, 800));
    });
    console.log(q || "(normal)", await page.evaluate(() => JSON.stringify(window.__view)));
    await page.screenshot({ path: `screenshots/table${q ? "-nobord" : ""}.png`, clip: { x: 0, y: 0, width: 390, height: 300 } });
    await page.close();
  }
  await browser.close();
});
