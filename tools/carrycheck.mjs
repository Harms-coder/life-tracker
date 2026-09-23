// A new month offers the goals the month before did not reach, when you start writing in it (not when you turn to
// it): node tools/carrycheck.mjs screenshots/carry
// September's demo has six goals; goal 2 is marked reached, so five should be offered for October.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots/carry";
await withServer(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })).newPage();
  await page.addInitScript(() => { const d = new Date(); localStorage.setItem("backup-asked", `${d.getFullYear()}-${d.getMonth() + 1}`); });
  await page.goto(URL + "?husk"); await page.waitForSelector(".viewport"); await page.waitForTimeout(1500);
  await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("values-2026-9") || "{}"); v["done-goal1"] = "x"; localStorage.setItem("values-2026-9", JSON.stringify(v)); });
  await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.click(".turn.next"); await page.waitForTimeout(2500);
  const onTurn = await page.isVisible(".carry-list"); // leafing through must not ask (Lukas)
  await page.evaluate(() => window.__tap(300, 90)); await page.waitForTimeout(600); // start writing goal 1
  const offered = await page.$$eval(".carry-list .chip", (b) => b.map((x) => x.textContent));
  await page.screenshot({ path: OUT + "-ark.png" });
  await page.click(".carry-list .chip >> nth=4"); // leave the last one behind
  await page.click(".sheet .primary");
  await page.waitForTimeout(20000);
  const oct = await page.evaluate(() => JSON.parse(localStorage.getItem("notes-2026-10") || "{}"));
  await page.screenshot({ path: OUT + "-efter.png" });
  // turning back and forward again must not ask a second time
  await page.click(".turn.prev"); await page.waitForTimeout(2000); await page.click(".turn.next"); await page.waitForTimeout(2000);
  await page.evaluate(() => window.__tap(300, 90)); await page.waitForTimeout(600);
  const again = await page.isVisible(".carry-list");
  const goals = [0, 1, 2, 3, 4, 5].map((i) => oct["goal" + i] ?? null);
  console.log({ onTurn, offered: offered.length, goals, plan0: oct.plan0, again });
  console.log(!onTurn && offered.length === 5 && goals.filter(Boolean).length === 4 && !again ? "OK" : "FEJL");
  // declined, the tap goes on to what it was for: a fresh November asks, "Nej tak" opens the goal's own sheet
  await page.click(".sheet-x"); await page.waitForTimeout(400); // the goal's own sheet from the tap above
  await page.click(".turn.next"); await page.waitForTimeout(2500);
  await page.evaluate(() => window.__tap(300, 90)); await page.waitForTimeout(600);
  const asked = await page.isVisible(".carry-list");
  await page.click(".sheet .ghost"); await page.waitForTimeout(600);
  const title = await page.textContent(".sheet-head h2").catch(() => null);
  console.log({ asked, efterNejTak: title }, asked && title === "Mål 1" ? "OK" : "FEJL");
  await browser.close();
});
