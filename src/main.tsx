import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

declare const __BUILD__: string;

// iOS Safari: block native pinch-zoom so the book handles it itself.
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Reload once when a newer build is online. GitHub Pages tells the phone to keep index.html for
// 10 min; version.txt is fetched past that cache, and index.html is re-fetched before reloading.
async function checkForUpdate() {
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
