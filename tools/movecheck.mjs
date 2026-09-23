// Move a column two places right from its sheet; its values must go with it: node tools/movecheck.mjs screenshots/move
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/move";
await withServer(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })).newPage();
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const state = () => page.evaluate(() => ({ cols: JSON.parse(localStorage.getItem("columns") || "null")?.map((c) => c.id), loeb: Object.keys(JSON.parse(localStorage.getItem("values-2026-9") || "{}")).filter((k) => k.endsWith(":loeb")).length }));
  const before = await state();
  await page.evaluate(() => window.__tap(838, 144)); // the heading of "Løb"
  await page.waitForSelector(".move-row");
  await page.click(".move-row button >> nth=1"); await page.waitForTimeout(200);
  await page.click(".move-row button >> nth=1"); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + "-ark.png" });
  await page.click(".sheet-x"); await page.waitForTimeout(1500);
  const after = await state();
  await page.screenshot({ path: OUT + "-bog.png" });
  console.log({ before: before.cols?.slice(0, 5) ?? "standard", after: after.cols.slice(0, 5), loeb: [before.loeb, after.loeb] },
    after.cols[3] === "loeb" && before.loeb === after.loeb ? "OK" : "FEJL");
  await browser.close();
});
