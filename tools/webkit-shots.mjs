// WebKit (iPhone engine) screenshots: start view (video should be playing) and a zoomed view.
import { webkit } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2] ?? "screenshots";
await withServer(async () => {
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.goto(URL + (process.env.TID ? "?tid=" + process.env.TID : "")); await page.waitForSelector(".viewport"); await page.waitForTimeout(3000);
console.log("video:", await page.evaluate(() => [...document.querySelectorAll("video")].map((v) => `${v.currentSrc.split("/").pop()} paused=${v.paused} t=${v.currentTime.toFixed(2)} opacity=${v.style.opacity} err=${v.error?.code ?? "-"}`)));
await page.screenshot({ path: OUT + "/w1-fit.png" });
await page.evaluate(async () => {
  const vp = document.querySelector(".viewport");
  const fire = (type, id, x, y) => vp.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  fire("pointerdown", 1, 175, 470); fire("pointerdown", 2, 215, 510);
  for (let i = 1; i <= 40; i++) { await raf(); const d = 20 + i * 3; fire("pointermove", 1, 195 - d, 490 - d); fire("pointermove", 2, 195 + d, 490 + d); }
  fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
});
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + "/w2-zoom.png" });
await browser.close();
});
