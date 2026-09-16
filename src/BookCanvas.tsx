import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import { TABLE, TABLE_EDGE_H } from "./layout";
import type { Plane, View } from "./draw";

const MAX_OVER_FIT = 7; // how far past "whole spread visible" you can zoom in
const TAP_SLOP = 8;
const OVERPAN = 0.6; // how far past the content edge you may pan, as a share of the viewport
const TILT_MAX = (window as unknown as { __tiltMax?: number }).__tiltMax ?? 48; // degrees when fully zoomed out
const TILT_RANGE = 0.7; // tilt is gone at fit * (1 + TILT_RANGE)
const MARGIN = 0.35; // canvas overdraw around the viewport, share of its size
const PIXEL_BUDGET = 9e6; // max canvas pixels (iOS is strict about big canvases)

export type BookCanvasHandle = { redraw: () => void };

/**
 * The whole table is one canvas bitmap. While a finger is down (or the glide runs) the bitmap is
 * only transformed – cheap. When the hands are off, the visible part is drawn again, crisp, once.
 * Zoomed out, the scene tips back so you look across the table; zoomed in, you look straight down.
 */
export const BookCanvas = forwardRef<BookCanvasHandle, {
  width: number; height: number;
  draw: (ctx: CanvasRenderingContext2D, view: View, plane: Plane) => void;
  onTap: (wx: number, wy: number) => void;
  backdrop?: ReactNode;
}>(function BookCanvas({ width, height, draw, onTap, backdrop }, ref) {
  const view = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const gesture = useRef<HTMLDivElement>(null);
  const world3d = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const t = useRef<View>({ x: 0, y: 0, s: 0 }); // live transform; s=0 => snapped to fit on first layout
  const committed = useRef<View>({ x: 0, y: 0, s: 1 }); // what the bitmap was drawn with
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
  const drawRef = useRef(draw); drawRef.current = draw;

  const tiltFor = (s: number) => { const out = Math.min(1, Math.max(0, (fitScale.current * (1 + TILT_RANGE) - s) / (fitScale.current * TILT_RANGE))); return TILT_MAX * out * out; };

  const clamp = () => {
    const v = view.current!;
    const { s } = t.current;
    let { x, y } = t.current;
    const w = width * s, h = height * s, mx = v.clientWidth * OVERPAN, my = v.clientHeight * OVERPAN;
    x = Math.min(Math.max(0, (v.clientWidth - w) / 2) + mx, Math.max(Math.min(v.clientWidth - w, (v.clientWidth - w) / 2) - mx, x));
    y = Math.min(Math.max(0, (v.clientHeight - h) / 2) + my, Math.max(Math.min(v.clientHeight - h, (v.clientHeight - h) / 2) - my, y));
    t.current = { x, y, s };
  };

  const paint = () => {
    frame.current = 0;
    const { x, y, s } = t.current, c = committed.current;
    if (import.meta.env.DEV) (window as unknown as { __view: View }).__view = t.current; // for the test scripts
    const gs = s / c.s;
    gesture.current!.style.transform = `translate(${x - gs * c.x}px, ${y - gs * c.y}px) scale(${gs})`;
    world3d.current!.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    tilt.current!.style.transform = `rotateX(${tiltFor(s)}deg)`;
  };
  const apply = () => { clamp(); if (!frame.current) frame.current = requestAnimationFrame(paint); };

  /** Draw the bitmap for the current transform. One expensive step, done when the hands are off. */
  const render = () => {
    const v = view.current!, cv = canvas.current!;
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
    p.k = Math.min(dpr, Math.sqrt(PIXEL_BUDGET / (p.w * p.h)));
    const pw = Math.round(p.w * p.k), ph = Math.round(p.h * p.k);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    cv.style.width = `${p.w}px`; cv.style.height = `${p.h}px`; cv.style.left = `${p.x0}px`; cv.style.top = `${p.y0}px`;
    plane.current = p;
    committed.current = { x, y, s };
    drawRef.current(cv.getContext("2d")!, committed.current, p);
    paint();
  };
  const commit = () => { if (!pointers.current.size && !glide.current) render(); };
  const commitSoon = () => { clearTimeout(commitTimer.current); commitTimer.current = window.setTimeout(commit, 100); };

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
    window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); cancelAnimationFrame(glide.current); cancelAnimationFrame(frame.current); clearTimeout(commitTimer.current); };
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
      const c = committed.current, p = plane.current, v = view.current!;
      const offX = t.current.x - c.x, offY = t.current.y - c.y;
      if (tiltFor(t.current.s) === 0 && (Math.abs(offX) > -p.x0 - 20 || Math.abs(offY) > -p.y0 - 20) && v) render();
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
      const min = fitScale.current, max = min * MAX_OVER_FIT;
      const s = Math.min(max, Math.max(min, (p.s * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      t.current = { x: mx - p.wx * s, y: my - p.wy * s, s };
      apply();
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
    const min = fitScale.current, max = min * MAX_OVER_FIT;
    const s = Math.min(max, Math.max(min, t.current.s * Math.exp(-e.deltaY * 0.0025)));
    const { x, y, s: s0 } = t.current;
    t.current = { x: e.clientX - ((e.clientX - x) / s0) * s, y: e.clientY - ((e.clientY - y) / s0) * s, s };
    apply();
    commitSoon();
  };

  return (
    <div ref={view} className="viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      {backdrop}
      <div ref={tilt} className="tilt">
        <div ref={world3d} className="world3d">
          <div className="table-edge" style={{ left: TABLE.x, top: TABLE.y + TABLE.h, width: TABLE.w, height: TABLE_EDGE_H }} />
        </div>
        <div ref={gesture} className="gesture">
          <canvas ref={canvas} className="book-canvas" />
        </div>
      </div>
    </div>
  );
});
