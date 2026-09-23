import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/** Files in public/ the book needs to open: its icons, the evening photo, the table top and the sounds. (The other
 *  times of day are not shown yet - see Backdrop.tsx - so their pictures and videos are left out.) */
const PUBLIC_KEEP = ["index.html", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
  "baggrund/aften.jpg", "baggrund/bord.webp", "lyd/pen.mp3", "lyd/visk.mp3", "lyd/blad.mp3"];

const build = new Date().toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

export default defineConfig({
  base: "/life-tracker/",
  plugins: [
    react(),
    // version.txt lets the running app see that a newer build is online (GitHub Pages caches index.html for 10 min)
    { name: "version-file", generateBundle() { this.emitFile({ type: "asset", fileName: "version.txt", source: build }); } },
    // sw.js: the book opens without the internet (on a plane, in a basement). It is written here because only the
    // build knows the hashed file names to keep; the service worker itself is public/sw-template.js.
    {
      name: "service-worker",
      apply: "build",
      generateBundle(_, bundle) {
        const keep = [...new Set([...Object.keys(bundle), ...PUBLIC_KEEP])].filter((f) => !f.endsWith(".map") && f !== "version.txt"); // addAll fails on a duplicate
        const src = readFileSync("sw-template.js", "utf8").replace("__BUILD__", JSON.stringify(build)).replace("__FILES__", JSON.stringify(keep));
        this.emitFile({ type: "asset", fileName: "sw.js", source: src });
      },
    },
  ],
  define: { __BUILD__: JSON.stringify(build) },
});
