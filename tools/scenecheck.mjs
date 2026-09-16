// Scene check (TASK_scene_depth.md goal 4): at the identity view the layered scene must match the photo. Screenshots
// the scene without the book (?nobook) for tools/scenecheck.py to diff against the original, then views with the book
// at z=1, the book filling the screen, the tilt gone (zoomFlat) and 3x, for the gallery.
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
const OUT = process.argv[2];
await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  const open = async (q) => {
    await page.goto(URL + q); await page.waitForSelector(".viewport");
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await page.waitForTimeout(1500);
  };
  const cam = () => page.evaluate(() => JSON.stringify(window.__cam(), (k, v) => (typeof v === "number" ? +v.toFixed(3) : v)));
  await open("?nobook"); console.log("z1 scene", await cam());
  await page.screenshot({ path: OUT + "/s0-z1-scene.png" });
  await open(""); await page.screenshot({ path: OUT + "/s1-z1.png" });
  const go = async (zFit, name) => {
    await page.evaluate((z) => window.__zoomTo(z), zFit); await page.waitForTimeout(600);
    console.log(name, await cam()); await page.screenshot({ path: `${OUT}/${name}.png` });
  };
  await go(1, "s2-fit"); await go(1.3, "s3-mid"); await go(1.7, "s4-flat"); await go(3, "s5-zoom3");
  await browser.close();
});
