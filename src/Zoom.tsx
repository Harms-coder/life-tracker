import { useLayoutEffect, useRef, type ReactNode } from "react";

const MAX_OVER_FIT = 7; // how far past "whole spread visible" you can zoom in
const TAP_SLOP = 8;
const OVERPAN = 0.6; // how far past the content edge you may pan, as a share of the viewport
const TILT_MAX = 48; // degrees, when fully zoomed out
const TILT_RANGE = 0.7; // tilt is gone at fit * (1 + TILT_RANGE)

/**
 * Pinch-zoom + pan viewport with inertia. Everything inside is `width`x`height` px at scale 1.
 * Zoomed out, the scene tips back so you look across the table; zoomed in, you look straight down.
 */
export function Zoom({ width, height, children, backdrop }: { width: number; height: number; children: ReactNode; backdrop?: ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const t = useRef({ x: 0, y: 0, s: 0 }); // s=0 => snapped to fit on first layout
  const fitScale = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number; wx: number; wy: number } | null>(null);
  const down = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);
  const velocity = useRef({ x: 0, y: 0, at: 0 });
  const glide = useRef(0);
  const frame = useRef(0);

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
    const { x, y, s } = t.current;
    inner.current!.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    const out = Math.min(1, Math.max(0, (fitScale.current * (1 + TILT_RANGE) - s) / (fitScale.current * TILT_RANGE)));
    tilt.current!.style.transform = `rotateX(${TILT_MAX * out * out}deg)`;
  };
  const apply = () => { clamp(); if (!frame.current) frame.current = requestAnimationFrame(paint); };

  const zoomAt = (cx: number, cy: number, s: number) => {
    const min = fitScale.current, max = min * MAX_OVER_FIT;
    s = Math.min(max, Math.max(min, s));
    const { x, y, s: s0 } = t.current;
    t.current = { x: cx - ((cx - x) / s0) * s, y: cy - ((cy - y) / s0) * s, s }; // keep the point under (cx, cy) fixed
    apply();
  };

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
      apply();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); cancelAnimationFrame(glide.current); cancelAnimationFrame(frame.current); };
  }, [width, height]);

  const stopGlide = () => { cancelAnimationFrame(glide.current); glide.current = 0; };

  const startGlide = () => {
    let { x: vx, y: vy } = velocity.current;
    if (performance.now() - velocity.current.at > 80) return; // finger rested before lifting
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last; last = now;
      t.current.x += vx * dt; t.current.y += vy * dt;
      const decay = Math.pow(0.994, dt);
      vx *= decay; vy *= decay;
      apply();
      if (Math.hypot(vx, vy) > 0.02) glide.current = requestAnimationFrame(step); else glide.current = 0;
    };
    glide.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    view.current!.setPointerCapture(e.pointerId);
    stopGlide();
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
    if (pointers.current.size === 0 && !wasPinching && dragged.current) startGlide();
  };

  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.clientX, e.clientY, t.current.s * Math.exp(-e.deltaY * 0.0025));
  };

  return (
    <div
      ref={view}
      className="viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); } }}
    >
      {backdrop}
      <div ref={tilt} className="tilt">
        <div ref={inner} className="zoom-inner" style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
