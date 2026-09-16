// Frame-time benchmark in WebKit (same engine as iPhone Safari): scripted pinch + pan via synthetic pointer events.
import { webkit } from "playwright";
import { withServer, URL } from "./server.mjs";
const label = process.argv[2] ?? "";
await withServer(async () => {
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
if (process.env.NO_TILT) await page.addInitScript(() => { window.__tiltMax = 0; });
await page.goto(URL + (process.env.Q ?? "")); await page.waitForSelector(".viewport");
await page.waitForTimeout(1500);
const stats = (a) => { const stalls = a.map((v, i) => [i, v]).filter(([, v]) => v > 33).map(([i, v]) => `#${i}:${v.toFixed(0)}`).join(" "); const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return `p50 ${q(.5).toFixed(1)}  p90 ${q(.9).toFixed(1)}  max ${s[s.length - 1].toFixed(1)}  frames>33ms ${s.filter(v => v > 33).length}/${s.length}  stalls ${stalls}`; };
const run = async (kind) => page.evaluate(async (kind) => {
  const vp = document.querySelector(".viewport");
  const fire = (type, id, x, y) => vp.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const frames = []; let last = performance.now(), running = true;
  const loop = (t) => { frames.push(t - last); last = t; if (running) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  await raf();
  const cx = 195, cy = 420;
  if (kind === "pinch-in" || kind === "pinch-out") {
    const sign = kind === "pinch-in" ? 1 : -1;
    const d0 = kind === "pinch-in" ? 20 : 200;
    fire("pointerdown", 1, cx - d0, cy - d0); fire("pointerdown", 2, cx + d0, cy + d0);
    for (let i = 1; i <= 90; i++) { await raf(); const d = d0 + sign * i * 2; fire("pointermove", 1, cx - d, cy - d); fire("pointermove", 2, cx + d, cy + d); }
    fire("pointerup", 1, 0, 0); fire("pointerup", 2, 0, 0);
  } else {
    fire("pointerdown", 1, cx, cy);
    for (let i = 1; i <= 90; i++) { await raf(); fire("pointermove", 1, cx - i * 3, cy - i * 2); }
    fire("pointerup", 1, 0, 0);
  }
  await new Promise((r) => setTimeout(r, 700));
  running = false;
  return frames.slice(1);
}, kind);
console.log(label);
for (const k of (process.env.SEQ ?? "pinch-in,pan,pinch-out,pan").split(",")) console.log(`  ${k.padEnd(10)} ${stats(await run(k))}`);
await browser.close();
});
