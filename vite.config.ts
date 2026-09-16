import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/life-tracker/",
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(new Date().toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" })) },
});
