// Does the book open without the internet? Builds must be in dist/ (npm run build). Serves it with vite preview,
// opens it once online (the service worker keeps its files), then stops the server and opens it again.
// node tools/offlinecheck.mjs screenshots/offline.png
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const OUT = process.argv[2] ?? "screenshots/offline.png";
const server = spawn("npx", ["vite", "preview", "--port", "4179", "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));
const URL = "http://localhost:4179/life-tracker/";
try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForSelector(".viewport");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2500);
  const cached = await page.evaluate(async () => { const k = await caches.keys(); return { caches: k, n: k.length ? (await (await caches.open(k[0])).keys()).map((r) => r.url.slice(-30)) : [], styrer: !!navigator.serviceWorker.controller }; });
  console.log(cached);
  // the server goes away (what "no internet" is to the phone). Playwright's setOffline also blocks what the service
  // worker answers from its cache in Chromium, so it cannot be used to test this.
  server.kill(); await new Promise((r) => setTimeout(r, 800));
  page.on("requestfailed", (r) => console.log("  mislykket:", r.url()));
  await page.reload().catch((e) => console.log("  reload:", e.message.split("\n")[0]));
  console.log("  indhold:", (await page.content()).slice(0, 200));
  await page.waitForSelector(".viewport", { timeout: 8000 });
  await page.waitForTimeout(3000);
  const drawn = await page.evaluate(() => { const c = document.querySelector("canvas"); return !!c && c.width > 0; });
  await page.screenshot({ path: OUT });
  console.log({ cached, drawn }, drawn ? "OK: åbner uden net" : "FEJL");
  await browser.close();
} finally { server.kill(); }
