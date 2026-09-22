import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import { BG, BOOK_H, BOOK_W, COVER, LIP, PAGE_H, PAGE_W, TABLE } from "./layout";
import { ARCH, createBook3D, type Book3D, type Turn } from "./bog3d";
import type { Plane, Scene, View } from "./draw";
import type { RenderReply, RenderRequest } from "./draw.worker";

const MAX_OVER_FIT = 7; // how far past "whole spread visible" you can zoom in
const TAP_SLOP = 8;
/** Before a finger that landed on something draggable is allowed to drag it, it has to show that is what it
 *  means: move at least this far, sideways rather than up and down, and SLOWLY. A finger sweeping across the
 *  page to pan crosses that distance in a few ms and takes the dots it passes with it (Lukas). */
const SCRUB_SLOP = 10;
const SCRUB_SPEED = 0.35; // px per ms, averaged from the moment the finger went down
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
  /** the photos in the book changed: they go to the worker with the next drawing */
  setPhotos: (photos: Record<string, string>) => void;
  /** turn a leaf: +1 forward (the right page swings over), -1 back - where you are, zoomed in or not. */
  turn: (dir: 1 | -1) => void;
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
  /** Does anything at this world point follow the finger? Return a handler and the drag moves that instead of
   *  the book (the dot in the sleep graph); return null and the finger pans as usual. */
  grab?: (wx: number, wy: number) => ((wx: number, wy: number) => void) | null;
  /** The spread on the other side of a leaf turned in `dir`: what it shows, and its photos (data URLs by slot). */
  otherScene: (dir: 1 | -1) => { scene: Scene; photos: Record<string, string> };
  /** A leaf has landed: the book is open at the spread `otherScene(dir)` described. */
  onTurned: (dir: 1 | -1) => void;
  backdrop?: ReactNode;
}>(function BookCanvas({ width, height, scene, onTap, grab, otherScene, onTurned, backdrop }, ref) {
  const props = useRef({ otherScene, onTurned }); // read at call time: the imperative handle and the animations outlive one render
  props.current = { otherScene, onTurned };
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
  const down = useRef({ x: 0, y: 0, at: 0 });
  const dragged = useRef(false);
  const scrub = useRef<((wx: number, wy: number) => void) | null>(null); // set while a finger is dragging something on the page
  const pending = useRef<((wx: number, wy: number) => void) | null>(null); // it landed on something; waiting to see if it drags or pans
  const velocity = useRef({ x: 0, y: 0, at: 0 });
  const glide = useRef(0);
  const frame = useRef(0);
  const commitTimer = useRef(0);
  const overTimer = useRef(0);
  const photos = useRef<Record<string, string> | null>(null); // waiting to be sent to the worker
  const lastRender = useRef(0);
  const meter = useRef<HTMLDivElement>(null); // ?maal: redraw times in the corner, for reading off the phone
  const worst = useRef({ main: 0, trip: 0 });
  const uploadFrame = useRef({ max: 0, n: 0 }); // ?maal: the slowest frame while a texture went up, and how many it took
  /** A leaf mid-turn. `anim` while it settles on its own, `drag` while a finger holds its fore-edge. */
  const turn = useRef<(Turn & { anim: number; drag: { wx0: number } | null }) | null>(null);
  const turnGrab = useRef<{ wx: number; fy: number } | null>(null); // the finger went down on the tipped-back book: a sideways drag turns a leaf
  const awaitNext = useRef(0); // an arrow turn waits (briefly) for the other spread's picture before the leaf goes
  /** Bumped when the book opens at another spread: drawings asked for before that show the old month and are dropped. */
  const gen = useRef(0);

  /** 0 (looking straight down) .. 1 (fully tipped back) */
  const tiltAmount = (s: number) => { const out = Math.min(1, Math.max(0, (fitScale.current * (1 + TILT_RANGE) - s) / (fitScale.current * TILT_RANGE))); return out * out; };
  const tiltFor = (s: number) => TILT_MAX * tiltAmount(s);
  const maxScale = () => fitScale.current * MAX_OVER_FIT;
  /** Something is moving on its own (a leaf settling, or about to): fingers wait. */
  const busy = () => !!(turn.current?.anim || awaitNext.current);

  /** Screen point -> world point on the book's plane, tilt and all: the inverse of the vertex shader's projection
   *  at height 0 (CSS px throughout; the shader works in device px, but the ratio is the same). */
  const unproject = (sx: number, sy: number) => {
    const { x, y, s } = t.current;
    const th = (tiltFor(s) * Math.PI) / 180, P = PERSPECTIVE;
    const ox = x + (BOOK_W / 2) * s, oy = y + (BOOK_H / 2) * s;
    const q = sy - oy;
    const dy = (q * P) / (Math.cos(th) * P + q * Math.sin(th));
    const dx = (sx - ox) * (P - dy * Math.sin(th)) / P;
    return { wx: (ox + dx - x) / s, wy: (oy + dy - y) / s };
  };

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
      turn: turn.current,
      // Looking straight down, everything of the book lies at height 0 and the camera distance changes nothing -
      // except for a leaf being turned, which would rise up into the camera. So the camera stands back for it:
      // the leaf then comes up to at most twice its size. Tipped back, the distance is what it always was.
      persp: Math.max(PERSPECTIVE * dpr, (1 - a) * 2.2 * PAGE_W * s * dpr),
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
    const req: RenderRequest = { id: gen.current, view: { x, y, s }, plane: bp, live: budget < PIXEL_BUDGET, scene: scene.current, now: performance.now() };
    if (photos.current) { req.photos = photos.current; photos.current = null; }
    inflight.current = { req, plane: p, at: performance.now() };
    lastRender.current = performance.now();
    worker.current.postMessage(req);
  };
  /** Whatever happened to the job that was out (drawn, uploaded and shown, or failed), the next one may go. */
  const next = () => { inflight.current = null; if (queued.current !== null) { const b = queued.current; queued.current = null; render(b); } };
  const onReply = (e: MessageEvent<RenderReply>) => {
    if ("error" in e.data) { console.error("draw.worker:", e.data.error); next(); return; }
    const stale = e.data.id !== gen.current; // asked for before the book turned to another spread: it shows the old month
    if (e.data.overview) {
      if (stale || !book3d.current) return;
      const px = new Uint8Array(e.data.pixels);
      if (e.data.slot === "next") {
        book3d.current.setNext(px, e.data.w, e.data.h);
        if (awaitNext.current) { clearTimeout(awaitNext.current); awaitNext.current = 0; if (turn.current && !turn.current.anim) settleTurn(1); } // the arrow waits for this
      } else book3d.current.setOverview(px, e.data.w, e.data.h);
      if (t.current.s) paint();
      return;
    }
    const job = inflight.current;
    const { pixels, w, h, k } = e.data;
    if (!job || !book3d.current || stale) { next(); return; }
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
  const renderOverview = (of?: { scene: Scene; photos: Record<string, string> }) => {
    const w = BOOK_W + 2 * LIP, h = BOOK_H + 2 * LIP; // the whole board, lip and all: that is what v_ouv maps onto
    const k = Math.sqrt(OVERVIEW_BUDGET / (w * h));
    const req: RenderRequest = { id: gen.current, view: { x: 0, y: 0, s: 1 }, plane: { x0: -LIP, y0: -LIP, w, h, k }, live: false, scene: of?.scene ?? scene.current, now: performance.now(), overview: true };
    if (of) { req.slot = "next"; req.photos = of.photos; }
    worker.current?.postMessage(req);
  };

  /** A leaf starts to turn: ask for the spread on its other side, so its back has something to show. */
  const beginTurn = (dir: 1 | -1, twist: number) => {
    renderOverview(props.current.otherScene(dir));
    turn.current = { dir, p: 0, twist: Math.max(-1, Math.min(1, twist)), anim: 0, drag: null };
  };
  /** The leaf goes the rest of the way on its own: down onto the other page (1), or back where it was (0). */
  const settleTurn = (target: 0 | 1) => {
    const tr = turn.current!;
    tr.drag = null;
    const from = tr.p, dist = Math.abs(target - from), ms = 180 + 620 * dist, t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      // a whole turn eases in and out; a leaf let go mid-air just eases out into its landing
      const e = from === 0 && target === 1 ? u * u * (3 - 2 * u) : 1 - Math.pow(1 - u, 3);
      tr.p = from + (target - from) * e;
      if (u < 1) { tr.anim = requestAnimationFrame(step); apply(); return; }
      tr.anim = 0;
      turn.current = null;
      if (target === 1) {
        gen.current++; // whatever is being drawn now shows the month just left
        book3d.current?.commitTurn();
        props.current.onTurned(tr.dir);
      }
      apply();
    };
    tr.anim = requestAnimationFrame(step);
  };
  if (import.meta.env.DEV) { // for the screenshot scripts: hold a leaf at a given angle, or turn it for real
    const w = window as unknown as { __turnTo: (dir: 1 | -1, p: number) => void; __turn: (dir: 1 | -1) => void; __busy: () => boolean };
    w.__turnTo = (dir, p) => { if (!turn.current) beginTurn(dir, 0.6); turn.current!.p = p; if (p <= 0 || p >= 1) turn.current = null; apply(); };
    w.__turn = (dir) => (ref as React.RefObject<BookCanvasHandle>).current?.turn(dir);
    w.__busy = busy;
  }

  useImperativeHandle(ref, () => ({
    turn: (dir) => {
      if (turn.current || busy() || !t.current.s) return;
      beginTurn(dir, 0.6); // held by the bottom corner, as one does
      // the leaf goes once the other spread's picture is up (its back shows it), or after a moment regardless
      awaitNext.current = window.setTimeout(() => { awaitNext.current = 0; if (turn.current && !turn.current.anim) settleTurn(1); }, 600);
    },
    redraw: () => { if (t.current.s) render(); },
    // The visible part is redrawn at once; the whole-spread stand-in follows once the writing stops. Dragging a
    // dot writes ten times in a second, and redrawing all of it each time is what that would cost.
    setPhotos: (p: Record<string, string>) => { photos.current = p; },
    refresh: () => {
      if (t.current.s) render();
      clearTimeout(overTimer.current);
      overTimer.current = window.setTimeout(renderOverview, 250);
    },
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
      book3d.current?.dispose(); book3d.current = null; ro.disconnect(); clearTimeout(overTimer.current); cancelAnimationFrame(glide.current); cancelAnimationFrame(frame.current); clearTimeout(commitTimer.current);
      cancelAnimationFrame(turn.current?.anim ?? 0); turn.current = null; clearTimeout(awaitNext.current); awaitNext.current = 0;
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
    if (busy()) return; // a leaf is landing or the camera is on its way: it is over in well under a second
    try { view.current!.setPointerCapture(e.pointerId); } catch { /* synthetic event in tests */ }
    stopGlide();
    clearTimeout(commitTimer.current);
    if (pointers.current.size === 0) {
      dragged.current = false; down.current = { x: e.clientX, y: e.clientY, at: performance.now() }; velocity.current = { x: 0, y: 0, at: 0 };
      // like a tap, this only means anything looking straight down - the tilt would bend the mapping
      const { x, y, s } = t.current;
      scrub.current = null;
      pending.current = tiltFor(s) === 0 ? (grab?.((e.clientX - x) / s, (e.clientY - y) / s) ?? null) : null;
      // tipped back, a finger on the book takes hold of a leaf (which one depends on the way it then moves)
      turnGrab.current = null;
      if (tiltFor(s) > 0) {
        const w = unproject(e.clientX, e.clientY);
        if (w.wx > 0 && w.wx < BOOK_W && w.wy > 0 && w.wy < BOOK_H) turnGrab.current = { wx: w.wx, fy: (w.wy - COVER) / PAGE_H };
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      scrub.current = pending.current = turnGrab.current = null; // a second finger means a pinch, whatever the first one was on
      if (turn.current?.drag) settleTurn(turn.current.p > 0.5 ? 1 : 0); // the leaf is let go
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
    } else if (turn.current?.drag && pointers.current.size === 1) {
      // the fore-edge follows the finger's sideways travel: from lying flat, out at PAGE_W from the spine, over
      // to the other page. The book itself stays put.
      const tr = turn.current, w = unproject(e.clientX, e.clientY);
      tr.p = Math.acos(Math.max(-1, Math.min(1, (PAGE_W + tr.dir * (w.wx - tr.drag!.wx0)) / PAGE_W))) / Math.PI;
      track(e, prev);
      apply();
    } else if (turnGrab.current && pointers.current.size === 1) {
      // hold still until the finger has said what it wants: sideways = turn the leaf, up or down = pan
      const tx = e.clientX - down.current.x, ty = e.clientY - down.current.y;
      if (Math.hypot(tx, ty) >= SCRUB_SLOP) {
        const g = turnGrab.current;
        turnGrab.current = null;
        if (Math.abs(tx) > Math.abs(ty)) {
          beginTurn(tx < 0 ? 1 : -1, (g.fy - 0.5) * 1.6); // the corner nearest the finger leads
          turn.current!.drag = { wx0: unproject(e.clientX, e.clientY).wx };
        } else { t.current.x += tx; t.current.y += ty; apply(); renderIfOff(); }
      }
    } else if (pending.current && pointers.current.size === 1) {
      // hold still until the finger has said what it wants. Slow and sideways = drag the dot; anything else =
      // pan, and the movement so far goes to the pan so nothing is lost.
      const tx = e.clientX - down.current.x, ty = e.clientY - down.current.y, d = Math.hypot(tx, ty);
      if (d >= SCRUB_SLOP) {
        const slow = d / Math.max(1, performance.now() - down.current.at) < SCRUB_SPEED;
        if (slow && Math.abs(tx) > Math.abs(ty)) {
          scrub.current = pending.current;
          const { x, y, s } = t.current;
          scrub.current!((e.clientX - x) / s, (e.clientY - y) / s);
        } else {
          t.current.x += tx; t.current.y += ty;
          apply();
          renderIfOff();
        }
        pending.current = null;
      }
    } else if (scrub.current && pointers.current.size === 1) {
      const { x, y, s } = t.current;
      scrub.current((e.clientX - x) / s, (e.clientY - y) / s); // the book stays put: the finger is moving what is on it
    } else if (pointers.current.size === 1) {
      track(e, prev);
      t.current.x += e.clientX - prev.x;
      t.current.y += e.clientY - prev.y;
      apply();
      renderIfOff();
    }
  };
  /** The finger's speed, smoothed: what the glide and a flicked leaf start from. */
  const track = (e: React.PointerEvent, prev: { x: number; y: number }) => {
    const now = performance.now(), dt = Math.max(1, now - (velocity.current.at || now - 16));
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    velocity.current = { x: 0.8 * (dx / dt) + 0.2 * velocity.current.x, y: 0.8 * (dy / dt) + 0.2 * velocity.current.y, at: now };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinching = pointers.current.size === 2;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      turnGrab.current = null;
      if (turn.current?.drag) {
        // let go: a flick decides, otherwise which side it is nearer
        const tr = turn.current, fresh = performance.now() - velocity.current.at < 80;
        const flick = fresh ? -tr.dir * velocity.current.x : 0; // px/ms in the leaf's direction of travel
        settleTurn(flick > 0.3 ? 1 : flick < -0.3 ? 0 : tr.p > 0.5 ? 1 : 0);
        return;
      }
      const scrubbed = !!scrub.current && dragged.current;
      scrub.current = pending.current = null;
      if (!dragged.current) {
        // a tap: only meaningful when looking straight down (the tilt would bend the mapping)
        const { x, y, s } = t.current;
        if (tiltFor(s) === 0) onTap((e.clientX - x) / s, (e.clientY - y) / s);
      }
      const gliding = !wasPinching && !scrubbed && dragged.current && startGlide();
      if (!gliding) commitSoon();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (busy()) return;
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
