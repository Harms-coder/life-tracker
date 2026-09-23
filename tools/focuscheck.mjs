// Which line the caret lands on when a writing sheet opens, and that a typed sentence stays on it: node tools/focuscheck.mjs
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 })));
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  for (const [name, wx, wy] of [["plan under mål 1", 200, 300], ["mål 1", 300, 90], ["Gør bedre næste måned", 900, 850], ["Hvad gik godt (8 linjer)", 1400, 400]]) {
    await page.evaluate(([x, y]) => window.__tap(x, y), [wx, wy]);
    await page.waitForSelector(".sheet", { timeout: 3000 }).catch(() => {});
    const out = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll(".line input:not([type=hidden])")];
      const i = inputs.indexOf(document.activeElement);
      const el = inputs[i], sheet = document.querySelector(".sheet");
      const synlig = el && sheet ? el.getBoundingClientRect().bottom <= sheet.getBoundingClientRect().bottom + 1 && el.getBoundingClientRect().top >= sheet.getBoundingClientRect().top - 1 : null;
      return { title: document.querySelector(".sheet-head h2")?.textContent, linjer: inputs.length, markoer: i, tom: i >= 0 ? el.value === "" : null, synlig };
    });
    console.log(name, "->", JSON.stringify(out));
    // typing a sentence must stay on the line the caret started on (it jumped down a line per letter, 23/9)
    await page.keyboard.type("Hej med dig", { delay: 20 });
    const typed = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll(".line input:not([type=hidden])")];
      return { markoer: inputs.indexOf(document.activeElement), tekst: document.activeElement?.value };
    });
    console.log("   skrevet ->", JSON.stringify(typed), typed.tekst === "Hej med dig" ? "OK" : "FEJL");
    await page.evaluate(() => document.querySelector(".sheet-x")?.click());
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: "screenshots/focus.png" });
  await browser.close();
});
