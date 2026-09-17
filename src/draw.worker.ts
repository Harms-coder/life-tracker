import { drawScene, type Assets, type Plane, type Scene, type View } from "./draw";
import paperUrl from "./textures/paper.png";
import leatherUrl from "./textures/leather.png";

/**
 * The flat spread is drawn OFF the main thread. BookCanvas sends what to draw and where; this worker draws it
 * into its own OffscreenCanvas and hands the pixels back as an ImageBitmap, which goes straight into the WebGL
 * texture. The main thread is left with the gestures and the (cheap) 3D pass, so a redraw at the end of a pinch
 * no longer freezes the finger tracking (93 ms worst on the phone before this).
 */
export type RenderRequest = { id: number; view: View; plane: Plane; live: boolean; scene: Scene; now: number };
export type RenderReply = { id: number; bitmap: ImageBitmap; k: number } | { id: number; error: string };

const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext("2d")!;
const assets: Assets = {};
const bitmapOf = (url: string) => fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => undefined);
// the textures are two small local PNGs: wait for them, so the background cache is built once, not once before and once
// after - but not for ever (a stalled fetch must not leave the book blank)
const ready = Promise.race([
  Promise.all([bitmapOf(paperUrl).then((b) => (assets.paper = b)), bitmapOf(leatherUrl).then((b) => (assets.leather = b))]),
  new Promise((r) => setTimeout(r, 3000)),
]);

const port = self as unknown as { postMessage(m: RenderReply, transfer: Transferable[]): void };

onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { id, view, plane: p, live, scene, now } = e.data;
  await ready;
  try {
  // The bitmap only ever GROWS: shrinking and regrowing it on every zoom meant a fresh 20-30 MB buffer each
  // time, and the iPhone's memory did not keep up. Mid-gesture (`live`) it is kept whatever its size and the
  // plane's resolution is adapted to it. The part beyond the drawn plane stays transparent; the shader shows
  // plain paper there.
  if (live && canvas.width > 1) p.k = Math.min(p.k, canvas.width / p.w, canvas.height / p.h);
  else {
    const pw = Math.round(p.w * p.k), ph = Math.round(p.h * p.k);
    if (canvas.width < pw || canvas.height < ph) { canvas.width = Math.max(canvas.width, pw); canvas.height = Math.max(canvas.height, ph); }
  }
  drawScene(ctx, view, p, scene, assets, now);
  const bitmap = canvas.transferToImageBitmap();
  port.postMessage({ id, bitmap, k: p.k }, [bitmap]);
  } catch (err) { port.postMessage({ id, error: String(err) }, []); } // the main thread must hear back either way, or it waits for ever
};
