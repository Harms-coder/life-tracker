// The "what went well" box: short text (photo slot offered), long text (gone), and with a photo in it.
// node tools/goodcheck.mjs screenshots/good
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
import fs from "node:fs";
const OUT = process.argv[2] ?? "screenshots/good";
const photo = JSON.parse(fs.readFileSync(process.argv[3], "utf8")).b7;
const SHORT = "Løbet 3 gange om ugen\nMediteret hver morgen\nSpist clean 19 dage";
const LONG = SHORT + "\n" + Array.from({ length: 20 }, (_, i) => `Punkt nummer ${i + 4} som fylder en hel linje i kassen`).join("\n");
await withServer(async () => {
  const browser = await chromium.launch();
  for (const [name, good, withPhoto] of [["kort", SHORT, false], ["lang", LONG, false], ["billede", SHORT, true]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(([g, p]) => {
      localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 }));
      localStorage.setItem("demo-notes-seeded-2", "1"); localStorage.setItem("demo-plans-seeded", "1");
      localStorage.setItem("notes-2026-9", JSON.stringify({ good: g }));
      if (p) localStorage.setItem("photos-2026-9", JSON.stringify({ b7: p }));
    }, [good, withPhoto ? photo : null]);
    await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}-${name}.png` });
    // is the slot tappable? ask the layout directly
    const tappable = await page.evaluate(async ([g]) => {
      const L = await import("/life-tracker/src/layout.ts");
      const types = ["number", "check", "check", "check", "check", "check", "check", "rating", "rating", "rating", "rating", "dots", "rating"]; // DEFAULT_COLUMNS
      const cols = JSON.parse(localStorage.getItem("columns") || "null") ?? types.map((type, i) => ({ id: "c" + i, name: "c", type }));
      return L.photoBoxesRight(cols, 30, { good: g }).map((p) => p.slot);
    }, [good]);
    console.log(name, "pladser:", JSON.stringify(tappable));
    await ctx.close();
  }
  await browser.close();
});
