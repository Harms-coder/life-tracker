// Do the photos survive the move to IndexedDB? node tools/idbcheck.mjs <photos.json>
//  1. start with pictures in localStorage (as before this change) -> they must show, and move across
//  2. reload -> they must still show, now read from IndexedDB, with localStorage clear
//  3. add one and reload -> it must still be there
//  4. turn a leaf back and forth -> the month's own pictures must come back
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
import fs from "node:fs";

const photos = fs.readFileSync(process.argv[2], "utf8");
const slots = Object.keys(JSON.parse(photos));

await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  // seed localStorage the way it looked before this change - but only on the FIRST load, or every reload
  // would put the old copy back and there would be nothing to see
  await page.addInitScript((p) => {
    localStorage.setItem("month", JSON.stringify({ year: 2026, month: 9 }));
    if (!localStorage.getItem("photos-in-idb")) localStorage.setItem("photos-2026-9", p);
  }, photos);

  const state = () =>
    page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open("life-tracker", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const keys = await new Promise((res) => { const q = db.transaction("photos").objectStore("photos").getAllKeys(); q.onsuccess = () => res(q.result); });
      const rows = {};
      for (const k of keys) rows[k] = await new Promise((res) => { const q = db.transaction("photos").objectStore("photos").get(k); q.onsuccess = () => res(Object.keys(q.result ?? {})); });
      const ls = [];
      for (let i = 0; i < localStorage.length; i++) if (/^photos-\d/.test(localStorage.key(i))) ls.push(localStorage.key(i));
      return { idb: rows, localStoragePhotoKeys: ls, migrated: !!localStorage.getItem("photos-in-idb") };
    });

  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(3000);
  const s1 = await state();
  console.log("1. efter foerste start :", JSON.stringify(s1));

  await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(3000);
  const s2 = await state();
  console.log("2. efter genindlaesning:", JSON.stringify(s2));
  await page.screenshot({ path: "screenshots/idb-reload.png" });

  // add one to another month through the app's own save path, then reload
  await page.evaluate(async (png) => {
    const { save } = await import("/life-tracker/src/photos.ts");
    await save("photos-2026-10", { b1: png });
  }, JSON.parse(photos)[slots[0]]);
  await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const s3 = await state();
  console.log("3. efter en mere       :", JSON.stringify(s3));

  // 4. turn to October (it has one picture) and back: the leaf needs the neighbour's pictures the moment it
  //    is taken hold of, so they are read ahead - this checks they actually arrive
  const turned = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__turn(1); await wait(2500);
    const after = JSON.parse(localStorage.getItem("month"));
    window.__turn(-1); await wait(2500);
    return { landedOn: after, backOn: JSON.parse(localStorage.getItem("month")) };
  });
  console.log("4. bladret frem og tilbage:", JSON.stringify(turned));
  await page.screenshot({ path: "screenshots/idb-turned.png" });

  const ok =
    JSON.stringify(s2.idb["photos-2026-9"]?.sort()) === JSON.stringify(slots.sort()) &&
    s2.localStoragePhotoKeys.length === 0 &&
    s2.migrated &&
    s3.idb["photos-2026-10"]?.length === 1 &&
    turned.landedOn.month === 10 && turned.backOn.month === 9;
  console.log(ok ? "\nOK: billederne flyttede med, localStorage er tom, og de overlever genindlaesning" : "\nFEJL");
  await browser.close();
  if (!ok) process.exitCode = 1;
});
