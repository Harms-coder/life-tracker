import { useLayoutEffect, useRef, type ReactNode } from "react";

const MAX_OVER_FIT = 7; // how far past "whole spread visible" you can zoom in
const TAP_SLOP = 8;

/** Pinch-zoom + pan viewport. Everything inside is `width`x`height` px at scale 1. */
export function Zoom({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const t = useRef({ x: 0, y: 0, s: 0 }); // s=0 => snapped to fit on first layout
  const fitScale = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number; wx: number; wy: number } | null>(null);
  const down = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);

  const apply = () => {
    const v = view.current!;
    const { s } = t.current;
    let { x, y } = t.current;
    const w = width * s, h = height * s;
    // centre when smaller than the viewport, otherwise keep the edges inside it
    x = w <= v.clientWidth ? (v.clientWidth - w) / 2 : Math.min(0, Math.max(v.clientWidth - w, x));
    y = h <= v.clientHeight ? (v.clientHeight - h) / 2 : Math.min(0, Math.max(v.clientHeight - h, y));
    t.current = { x, y, s };
    inner.current!.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };

  const zoomAt = (cx: number, cy: number, s: number) => {
    const min = fitScale.current, max = min * MAX_OVER_FIT;
    s = Math.min(max, Math.max(min, s));
    const { x, y, s: s0 } = t.current;
    // keep the world point under (cx, cy) fixed
    t.current = { x: cx - ((cx - x) / s0) * s, y: cy - ((cy - y) / s0) * s, s };
    apply();
  };

  useLayoutEffect(() => {
    const fit = () => {
      const v = view.current!;
      const wasAtFit = t.current.s <= fitScale.current * 1.01;
      fitScale.current = Math.min(v.clientWidth / width, v.clientHeight / height) * 0.93;
      if (wasAtFit || t.current.s < fitScale.current) t.current.s = fitScale.current;
      apply();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width, height]);

  const onPointerDown = (e: React.PointerEvent) => {
    view.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size === 0) { dragged.current = false; down.current = { x: e.clientX, y: e.clientY }; }
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
      t.current.x += e.clientX - prev.x;
      t.current.y += e.clientY - prev.y;
      apply();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // a finger lifted after a pinch: keep the remaining finger from panning with a jump
    const rest = pointers.current.get([...pointers.current.keys()][0]);
    if (rest) pointers.current.set([...pointers.current.keys()][0], { ...rest });
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
      <div ref={inner} className="zoom-inner" style={{ width, height }}>
        {children}
      </div>
    </div>
  );
}
