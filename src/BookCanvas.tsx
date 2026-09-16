import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import { BOOK_H, BOOK_T, BOOK_W, TABLE, TABLE_EDGE_H } from "./layout";
import type { Part, Plane, View } from "./draw";

const MAX_OVER_FIT = 7; // how far past "whole spread visible" you can zoom in
const MIN_UNDER_FIT = 0.6; // how far past it you can zoom out (to see the whole table)
const TAP_SLOP = 8;
const TILT_MAX = (window as unknown as { __tiltMax?: number }).__tiltMax ?? 48; // degrees when fully zoomed out
const TILT_RANGE = 0.7; // tilt is gone at fit * (1 + TILT_RANGE)
const MARGIN = 0.35; // canvas overdraw around the viewport, share of its size
const PIXEL_BUDGET = 9e6; // max canvas pixels (iOS is strict about big canvases)
const LIVE_BUDGET = 2e6; // budget for the quick redraws in the middle of a pinch
const LIVE_RATIO = 1.15; // redraw mid-pinch once the bitmap is stretched this much
const LIVE_GAP = 120; // ms between such redraws

export type BookCanvasHandle = { redraw: () => void };

/**
 * The table and the book are two canvas bitmaps. While a finger is down (or the glide runs) they are
 * only transformed – cheap. When the hands are off, the visible part is drawn again, crisp, once; in
 * the middle of a pinch a quick, coarser redraw keeps the writing readable.
 * Zoomed out, the scene tips back so you look across the table and the book is lifted off it, with
 * its page block standing between; zoomed in, you look straight down and everything is flat.
 */
export const BookCanvas = forwardRef<BookCanvasHandle, {
  width: number; height: number;
  draw: (ctx: CanvasRenderingContext2D, view: View, plane: Plane, part: Part) => void;
  onTap: (wx: number, wy: number) => void;
  backdrop?: ReactNode;
}>(function BookCanvas({ width, height, draw, onTap, backdrop }, ref) {
  const view = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const tilt2 = useRef<HTMLDivElement>(null); // the faces get their own 3D context: Chrome mis-sorts them against the big canvases
  const gesture = useRef<HTMLDivElement>(null);
  const tableGesture = useRef<HTMLDivElement>(null);
  const world3d = useRef<HTMLDivElement>(null);
  const tableCanvas = useRef<HTMLCanvasElement>(null);
  const bookCanvas = useRef<HTMLCanvasElement>(null);
  const t = useRef<View>({ x: 0, y: 0, s: 0 }); // live transform; s=0 => snapped to fit on first layout
  const committed = useRef<View>({ x: 0, y: 0, s: 1 }); // what the book bitmap was drawn with
  const tableCommitted = useRef<View>({ x: 0, y: 0, s: 1 }); // same for the table (skipped in quick mid-pinch redraws)
  const plane = useRef<Plane>({ x0: 0, y0: 0, w: 1, h: 1, k: 1 });
  const fitScale = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number; wx: number; wy: number } | null>(null);
  const down = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);
  const velocity = useRef({ x: 0, y: 0, at: 0 });
  const glide = useRef(0);
  const frame = useRef(0);
  const commitTimer = useRef(0);
  const lastRender = useRef(0);
  const drawRef = useRef(draw); drawRef.current = draw;

  /** 0 (looking straight down) .. 1 (fully tipped back) */
  const tiltAmount = (s: number) => { const out = Math.min(1, Math.max(0, (fitScale.current * (1 + TILT_RANGE) - s) / (fitScale.current * TILT_RANGE))); return out * out; };
  const tiltFor = (s: number) => TILT_MAX * tiltAmount(s);
  const minScale = () => fitScale.current * MIN_UNDER_FIT, maxScale = () => fitScale.current * MAX_OVER_FIT;

  /** You can pan to the edge of the table, never past it; a table smaller than the screen sits centred. */
  const clamp = () => {
    const v = view.current!;
    const { s } = t.current;
    const axis = (pos: number, size: number, a: number, len: number) => {
      const lo = size - (a + len) * s, hi = -a * s;
      return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, pos));
    };
    t.current = { x: axis(t.current.x, v.clientWidth, TABLE.x, TABLE.w), y: axis(t.current.y, v.clientHeight, TABLE.y, TABLE.h), s };
  };

  const paint = () => {
    frame.current = 0;
    const { x, y, s } = t.current, c = committed.current;
    if (import.meta.env.DEV) (window as unknown as { __view: View }).__view = t.current; // for the test scripts
    const lift = tiltAmount(s) * s; // z scale: world px -> screen px, fading out as the camera goes overhead
    const follow = (el: HTMLDivElement, c: View) => { const gs = s / c.s; el.style.transform = `translate(${x - gs * c.x}px, ${y - gs * c.y}px) scale(${gs})`; };
    follow(gesture.current!, c); follow(tableGesture.current!, tableCommitted.current);
    bookCanvas.current!.style.transform = `translateZ(${BOOK_T * lift}px)`;
    world3d.current!.style.transform = `translate(${x}px, ${y}px) scale3d(${s}, ${s}, ${lift})`;
    world3d.current!.style.visibility = lift > 0 ? "" : "hidden";
    tilt.current!.style.transform = tilt2.current!.style.transform = `rotateX(${tiltFor(s)}deg)`;
  };
  const apply = () => { clamp(); if (!frame.current) frame.current = requestAnimationFrame(paint); };

  /** Size a canvas to its plane. Mid-gesture (`reuse`) the existing bitmap is kept whatever its size – no
   *  reallocation – and the plane's resolution is adapted to it; its unused part stays transparent. */
  const fitCanvas = (cv: HTMLCanvasElement, p: Plane, reuse: boolean) => {
    if (reuse && cv.width > 1) p.k = Math.min(p.k, cv.width / p.w, cv.height / p.h);
    else { const pw = Math.round(p.w * p.k), ph = Math.round(p.h * p.k); if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; } }
    cv.style.width = `${cv.width / p.k}px`; cv.style.height = `${cv.height / p.k}px`; cv.style.left = `${p.x0}px`; cv.style.top = `${p.y0}px`;
  };

  /** Draw the bitmaps for the current transform. The expensive step; done when the hands are off. */
  const render = (budget = PIXEL_BUDGET) => {
    const v = view.current!;
    const { x, y, s } = t.current;
    const dpr = window.devicePixelRatio || 1;
    let p: Plane;
    if (tiltFor(s) > 0) {
      // tipped back you see the whole table, so draw all of it (at a resolution the budget allows)
      p = { x0: x + TABLE.x * s, y0: y + TABLE.y * s, w: TABLE.w * s, h: TABLE.h * s, k: 1 };
    } else {
      const mw = v.clientWidth * MARGIN, mh = v.clientHeight * MARGIN;
      p = { x0: -mw, y0: -mh, w: v.clientWidth + 2 * mw, h: v.clientHeight + 2 * mh, k: 1 };
    }
    p.k = Math.min(dpr, Math.sqrt(budget / (p.w * p.h)));
    plane.current = p;
    committed.current = { x, y, s };
    const live = budget < PIXEL_BUDGET;
    if (!live) { // the table: wood and shadow, a coarser resolution is plenty; stretching it mid-pinch is fine
      const tp = { ...p, k: p.k / 1.5 };
      tableCommitted.current = committed.current;
      fitCanvas(tableCanvas.current!, tp, false);
      drawRef.current(tableCanvas.current!.getContext("2d")!, committed.current, tp, "table");
    }
    // the book: only the part of the plane it covers
    const bx0 = Math.max(p.x0, x), by0 = Math.max(p.y0, y), bx1 = Math.min(p.x0 + p.w, x + BOOK_W * s), by1 = Math.min(p.y0 + p.h, y + BOOK_H * s);
    const bp = { x0: bx0, y0: by0, w: Math.max(1, bx1 - bx0), h: Math.max(1, by1 - by0), k: p.k };
    fitCanvas(bookCanvas.current!, bp, live);
    drawRef.current(bookCanvas.current!.getContext("2d")!, committed.current, bp, "book");
    lastRender.current = performance.now();
    paint();
  };
  const commit = () => { if (!pointers.current.size && !glide.current) render(); };
  const commitSoon = () => { clearTimeout(commitTimer.current); commitTimer.current = window.setTimeout(commit, 100); };
  /** Mid-gesture: redraw (coarser) when the bitmap is stretched too far or the camera has tipped over. */
  const renderLive = () => {
    const { s } = t.current, cs = committed.current.s, ratio = s / cs;
    const tipped = (tiltFor(s) > 0) !== (tiltFor(cs) > 0);
    if ((ratio > LIVE_RATIO || ratio < 1 / LIVE_RATIO || tipped) && performance.now() - lastRender.current > LIVE_GAP) render(LIVE_BUDGET);
  };

  useImperativeHandle(ref, () => ({ redraw: () => { if (t.current.s) render(); } }), []);

  useLayoutEffect(() => {
    const fit = () => {
      const v = view.current!;
      const wasAtFit = t.current.s <= fitScale.current * 1.01;
      fitScale.current = Math.min(v.clientWidth / width, v.clientHeight / height) * 0.93;
      if (wasAtFit || t.current.s < fitScale.current) {
        t.current.s = fitScale.current;
        t.current.x = (v.clientWidth - width * t.current.s) / 2;
        t.current.y = (v.clientHeight - height * t.current.s) / 2;
      }
      clamp();
      render();
    };
    fit();
    const ro = new ResizeObserver(fit); // also catches the first real layout (in dev the CSS can land after mount)
    ro.observe(view.current!);
    return () => { ro.disconnect(); cancelAnimationFrame(glide.current); cancelAnimationFrame(frame.current); clearTimeout(commitTimer.current); };
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
      // a long fling runs off the drawn bitmap: draw again in the middle of it
      const c = committed.current, p = plane.current;
      const offX = t.current.x - c.x, offY = t.current.y - c.y;
      if (tiltFor(t.current.s) === 0 && (Math.abs(offX) > -p.x0 - 20 || Math.abs(offY) > -p.y0 - 20)) render();
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
      const s = Math.min(maxScale(), Math.max(minScale(), (p.s * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
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
    const s = Math.min(maxScale(), Math.max(minScale(), t.current.s * Math.exp(-e.deltaY * 0.0025)));
    const { x, y, s: s0 } = t.current;
    t.current = { x: e.clientX - ((e.clientX - x) / s0) * s, y: e.clientY - ((e.clientY - y) / s0) * s, s };
    apply();
    renderLive();
    commitSoon();
  };

  const T = TABLE;
  return (
    <div ref={view} className="viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      {backdrop}
      <div ref={tilt} className="tilt">
        <div ref={tableGesture} className="gesture"><canvas ref={tableCanvas} className="book-canvas" /></div>
        <div ref={gesture} className="gesture"><canvas ref={bookCanvas} className="book-canvas" /></div>
      </div>
      {/* faces standing in the room, painted over the canvases (they never overlap them from a viewer above the table) */}
      <div ref={tilt2} className="tilt">
        <div ref={world3d} className="world3d">
          {/* the table top's thickness: front edge and both ends hanging down; the ends only show once you look past them */}
          <div className="table-edge front" style={{ left: T.x, top: T.y + T.h, width: T.w, height: TABLE_EDGE_H }} />
          <div className="table-edge side left" style={{ left: T.x - TABLE_EDGE_H, top: T.y, width: TABLE_EDGE_H, height: T.h }} />
          <div className="table-edge side right" style={{ left: T.x + T.w, top: T.y, width: TABLE_EDGE_H, height: T.h }} />
          {/* the book's page block, standing up from the table under the lifted spread */}
          <div className="book-face" style={{ left: 0, top: BOOK_H, width: BOOK_W, height: BOOK_T }} />
        </div>
      </div>
    </div>
  );
});
