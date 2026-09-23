import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

declare const __BUILD__: string;

// iOS Safari: block native pinch-zoom so the book handles it itself.
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Ask the browser to keep the book: without it, storage on a phone short of space may be cleared to make room.
navigator.storage?.persist?.().catch(() => {});
// Keep the book's files on the phone so it opens without the internet (sw-template.js). Not in dev: it would serve
// yesterday's code.
if (!import.meta.env.DEV && "serviceWorker" in navigator) navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", { scope: import.meta.env.BASE_URL }).catch(() => {});

// Reload once when a newer build is online. GitHub Pages tells the phone to keep index.html for
// 10 min; version.txt is fetched past that cache, and index.html is re-fetched before reloading.
async function checkForUpdate() {
  if (import.meta.env.DEV) return;
  try {
    const online = (await (await fetch(import.meta.env.BASE_URL + "version.txt", { cache: "no-store" })).text()).trim();
    if (online === __BUILD__ || sessionStorage.getItem("reloaded-for") === online) return;
    sessionStorage.setItem("reloaded-for", online);
    await fetch(import.meta.env.BASE_URL, { cache: "reload" });
    location.reload();
  } catch { /* offline: keep what we have */ }
}
checkForUpdate();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
