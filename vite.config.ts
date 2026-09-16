import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const build = new Date().toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

export default defineConfig({
  base: "/life-tracker/",
  plugins: [
    react(),
    // version.txt lets the running app see that a newer build is online (GitHub Pages caches index.html for 10 min)
    { name: "version-file", generateBundle() { this.emitFile({ type: "asset", fileName: "version.txt", source: build }); } },
  ],
  define: { __BUILD__: JSON.stringify(build) },
});
