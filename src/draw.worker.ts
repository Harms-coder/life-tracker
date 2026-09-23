import { drawScene, type Assets, type Plane, type Scene, type View } from "./draw";
import paperUrl from "./textures/paper.png";
import leatherUrl from "./textures/leather.png";

/**
 * The flat spread is drawn OFF the main thread. BookCanvas sends what to draw and where; this worker draws it
 * into its own OffscreenCanvas and hands the raw pixels back (an ImageBitmap cost the same 47 ms to upload on
 * the iPhone; raw bytes can go up in slices, see bog3d.ts). The main thread is left with the gestures and the (cheap) 3D pass, so a redraw at the end of a pinch
 * no longer freezes the finger tracking (93 ms worst on the phone before this).
 */
/** `overview`: the whole spread at a coarse resolution, drawn on its own canvas, complete (no half-written X).
 *  `slot` "next": the same, but of the spread on the other side of a leaf being turned - it goes to its own texture,
 *  and its photos are kept apart from the current spread's. */
/** `photos` rides along on the first render after they changed (data URLs, by slot): they are decoded here,
 *  once, and kept - sending them with every frame would copy half a megabyte per pinch. */
/** `slot` "export": the whole spread once, large, for sharing as a picture - on a canvas of its own, let go after. */
export type RenderRequest = { id: number; view: View; plane: Plane; live: boolean; scene: Scene; now: number; overview?: boolean; slot?: "next" | "export"; photos?: Record<string, string> };
export type RenderReply = { id: number; pixels: ArrayBuffer; w: number; h: number; k: number; overview?: boolean; slot?: "next" | "export" } | { id: number; error: string };

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

type Decoded = Map<string, { url: string; bm: ImageBitmap }>; // photo slot -> what is in it now
const sets: Record<"current" | "next", Decoded> = { current: new Map(), next: new Map() };

onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { id, view, plane: p, live, scene, now, overview, slot, photos } = e.data;
  await ready;
  try {
  const set = sets[slot === "next" ? "next" : "current"];
  if (photos) {
    for (const [ps, url] of Object.entries(photos)) {
      const had = set.get(ps);
      if (had?.url !== url) { had?.bm.close(); set.set(ps, { url, bm: (await bitmapOf(url))! }); }
    }
    for (const [ps, had] of set) if (!(ps in photos)) { had.bm.close(); set.delete(ps); }
  }
  assets.photos = Object.fromEntries([...set].map(([ps, { bm }]) => [ps, bm]));
  if (overview) {
    const w = Math.round(p.w * p.k), h = Math.round(p.h * (p.ky ?? p.k));
    const c = slot === "export" ? new OffscreenCanvas(w, h) : overCanvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const oc = c.getContext("2d")!;
    drawScene(oc, view, p, { ...scene, writing: null }, assets, now);
    const { data } = oc.getImageData(0, 0, w, h);
    port.postMessage({ id, pixels: data.buffer, w, h, k: p.k, overview: true, slot }, [data.buffer]);
    return;
  }
  // The bitmap only ever GROWS: shrinking and regrowing it on every zoom meant a fresh 20-30 MB buffer each
  // time, and the iPhone's memory did not keep up. Growing happens here, off the main thread, and only up to the
  // budget - so a mid-gesture (`live`) drawing may grow it too; kept at its old size it stayed soft however often
  // it was redrawn (Lukas). The part beyond the drawn plane stays transparent; the shader shows plain paper there.
  const pw = Math.round(p.w * p.k), ph = Math.round(p.h * p.k);
  if (canvas.width < pw || canvas.height < ph) { canvas.width = Math.max(canvas.width, pw); canvas.height = Math.max(canvas.height, ph); }
  void live;
  drawScene(ctx, view, p, scene, assets, now);
  // Read back only the part just DRAWN, not the whole (grow-only) canvas. Zoomed in, the canvas has grown to
  // the budget and stays there, while the plane - the screen crossed with what is left of the book - can be a
  // sliver once a pan reaches a page edge: 400x3 px drawn, 1638x3498 px (23 MB) copied, handed over and
  // uploaded to the GPU in slices. That was the pan stuttering worse the further in you were (Lukas).
  const uw = Math.min(canvas.width, Math.max(1, pw)), uh = Math.min(canvas.height, Math.max(1, ph));
  const { data } = ctx.getImageData(0, 0, uw, uh);
  port.postMessage({ id, pixels: data.buffer, w: uw, h: uh, k: p.k }, [data.buffer]);
  } catch (err) { port.postMessage({ id, error: String(err) }, []); } // the main thread must hear back either way, or it waits for ever
};
