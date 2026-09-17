// Start view with a query string, Chrome 3x: node tools/fit3d.mjs out.png "?bog3d"
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2], Q = process.argv[3] ?? "";
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => console.log(m.type() + ":", m.text()));
  page.on("pageerror", (e) => console.log("FEJL:", e.message));
  await page.goto(URL + Q); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT });
  await browser.close();
});
