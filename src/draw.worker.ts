import { drawScene, type Assets, type Plane, type Scene, type View } from "./draw";
import paperUrl from "./textures/paper.png";
import leatherUrl from "./textures/leather.png";

/**
 * The flat spread is drawn OFF the main thread. BookCanvas sends what to draw and where; this worker draws it
 * into its own OffscreenCanvas and hands the raw pixels back (an ImageBitmap cost the same 47 ms to upload on
 * the iPhone; raw bytes can go up in slices, see bog3d.ts). The main thread is left with the gestures and the (cheap) 3D pass, so a redraw at the end of a pinch
 * no longer freezes the finger tracking (93 ms worst on the phone before this).
 */
/** `overview`: the whole spread at a coarse resolution, drawn on its own canvas, complete (no half-written X). */
/** `photos` rides along on the first render after they changed (data URLs, by slot): they are decoded here,
 *  once, and kept - sending them with every frame would copy half a megabyte per pinch. */
export type RenderRequest = { id: number; view: View; plane: Plane; live: boolean; scene: Scene; now: number; overview?: boolean; photos?: Record<string, string> };
export type RenderReply = { id: number; pixels: ArrayBuffer; w: number; h: number; k: number; overview?: boolean } | { id: number; error: string };

const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext("2d")!;
const overCanvas = new OffscreenCanvas(1, 1);
const assets: Assets = {};
const bitmapOf = (url: string) => fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => undefined);
// the textures are two small local PNGs: wait for them, so the background cache is built once, not once before and once
// after - but not for ever (a stalled fetch must not leave the book blank)
const ready = Promise.race([
  Promise.all([bitmapOf(paperUrl).then((b) => (assets.paper = b)), bitmapOf(leatherUrl).then((b) => (assets.leather = b))]),
  new Promise((r) => setTimeout(r, 3000)),
]);

const port = self as unknown as { postMessage(m: RenderReply, transfer: Transferable[]): void };

const decoded = new Map<string, { url: string; bm: ImageBitmap }>(); // slot -> what is in it now

onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { id, view, plane: p, live, scene, now, overview, photos } = e.data;
  await ready;
  try {
  if (photos) {
    const next: Record<string, ImageBitmap> = {};
    for (const [slot, url] of Object.entries(photos)) {
      const had = decoded.get(slot);
      if (had?.url !== url) { had?.bm.close(); decoded.set(slot, { url, bm: (await bitmapOf(url))! }); }
      const bm = decoded.get(slot)?.bm;
      if (bm) next[slot] = bm;
    }
    for (const [slot, had] of decoded) if (!(slot in photos)) { had.bm.close(); decoded.delete(slot); }
    assets.photos = next;
  }
  if (overview) {
    const w = Math.round(p.w * p.k), h = Math.round(p.h * p.k);
    if (overCanvas.width !== w || overCanvas.height !== h) { overCanvas.width = w; overCanvas.height = h; }
    const oc = overCanvas.getContext("2d")!;
    drawScene(oc, view, p, { ...scene, writing: null }, assets, now);
    const { data } = oc.getImageData(0, 0, w, h);
    port.postMessage({ id, pixels: data.buffer, w, h, k: p.k, overview: true }, [data.buffer]);
    return;
  }
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
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  port.postMessage({ id, pixels: data.buffer, w: canvas.width, h: canvas.height, k: p.k }, [data.buffer]);
  } catch (err) { port.postMessage({ id, error: String(err) }, []); } // the main thread must hear back either way, or it waits for ever
};
