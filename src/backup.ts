/**
 * The whole book in one file, and back again.
 *
 * Why it has to exist: a book on the home screen and the same book in Safari are two SEPARATE stores on iOS -
 * nothing is shared between them - and neither is backed up anywhere. Clear Safari's website data, or lose the
 * phone, and the months are gone. This is both the way to move the book from one to the other and the only
 * copy there is.
 *
 * The numbers, text and columns live in localStorage; the pictures in IndexedDB (see photos.ts). Both go in.
 */
import { photosNow, save as savePhotos, warm as warmPhotos, type Photos } from "./photos";

export type MonthData = { values: Record<string, string>; notes: Record<string, string>; photos: Photos };
export type Backup = { app: "life-tracker"; version: 1; saved: string; columns: unknown; hand: string | null; months: Record<string, MonthData> };

const MONTH_KEY_RE = /^(values|notes|photos)-(\d+)-(\d+)$/;

function readJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

/** Every "<year>-<month>" the book knows about, from either store. */
export async function allMonths(): Promise<string[]> {
  const found = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const m = MONTH_KEY_RE.exec(localStorage.key(i) ?? "");
    if (m) found.add(`${m[2]}-${m[3]}`);
  }
  for (const k of await photoKeys()) {
    const m = MONTH_KEY_RE.exec(k);
    if (m) found.add(`${m[2]}-${m[3]}`);
  }
  return [...found].sort();
}

/** The photo store's keys. Its own module keeps no index, and this is the only caller that needs one. */
async function photoKeys(): Promise<string[]> {
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("life-tracker", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!db.objectStoreNames.contains("photos")) return [];
    return await new Promise<string[]>((res, rej) => {
      const q = db.transaction("photos").objectStore("photos").getAllKeys();
      q.onsuccess = () => res(q.result.map(String));
      q.onerror = () => rej(q.error);
    });
  } catch {
    return []; // no IndexedDB: photos.ts fell back to localStorage, and those keys are already in the scan above
  }
}

export async function collect(): Promise<Backup> {
  const months: Record<string, MonthData> = {};
  for (const m of await allMonths()) {
    await warmPhotos(`photos-${m}`);
    months[m] = { values: readJSON(`values-${m}`, {}), notes: readJSON(`notes-${m}`, {}), photos: photosNow(`photos-${m}`) };
  }
  return { app: "life-tracker", version: 1, saved: new Date().toISOString(), columns: readJSON("columns", null), hand: localStorage.getItem("hand"), months };
}

/** Hand the file to the phone. Sharing first: in an app on the home screen a plain download often goes nowhere,
 *  while the share sheet offers "Save to Files" and works. Falls back to a download on a desktop browser. */
export async function download(): Promise<"delt" | "hentet"> {
  const data = await collect();
  const name = `maanedsbog-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Månedsbog" });
      return "delt";
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e; // the user closed the share sheet: not a failure to report
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "hentet";
}

/** Read a file back in. Everything in it REPLACES the month it belongs to; months not in the file are left be. */
export async function restore(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Backup;
  if (data?.app !== "life-tracker" || !data.months) throw new Error("Det er ikke en månedsbog-fil");
  for (const [m, d] of Object.entries(data.months)) {
    if (d.values && Object.keys(d.values).length) localStorage.setItem(`values-${m}`, JSON.stringify(d.values));
    if (d.notes && Object.keys(d.notes).length) localStorage.setItem(`notes-${m}`, JSON.stringify(d.notes));
    if (d.photos && Object.keys(d.photos).length) await savePhotos(`photos-${m}`, d.photos);
  }
  if (data.columns) localStorage.setItem("columns", JSON.stringify(data.columns));
  if (data.hand) localStorage.setItem("hand", data.hand);
  seeded(); // whatever came in is the book now: the demo must not be laid on top of it on the next start
  return Object.keys(data.months).length;
}

/** Empty one month completely - what the demo months are cleared with when the real book begins. */
export async function clearMonth(year: number, month: number): Promise<void> {
  localStorage.removeItem(`values-${year}-${month}`);
  localStorage.removeItem(`notes-${year}-${month}`);
  await savePhotos(`photos-${year}-${month}`, {});
  seeded();
}

/** Mark the demo as done, so a month cleared (or imported over) does not fill up with it again on the next start. */
function seeded() {
  for (const f of ["demo-seeded-2", "demo-notes-seeded-2", "demo-plans-seeded"]) localStorage.setItem(f, "1");
}
