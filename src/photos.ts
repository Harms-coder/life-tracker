/**
 * The photos live in IndexedDB; the rest of a month (numbers, X's, text, columns) stays in localStorage.
 *
 * Why: localStorage holds about 5 MB of TEXT for the whole site, and a picture has to be spelled out as text
 * to go in at all - a data URL is a third bigger than the file. Seven slots a month at ~56 kB is 400 kB a
 * month, so a year of months fills it, and then the browser simply refuses to save, in the middle of an
 * entry. IndexedDB holds hundreds of MB (Safari gives about a gigabyte) and is meant for exactly this.
 *
 * The drawing stays synchronous: everything read is kept in `cache`, and the book asks the cache, never the
 * database. A leaf being turned needs the neighbouring month's pictures the instant the finger takes hold,
 * which is why the neighbours are read ahead in `warm()`.
 */
export type Photos = Record<string, string>; // slot -> data URL

const DB_NAME = "life-tracker", STORE = "photos", MIGRATED = "photos-in-idb";

const cache = new Map<string, Photos>();
let broken = false; // IndexedDB refused (private mode, no quota): fall back to localStorage and say nothing more

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("blocked"));
  });
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(STORE, mode);
        const q = run(t.objectStore(STORE));
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

/** localStorage, as it was before: still the fallback, and where the old months are read from once. */
function fromLocal(key: string): Photos {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as Photos; } catch { return {}; }
}

/** What is in `key` right now, without waiting - {} until `warm(key)` has been through. */
export function photosNow(key: string): Photos {
  return cache.get(key) ?? (broken ? fromLocal(key) : {});
}

/** Read `key` into the cache. Resolves with what it found, so a caller can re-render once it is there. */
export async function warm(key: string): Promise<Photos> {
  if (cache.has(key)) return cache.get(key)!;
  if (broken) return fromLocal(key);
  try {
    const v = (await request<Photos | undefined>("readonly", (s) => s.get(key))) ?? {};
    cache.set(key, v);
    return v;
  } catch {
    broken = true;
    return fromLocal(key);
  }
}

/** Save, and keep the cache in step. Throws only if there is genuinely nowhere to put it. */
export async function save(key: string, v: Photos): Promise<void> {
  cache.set(key, v);
  if (broken) { localStorage.setItem(key, JSON.stringify(v)); return; }
  try {
    await request("readwrite", (s) => s.put(v, key));
  } catch {
    broken = true;
    localStorage.setItem(key, JSON.stringify(v)); // let the caller's catch report a full quota, as before
  }
}

/** Move whatever is already in localStorage across, once, and free the space it was taking. Runs at start-up;
 *  the pictures of the month on screen are read again straight after, so nothing is lost if this is slow. */
export async function migrate(): Promise<void> {
  if (localStorage.getItem(MIGRATED)) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /^photos-\d+-\d+$/.test(k)) keys.push(k);
  }
  try {
    for (const k of keys) {
      const v = fromLocal(k);
      if (Object.keys(v).length) await request("readwrite", (s) => s.put(v, k));
      cache.set(k, v);
    }
    for (const k of keys) localStorage.removeItem(k); // only once every one of them is safely across
    localStorage.setItem(MIGRATED, "1");
  } catch {
    broken = true; // leave localStorage exactly as it was; the app carries on using it
  }
}
