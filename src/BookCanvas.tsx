import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import { BG, BOOK_H, BOOK_W, LIP, TABLE } from "./layout";
import { ARCH, createBook3D, type Book3D } from "./bog3d";
import type { Plane, Scene, View } from "./draw";
import type { RenderReply, RenderRequest } from "./draw.worker";

const MAX_OVER_FIT = 7; // how far past "whole spread visible" you can zoom in
const TAP_SLOP = 8;
const TILT_MAX = (window as unknown as { __tiltMax?: number }).__tiltMax ?? 58; // degrees when fully zoomed out: matches the photo's camera
const PERSPECTIVE = 700; // px, camera distance for the tilt (smaller = stronger convergence)
const TILT_RANGE = 0.7; // tilt is gone at fit * (1 + TILT_RANGE)
const MARGIN = 0.2; // canvas overdraw around the viewport, share of its size
const PIXEL_BUDGET = 6e6; // max canvas pixels: iOS Safari kills the page ("gentagne problemer") when canvases eat its memory
const LIVE_BUDGET = 2e6; // budget for the quick redraws in the middle of a pinch
const LIVE_RATIO = 1.5; // redraw mid-pinch once the page texture is stretched this much
const LIVE_GAP = 260;   // ms between such redraws
const OVERVIEW_BUDGET = 2.5e6; // pixels for the whole-spread stand-in (~1.3 px per world px, 10 MB)

export type BookCanvasHandle = {
  /** draw the visible part again (the pen-stroke animation calls this every frame) */
  redraw: () => void;
  /** something was written: the visible part AND the whole-spread stand-in are drawn again */
  refresh: () => void;
};

/**
 * The book is one bitmap, drawn by draw.ts in a Worker (draw.worker.ts) and shown through the WebGL mesh; the
 * room (and the table it lies on) is a photo layer in the same world coordinates, panned and zoomed in 2D.
 * While a finger is down (or the glide runs) only the cheap 3D pass runs here. When the hands are off, the
 * visible part is drawn again, crisp, once; in the middle of a pinch a quick, coarser redraw keeps the writing
 * readable. Neither blocks the finger tracking: the drawing happens on the worker's thread.
 * Zoomed out, the book tips back to lie on the photo's table, lifted a little with its page block standing
 * under it; zoomed in, you look straight down and everything is flat.
 */
export const BookCanvas = forwardRef<BookCanvasHandle, {
  width: number; height: number;
  scene: { readonly current: Scene };
  onTap: (wx: number, wy: number) => void;
  backdrop?: ReactNode;
}>(function BookCanvas({ width, height, scene, onTap, backdrop }, ref) {
  const view = useRef<HTMLDivElement>(null);
  const scene2d = useRef<HTMLDivElement>(null); // the room: pans and zooms with the world, never tilts
  const worker = useRef<Worker | null>(null); // draws the flat spread (draw.ts) off the main thread
  const inflight = useRef<{ req: RenderRequest; plane: Plane; at: number } | null>(null);
  const queued = useRef<number | null>(null); // budget of a render asked for while one was in flight
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const book3d = useRef<Book3D | null>(null);
  const t = useRef<View>({ x: 0, y: 0, s: 0 }); // live transform; s=0 => snapped to fit on first layout
  const committed = useRef<View>({ x: 0, y: 0, s: 1 }); // what the book bitmap was drawn with
  const plane = useRef<Plane>({ x0: 0, y0: 0, w: 1, h: 1, k: 1 });
  const fitScale = useRef(1); // book fills the screen: where the tilt starts to go
  const minScale = useRef(1); // photo just covers the screen: as far out as you can go
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number; wx: number; wy: number } | null>(null);
  const down = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);
  const velocity = useRef({ x: 0, y: 0, at: 0 });
  const glide = useRef(0);
  const frame = useRef(0);
  const commitTimer = useRef(0);
  const lastRender = useRef(0);
  const meter = useRef<HTMLDivElement>(null); // ?maal: redraw times in the corner, for reading off the phone
  const worst = useRef({ main: 0, trip: 0 });
  const uploadFrame = useRef({ max: 0, n: 0 }); // ?maal: the slowest frame while a texture went up, and how many it took

  /** 0 (looking straight down) .. 1 (fully tipped back) */
  const tiltAmount = (s: number) => { const out = Math.min(1, Math.max(0, (fitScale.current * (1 + TILT_RANGE) - s) / (fitScale.current * TILT_RANGE))); return out * out; };
  const tiltFor = (s: number) => TILT_MAX * tiltAmount(s);
  const maxScale = () => fitScale.current * MAX_OVER_FIT;

  /** Zoomed out you can pan to the edge of the photo (it always covers the screen); looking straight down only
   *  over the table in it, never up to the window. In between the limit slides from one to the other, so nothing jumps. */
  const clamp = () => {
    const v = view.current!;
    const { s } = t.current, a = tiltAmount(s);
    const mix = (table: number, bg: number) => table + (bg - table) * a;
    const axis = (pos: number, size: number, start: number, len: number) => {
      const lo = size - (start + len) * s, hi = -start * s;
      return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, pos)); // smaller than the screen: centred
    };
    t.current = { x: axis(t.current.x, v.clientWidth, mix(TABLE.x, BG.x), mix(TABLE.w, BG.w)), y: axis(t.current.y, v.clientHeight, mix(TABLE.y, BG.y), mix(TABLE.h, BG.h)), s };
  };

  const paint = () => {
    frame.current = 0;
    const { x, y, s } = t.current;
    if (import.meta.env.DEV) (window as unknown as { __view: View }).__view = t.current; // for the test scripts
    const a = tiltAmount(s);
    scene2d.current!.style.transform = `translate(${x}px, ${y}px) scale(${s})`;

    // The book is redrawn in full every frame: the mesh is a few thousand vertices and the page texture only
    // changes when render() runs, so the tilt and the curve stay exact all the way through a pinch.
    const v = view.current!, dpr = window.devicePixelRatio || 1;
    const uploading = !!book3d.current?.pending();
    if (!v.clientWidth || !v.clientHeight) { if (uploading) frame.current = requestAnimationFrame(paint); return; } // mid-layout: drawing into a zero-sized canvas blanked the book
    const t0 = performance.now();
    book3d.current?.draw({
      w: Math.round(v.clientWidth * dpr), h: Math.round(v.clientHeight * dpr),
      view: { x: x * dpr, y: y * dpr, s: s * dpr },
      origin: [(x + (BOOK_W / 2) * s) * dpr, (y + (BOOK_H / 2) * s) * dpr],
      tilt: (tiltFor(s) * Math.PI) / 180,
      arch: Math.round(ARCH * a), // whole world px: a finer step just rebuilds the mesh for nothing
      flat: a,                    // every part of the height collapses with the tilt, so the page ends up truly flat
      // the sharp top-down table comes in a little ahead of the book flattening, so the photo's far table edge is
      // gone before the unfolding book reaches it
      fade: Math.min(1, (1 - a) * 1.6),
    });
    if (uploading) {
      uploadFrame.current = { max: Math.max(uploadFrame.current.max, performance.now() - t0), n: uploadFrame.current.n + 1 };
      if (book3d.current?.pending()) frame.current = requestAnimationFrame(paint); // the next slice
    }
  };
  const apply = () => { clamp(); if (!frame.current) frame.current = requestAnimationFrame(paint); };

  /** Ask the worker for the bitmaps for the current transform. One request at a time: a second one asked for
   *  while it is out is drawn once it comes back (with the transform of that moment). The reply lands in
   *  `onReply`, and only THEN do `committed`/`plane` move, so the mesh never shows an old texture at a new rect. */
  const render = (budget = PIXEL_BUDGET) => {
    if (!worker.current) return;
    if (inflight.current) { queued.current = budget; return; }
    const v = view.current!;
    const { x, y, s } = t.current;
    const dpr = window.devicePixelRatio || 1;
    const mw = v.clientWidth * MARGIN, mh = v.clientHeight * MARGIN;
    const vp: Plane = { x0: -mw, y0: -mh, w: v.clientWidth + 2 * mw, h: v.clientHeight + 2 * mh, k: 1 }; // the screen and a margin around it
    // tipped back you see the whole book, so draw all of it (at a resolution the budget allows)
    const p: Plane = tiltFor(s) > 0 ? { x0: x, y0: y, w: BOOK_W * s, h: BOOK_H * s, k: 1 } : { ...vp };
    // the cover board sticks LIP out past the book on every side, and a hair more: the mesh samples right up to
    // the edge, and anything not drawn there is filled by smearing the outermost pixel out over it
    if (tiltFor(s) > 0) { const m = (LIP + 4) * s; p.x0 -= m; p.y0 -= m; p.w += 2 * m; p.h += 2 * m; }
    p.k = Math.min(dpr, Math.sqrt(budget / (p.w * p.h)));
    // the book: only the part of the plane it covers
    const bx0 = Math.max(p.x0, x - LIP * s), by0 = Math.max(p.y0, y - LIP * s);
    const bx1 = Math.min(p.x0 + p.w, x + (BOOK_W + LIP) * s), by1 = Math.min(p.y0 + p.h, y + (BOOK_H + LIP) * s);
    const bp: Plane = { x0: bx0, y0: by0, w: Math.max(1, bx1 - bx0), h: Math.max(1, by1 - by0), k: p.k };
    const req: RenderRequest = { id: 0, view: { x, y, s }, plane: bp, live: budget < PIXEL_BUDGET, scene: scene.current, now: performance.now() };
    inflight.current = { req, plane: p, at: performance.now() };
    lastRender.current = performance.now();
    worker.current.postMessage(req);
  };
  /** Whatever happened to the job that was out (drawn, uploaded and shown, or failed), the next one may go. */
  const next = () => { inflight.current = null; if (queued.current !== null) { const b = queued.current; queued.current = null; render(b); } };
  const onReply = (e: MessageEvent<RenderReply>) => {
    if ("error" in e.data) { console.error("draw.worker:", e.data.error); next(); return; }
    if (e.data.overview) { book3d.current?.setOverview(new Uint8Array(e.data.pixels), e.data.w, e.data.h); if (t.current.s) paint(); return; }
    const job = inflight.current;
    const { pixels, w, h, k } = e.data;
    if (!job || !book3d.current) { next(); return; }
    const { x, y, s } = job.req.view, bp = job.req.plane;
    // The bitmap is the WHOLE worker canvas, which mid-pinch is deliberately larger than the part just drawn (it
    // is kept rather than reallocated). Telling the mesh it only covers bp squeezed the spread into a fraction
    // of its size for a frame - the book "went small" while pinching.
    uploadFrame.current = { max: 0, n: 0 };
    book3d.current.setTexture(new Uint8Array(pixels), w, h, { x: (bp.x0 - x) / s, y: (bp.y0 - y) / s, w: w / k / s, h: h / k / s }, () => {
      // the new texture is on screen from this frame: only now do the view it was drawn for and its plane count
      committed.current = job.req.view;
      plane.current = job.plane;
      if (meter.current) {
        const { max, n } = uploadFrame.current, trip = performance.now() - job.at; // n counts the frames before this one
        if (performance.now() > 3000) worst.current = { main: Math.max(worst.current.main, max), trip: Math.max(worst.current.trip, trip) }; // the one-off background build at start-up is not what we are after
        meter.current.textContent = `${job.req.live ? "live" : "fuld"} frame ${Math.round(max)} ms (${n + 1} skiver) · rundtur ${Math.round(trip)} ms · værst ${Math.round(worst.current.main)}/${Math.round(worst.current.trip)} ms · ${w}×${h}`;
      }
      next();
    });
    if (!frame.current) frame.current = requestAnimationFrame(paint); // the first slice goes up with the next frame
  };
  const commit = () => { if (!pointers.current.size && !glide.current) render(); };
  const commitSoon = () => { clearTimeout(commitTimer.current); commitTimer.current = window.setTimeout(commit, 100); };
  /** Mid-gesture: redraw (coarser) when the bitmap is stretched too far or the camera has tipped over. */
  const renderLive = () => {
    const { s } = t.current, cs = committed.current.s, ratio = s / cs;
    // The shader re-projects and re-curves every frame on its own, so the texture is only about sharpness and
    // coverage and can be refreshed at a calm pace. Zooming OUT the old one stays sharp but soon covers only a
    // slice of the spread: the shader discards the page outside it, and the table showed through where the book
    // should be (Lukas' screenshot 17/9). Going from flat to curved is the same case, only sharper: the mesh
    // needs the whole spread at once.
    const tipped = tiltFor(s) > 0 && tiltFor(cs) === 0;
    if ((ratio > LIVE_RATIO || ratio < 1 / LIVE_RATIO || tipped) && performance.now() - lastRender.current > LIVE_GAP) render(LIVE_BUDGET);
  };

  /** A long pan or fling runs off the drawn bitmap: draw again, from where we are now. While one is out this
   *  only queues the next, so a fast pan gets a fresh drawing about as often as the worker can make one. */
  const renderIfOff = () => {
    const c = committed.current, p = plane.current;
    const offX = t.current.x - c.x, offY = t.current.y - c.y;
    if (tiltFor(t.current.s) === 0 && (Math.abs(offX) > -p.x0 - 20 || Math.abs(offY) > -p.y0 - 20)) render();
  };

  /** The whole spread, coarse, outside the one-at-a-time queue: it stands in wherever the page texture does not
   *  reach, so a fast zoom out or pan never shows a blank page while the next drawing is on its way. */
  const renderOverview = () => {
    const w = BOOK_W + 2 * LIP, h = BOOK_H + 2 * LIP; // the whole board, lip and all: that is what v_ouv maps onto
    const k = Math.sqrt(OVERVIEW_BUDGET / (w * h));
    worker.current?.postMessage({ id: 0, view: { x: 0, y: 0, s: 1 }, plane: { x0: -LIP, y0: -LIP, w, h, k }, live: false, scene: scene.current, now: performance.now(), overview: true } satisfies RenderRequest);
  };

  useImperativeHandle(ref, () => ({
    redraw: () => { if (t.current.s) render(); },
    refresh: () => { renderOverview(); if (t.current.s) render(); },
  }), []);

  useLayoutEffect(() => {
    const fit = () => {
      const v = view.current!;
      const wasAtMin = t.current.s <= minScale.current * 1.01;
      fitScale.current = Math.min(v.clientWidth / width, v.clientHeight / height) * 0.93;
      minScale.current = Math.max(v.clientWidth / BG.w, v.clientHeight / BG.h);
      if (wasAtMin || t.current.s < minScale.current) {
        const s = (t.current.s = minScale.current);
        t.current.x = v.clientWidth / 2 - (BG.x + BG.w / 2) * s; // photo centred, the book where it lies in it
        t.current.y = v.clientHeight / 2 - (BG.y + BG.h / 2) * s;
      }
      clamp();
      render();
    };
    if (!worker.current) {
      worker.current = new Worker(new URL("./draw.worker.ts", import.meta.url), { type: "module" });
      worker.current.onmessage = onReply;
      worker.current.onerror = (e) => { console.error("draw.worker:", e.message); next(); };
      renderOverview();
    }
    if (!book3d.current && glCanvas.current) {
      book3d.current = createBook3D(glCanvas.current, PERSPECTIVE * (window.devicePixelRatio || 1));
      if (!book3d.current) console.error("WebGL kunne ikke startes");
      // the room's light over the book comes from the photo itself (the evening one: the scene is locked to it in
      // Backdrop.tsx). Unpacked in full first: on the iPhone, drawing from a big image straight after `onload`
      // gave an empty map, and the book went black wherever it tipped. If it still comes out empty, try again.
      const photo = new Image();
      photo.src = `${import.meta.env.BASE_URL}baggrund/aften.jpg`;
      const light = (tries: number) => photo.decode().catch(() => {}).then(() => {
        if (!book3d.current) return;
        if (book3d.current.setLight(photo, BG)) { if (t.current.s) paint(); }
        else if (tries > 0) setTimeout(() => light(tries - 1), 1500);
      });
      light(3);
      // the sharp table the book lies on when seen from above, as a texture in the same drawing (?bord=0 leaves it out)
      if (!new URLSearchParams(location.search).has("bord")) {
        const table = new Image();
        table.src = `${import.meta.env.BASE_URL}baggrund/bord.webp`;
        table.decode().catch(() => {}).then(() => { book3d.current?.setTable(table); if (t.current.s) paint(); });
      }
    }
    fit();
    const ro = new ResizeObserver(fit); // also catches the first real layout (in dev the CSS can land after mount)
    ro.observe(view.current!);
    return () => {
      worker.current?.terminate(); worker.current = null; inflight.current = null; queued.current = null;
      book3d.current?.dispose(); book3d.current = null; ro.disconnect(); cancelAnimationFrame(glide.current); cancelAnimationFrame(frame.current); clearTimeout(commitTimer.current);
    };
  }, [width, height]);

  const stopGlide = () => { cancelAnimationFrame(glide.current); glide.current = 0; };

  const startGlide = () => {
    let { x: vx, y: vy } = velocity.current;
    if (performance.now() - velocity.current.at > 80) return false; // finger rested before lifting
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last; last = now;
      t.current.x += vx * dt; t.current.y += vy * dt;
      const decay = Math.pow(0.994, dt);
      vx *= decay; vy *= decay;
      apply();
      renderIfOff();
      if (Math.hypot(vx, vy) > 0.02) glide.current = requestAnimationFrame(step);
      else { glide.current = 0; commit(); }
    };
    glide.current = requestAnimationFrame(step);
    return true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try { view.current!.setPointerCapture(e.pointerId); } catch { /* synthetic event in tests */ }
    stopGlide();
    clearTimeout(commitTimer.current);
    if (pointers.current.size === 0) { dragged.current = false; down.current = { x: e.clientX, y: e.clientY }; velocity.current = { x: 0, y: 0, at: 0 }; }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { x, y, s } = t.current;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s, wx: (mx - x) / s, wy: (my - y) / s };
      dragged.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > TAP_SLOP) dragged.current = true;

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const s = Math.min(maxScale(), Math.max(minScale.current, (p.s * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      t.current = { x: mx - p.wx * s, y: my - p.wy * s, s };
      apply();
      renderLive();
    } else if (pointers.current.size === 1) {
      const now = performance.now(), dt = Math.max(1, now - (velocity.current.at || now - 16));
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      velocity.current = { x: 0.8 * (dx / dt) + 0.2 * velocity.current.x, y: 0.8 * (dy / dt) + 0.2 * velocity.current.y, at: now };
      t.current.x += dx;
      t.current.y += dy;
      apply();
      renderIfOff();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinching = pointers.current.size === 2;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      if (!dragged.current) {
        // a tap: only meaningful when looking straight down (the tilt would bend the mapping)
        const { x, y, s } = t.current;
        if (tiltFor(s) === 0) onTap((e.clientX - x) / s, (e.clientY - y) / s);
      }
      const gliding = !wasPinching && dragged.current && startGlide();
      if (!gliding) commitSoon();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = Math.min(maxScale(), Math.max(minScale.current, t.current.s * Math.exp(-e.deltaY * 0.0025)));
    const { x, y, s: s0 } = t.current;
    t.current = { x: e.clientX - ((e.clientX - x) / s0) * s, y: e.clientY - ((e.clientY - y) / s0) * s, s };
    apply();
    renderLive();
    commitSoon();
  };

  return (
    <div ref={view} className="viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      <div ref={scene2d} className="scene2d">
        {backdrop}
      </div>
      {/* the book, and its shadow on the table, drawn as one */}
      <canvas ref={glCanvas} className="book-gl" />
      {new URLSearchParams(location.search).has("maal") && <div ref={meter} className="meter" />}
    </div>
  );
});
