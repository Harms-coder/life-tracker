// The book's service worker: keeps every file the book needs on the phone, so it opens without the internet.
// Built into dist/sw.js by vite.config.ts, which fills in the build and the list of files.
const BUILD = __BUILD__;
const FILES = __FILES__;
const CACHE = "maanedsbog-" + BUILD;
const BASE = new URL("./", self.location).pathname; // /life-tracker/

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => BASE + (f === "index.html" ? "" : f)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  // a new build's files replace the old ones: old caches go, so the phone does not collect every build there was
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("maanedsbog-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/** The network, but not for ever: on a weak signal the cached book opens after a few seconds instead of hanging. */
const network = (req, ms) => new Promise((ok, fail) => { const t = setTimeout(fail, ms); fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); fail(e); }); });

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.pathname.endsWith("/version.txt")) return; // "is there a newer build?" must ask the internet, or say nothing
  if (req.mode === "navigate") {
    // the page itself: the newest from the internet when there is one, so updates arrive; otherwise the kept one
    e.respondWith(network(req, 3000).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(BASE, copy)); return r; })
      .catch(() => caches.match(BASE, { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  const own = url.origin === self.location.origin && url.pathname.startsWith(BASE);
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!own && !font) return;
  // everything else has a new name with every build (or never changes): kept first, fetched and kept if missing
  // ignoreVary: the script and stylesheet are asked for with an Origin header (crossorigin) and the server says
  // "Vary: Origin", so without it the copies kept at install (asked for without one) never match
  e.respondWith(caches.match(req, { ignoreSearch: own, ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
