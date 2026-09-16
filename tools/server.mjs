// Starts the Vite dev server for a test script (unless one already answers on 5173) and stops it afterwards.
import { spawn } from "node:child_process";
export const URL = "http://localhost:5173/life-tracker/";
export async function withServer(run) {
  let child = null;
  const alive = async () => { try { await fetch(URL); return true; } catch { return false; } };
  if (!(await alive())) {
    child = spawn("npx", ["vite", "--port", "5173", "--strictPort"], { stdio: "ignore", detached: true });
    for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200));
  }
  // warm up: Vite pre-bundles dependencies on the first request and reloads the page while doing so
  for (const f of ["src/main.tsx", "src/App.tsx"]) { try { await fetch(URL + f); } catch { /* fine */ } }
  await new Promise((r) => setTimeout(r, 1000));
  try { await run(); } finally { if (child) process.kill(-child.pid); }
}
