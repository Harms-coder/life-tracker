// Tap the month's name, pick another month in the list, and the book must land there in one turn:
// node tools/jumpcheck.mjs screenshots/jump
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/jump";
await withServer(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })).newPage();
  await page.addInitScript(() => localStorage.setItem("values-2026-5", JSON.stringify({ "3:loeb": "x", "4:loeb": "x" })));
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const openList = async () => { await page.evaluate(() => window.__tap(124, 64)); await page.waitForSelector(".chips.months"); };
  await openList();
  const listed = await page.$$eval(".chips.months .chip", (b) => b.map((x) => x.textContent + (x.classList.contains("on") ? "*" : "")));
  await page.screenshot({ path: OUT + "-liste.png" });
  await page.click(".chips.months .chip >> text=Maj");
  await page.waitForTimeout(700); await page.screenshot({ path: OUT + "-undervejs.png" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + "-maj.png" });
  await openList();
  const now = await page.$eval(".chips.months .chip.on", (b) => b.textContent);
  await page.click(".sheet-x"); await page.waitForTimeout(300);
  // and the arrows still go one month at a time from there
  await page.click(".turn.next"); await page.waitForTimeout(2500);
  await openList();
  const next = await page.$eval(".chips.months .chip.on", (b) => b.textContent);
  console.log({ listed, now, next }, now === "Maj" && next === "Jun" ? "OK" : "FEJL");
  await browser.close();
});
