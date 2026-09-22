// The book is only on this phone: save a copy, wipe a month, read the copy back, and check every last value,
// note and picture returned. node tools/backupcheck.mjs
import { chromium } from "playwright";
import { withServer, URL } from "./server.mjs";
import fs from "node:fs";

const PHOTOS = process.argv[2];

await withServer(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  if (PHOTOS) await page.addInitScript((p) => localStorage.setItem("photos-2026-9", p), fs.readFileSync(PHOTOS, "utf8"));
  await page.goto(URL); await page.waitForSelector(".viewport"); await page.waitForTimeout(3000);

  // what the demo put there, as the app itself sees it
  const snapshot = () => page.evaluate(async () => {
    const { warm, photosNow } = await import("/life-tracker/src/photos.ts");
    await warm("photos-2026-9");
    const j = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } };
    return { values: j("values-2026-9"), notes: j("notes-2026-9"), photos: photosNow("photos-2026-9"), columns: j("columns") };
  });
  const before = await snapshot();
  console.log("foer:", Object.keys(before.values ?? {}).length, "vaerdier,", Object.keys(before.notes ?? {}).length, "tekstfelter,", Object.keys(before.photos ?? {}).length, "billeder");

  // 1. save a copy
  await page.click(".hand-pick");
  await page.waitForSelector(".sheet");
  await page.screenshot({ path: "screenshots/settings-sheet.png" });
  const dl = page.waitForEvent("download");
  await page.click("text=Gem en kopi");
  const file = await dl;
  const path = "screenshots/backup.json";
  await file.saveAs(path);
  const saved = JSON.parse(fs.readFileSync(path, "utf8"));
  console.log("1. kopi gemt:", file.suggestedFilename(), Math.round(fs.statSync(path).size / 1024), "kB,", Object.keys(saved.months).length, "maaned(er)");

  // 2. wipe the month (the button asks twice)
  await page.click("text=/^Ryd /");
  await page.click("text=/^Tryk igen/");
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const wiped = await snapshot();
  const empty = !Object.keys(wiped.values ?? {}).length && !Object.keys(wiped.notes ?? {}).length && !Object.keys(wiped.photos ?? {}).length;
  console.log("2. efter ryd + genindlaesning:", Object.keys(wiped.values ?? {}).length, "vaerdier,", Object.keys(wiped.notes ?? {}).length, "tekstfelter,", Object.keys(wiped.photos ?? {}).length, "billeder", empty ? "(tom, og demoen kom ikke igen)" : "IKKE TOM");
  await page.screenshot({ path: "screenshots/wiped.png" });

  // 3. read the copy back
  await page.click(".hand-pick");
  await page.waitForSelector(".sheet");
  await page.setInputFiles('input[accept="application/json,.json"]', path);
  await page.waitForTimeout(2500);
  await page.waitForSelector(".viewport"); await page.waitForTimeout(2500);
  const after = await snapshot();
  console.log("3. efter import:", Object.keys(after.values ?? {}).length, "vaerdier,", Object.keys(after.notes ?? {}).length, "tekstfelter,", Object.keys(after.photos ?? {}).length, "billeder");
  await page.screenshot({ path: "screenshots/restored.png" });

  const same = (a, b) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  const ok = empty && same(before.values, after.values) && same(before.notes, after.notes) && same(before.photos, after.photos) && same(before.columns, after.columns);
  for (const k of ["values", "notes", "photos", "columns"]) if (!same(before[k], after[k])) console.log("  AFVIGER:", k);
  console.log(ok ? "\nOK: kopien er komplet, ryd virker, og alt kom uaendret tilbage" : "\nFEJL");
  await browser.close();
  if (!ok) process.exitCode = 1;
});
