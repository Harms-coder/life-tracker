import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
await withServer(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(m.type(), m.text().slice(0, 600)); });
  page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 600)));
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  await browser.close();
});
