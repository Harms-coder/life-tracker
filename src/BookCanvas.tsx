import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { BG, BOOK_H, BOOK_T, BOOK_W, LAYERS, layerRect, PX, TABLE, type Rect } from "./layout";
import { ANCHOR, CAM, camera, layerTransform, placement, projector, type Ident } from "./camera";
import { image, loadImages, NEAR, SceneLayers, TABLE_LAYER, type LayerEl } from "./Scene";
import type { Plane, View } from "./draw";

const TAP_SLOP = 8;
const MARGIN = 0.35; // canvas overdraw around the viewport, share of its size
const PIXEL_BUDGET = 9e6; // max canvas pixels (iOS is strict about big canvases)
const ROOM_BUDGET = 6e6; // the room canvas
const LIVE_BUDGET = 2e6; // budget for the quick redraws in the middle of a pinch
const LIVE_RATIO = 1.15; // redraw mid-pinch once the bitmap is stretched this much
const LIVE_GAP = 120; // ms between such redraws
const NOBOOK = import.meta.env.DEV && new URLSearchParams(location.search).has("nobook"); // test: the scene alone

export type BookCanvasHandle = { redraw: () => void };

/**
 * The room is depth layers (scene.json) in the same world coordinates as the book, each scaled and panned by its
 * depth about the book's centre (camera.ts) – far things barely move, so zooming feels like a camera moving in over
 * the table. Only two kinds of element are used, the ones that work on iPhone (anything else inside or after the 3D
 * tilt crashed Safari): the layers behind the table are composited canvases before the tilt; everything else is drawn
 * into two bitmaps – the book canvas inside the tilt (the near table top, the shadow, the book) and the room canvas
 * before it (the far table top projected as the tilt would, the legs, what stands on and in front of the table).
 * While a finger is down (or the glide runs) everything is only transformed – cheap. When the hands are off, both
 * bitmaps are drawn again, crisp, once; in the middle of a pinch a quick, coarser redraw keeps things in place.
 * Zoomed out, the book and the table top under it tip back together into the photo's perspective, the book lifted a
 * little with its page block standing under it; zoomed in, you look straight down and everything is flat.
 */
export const BookCanvas = forwardRef<BookCanvasHandle, {
  width: number; height: number;
  draw: (ctx: CanvasRenderingContext2D, view: View, plane: Plane) => void;
  onTap: (wx: number, wy: number) => void;
}>(function BookCanvas({ width, height, draw, onTap }, ref) {
  const view = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const tilt2 = useRef<HTMLDivElement>(null); // the faces get their own 3D context: Chrome mis-sorts them against the big canvases
  const gesture = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const world3d = useRef<HTMLDivElement>(null);
  const bookCanvas = useRef<HTMLCanvasElement>(null);
  const roomCanvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef(new Map<string, LayerEl>()); // the far layers' canvases, placed in paint()
  const t = useRef<View>({ x: 0, y: 0, s: 0 }); // live transform; s=0 => snapped to fit on first layout
  const committed = useRef<View>({ x: 0, y: 0, s: 1 }); // what the bitmaps were drawn with
  const plane = useRef<Plane>({ x0: 0, y0: 0, w: 1, h: 1, k: 1 });
  const fitScale = useRef(1); // book fills the screen: where the tilt starts to go
  const minScale = useRef(1); // photo just covers the screen: as far out as you can go
  const ident = useRef<Ident>({ s: 1, ax: 0, ay: 0 }); // the identity view (see camera.ts)
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

  const register = (id: string, l: LayerEl | null) => { if (l) layers.current.set(id, l); else layers.current.delete(id); };
  const cam = (v: View = t.current) => camera(v, ident.current, fitScale.current);
  const tiltFor = (s: number) => cam({ ...t.current, s }).tilt;
  const maxScale = () => fitScale.current * CAM.zoomMax;

  /** Pan limits: zoomed out the first (full-frame) layer must cover the screen; looking straight down the screen stays
   *  over the table, never up to the window. In between the limits slide from one to the other, so nothing jumps. */
  const clamp = () => {
    const v = view.current!, { s } = t.current, c = cam(), id = ident.current;
    const wall = layerRect(LAYERS[0]), d = LAYERS[0].depth, S = id.s * (1 + (c.z - 1) * d);
    const axis = (pan: number, size: number, wPos: number, wLen: number, anchor: number, ra: number, tPos: number, tLen: number) => {
      const loW = (size - ra - (wPos - anchor) * S - wLen * S) / d, hiW = (-ra - (wPos - anchor) * S) / d;
      const loT = size - (tPos + tLen) * s + anchor * s - ra, hiT = -tPos * s + anchor * s - ra;
      const lo = loT + (loW - loT) * c.a, hi = hiT + (hiW - hiT) * c.a;
      return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, pan)); // smaller than the screen: centred
    };
    const px = axis(c.px, v.clientWidth, wall.x, wall.w, ANCHOR.x, id.ax, TABLE.x, TABLE.w);
    const py = axis(c.py, v.clientHeight, wall.y, wall.h, ANCHOR.y, id.ay, TABLE.y, TABLE.h);
    t.current = { x: px - ANCHOR.x * s + id.ax, y: py - ANCHOR.y * s + id.ay, s };
  };

  const paint = () => {
    frame.current = 0;
    const { x, y, s } = t.current, cm = committed.current, c = cam(), id = ident.current;
    if (import.meta.env.DEV) { const w = window as unknown as { __view: View; __cam: () => unknown }; w.__view = t.current; w.__cam = () => cam(); } // for the test scripts
    const lift = c.a * s; // z scale: world px -> screen px, fading out as the camera goes overhead
    const gs = s / cm.s;
    gesture.current!.style.transform = room.current!.style.transform = `translate(${x - gs * cm.x}px, ${y - gs * cm.y}px) scale(${gs})`;
    bookCanvas.current!.style.transform = `translateZ(${BOOK_T * lift}px)`;
    world3d.current!.style.transform = `translate(${x}px, ${y}px) scale3d(${s}, ${s}, ${lift})`;
    world3d.current!.style.opacity = `${Math.min(1, c.a / 0.3)}`; // the page block flattens away as the camera goes overhead
    world3d.current!.style.visibility = lift > 0 ? "" : "hidden";
    // The book tips over its own centre, so it stays where it lies on the photo's table at every zoom level. The
    // perspective is a distance in world px, so the projection is the same shape at every zoom and on every screen –
    // that is what lets the table top be unwarped once (tools/scene-assets.py). Perspective inside the transform itself:
    // as a property on the parent Chrome and WebKit apply it differently.
    const origin = `${x + ANCHOR.x * s}px ${y + ANCHOR.y * s}px`;
    for (const el of [tilt.current!, tilt2.current!]) { el.style.transformOrigin = origin; el.style.transform = `perspective(${CAM.perspective * s}px) rotateX(${c.tilt}deg)`; }
    for (const l of layers.current.values()) l.el.style.transform = layerTransform(c, id, l.rect, l.depth);
  };
  const apply = () => { clamp(); if (!frame.current) frame.current = requestAnimationFrame(paint); };

  /** Size a canvas to its plane. Mid-gesture (`reuse`) the existing bitmap is kept whatever its size – no
   *  reallocation – and the plane's resolution is adapted to it; its unused part stays transparent. */
  const fitCanvas = (cv: HTMLCanvasElement, p: Plane, reuse: boolean) => {
    if (reuse && cv.width > 1) p.k = Math.min(p.k, cv.width / p.w, cv.height / p.h);
    else { const pw = Math.round(p.w * p.k), ph = Math.round(p.h * p.k); if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; } }
    cv.style.width = `${cv.width / p.k}px`; cv.style.height = `${cv.height / p.k}px`; cv.style.left = `${p.x0}px`; cv.style.top = `${p.y0}px`;
  };

  /** The book's shadow on the table (world units): long and soft towards the viewer (the light is the window behind), tight underneath. */
  const drawShadow = (ctx: CanvasRenderingContext2D) => {
    for (const [l, tp, w, h, o] of [[BOOK_W / 2 + 10 - BOOK_W * 0.66, BOOK_H / 2 + 230 - BOOK_H * 0.72, BOOK_W * 1.32, BOOK_H * 1.44, 0.55], [BOOK_W / 2 - BOOK_W * 0.56, BOOK_H / 2 + 60 - BOOK_H * 0.6, BOOK_W * 1.12, BOOK_H * 1.2, 0.7]]) {
      ctx.save(); ctx.translate(l + w / 2, tp + h / 2); ctx.scale(w / 2, h / 2); ctx.globalAlpha = o;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, "rgba(20,10,5,1)"); g.addColorStop(0.55, "rgba(20,10,5,.55)"); g.addColorStop(1, "rgba(20,10,5,0)");
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
  };

  /** Draw an image lying in the book's plane into the room canvas, row by row, the way the tilt projects the plane
   *  (rows stay rows; each strip is drawn with its mean width). Looking straight down this is a plain drawImage. */
  const projectImage = (rc: CanvasRenderingContext2D, pr: ReturnType<typeof projector>, img: CanvasImageSource, sw: number, sh: number, r: Rect, v: View, k: number, rp: Plane) => {
    const tl = pr.toScreen(r.x * v.s + v.x, r.y * v.s + v.y), bl = pr.toScreen(r.x * v.s + v.x, (r.y + r.h) * v.s + v.y);
    const n = Math.min(96, Math.max(4, Math.round((((bl?.y ?? 0) - (tl?.y ?? 0)) * k) / 6)));
    for (let i = 0; i < n; i++) {
      const ya = (r.y + (r.h * i) / n) * v.s + v.y, yb = (r.y + (r.h * (i + 1)) / n) * v.s + v.y, xa = r.x * v.s + v.x, xb = (r.x + r.w) * v.s + v.x;
      const a = pr.toScreen(xa, ya), b = pr.toScreen(xb, ya), d = pr.toScreen(xa, yb), e = pr.toScreen(xb, yb);
      if (!a || !b || !d || !e || e.y <= a.y || e.y < rp.y0 || a.y > rp.y0 + rp.h) continue;
      rc.drawImage(img, 0, (sh * i) / n, sw, sh / n, (a.x + d.x) / 2, a.y, (b.x - a.x + e.x - d.x) / 2, e.y - a.y);
    }
  };
  const shadowImg = useRef<{ cv: HTMLCanvasElement; r: Rect } | null>(null);

  /** Draw the bitmaps for the current transform. The expensive step; done when the hands are off. */
  const render = (budget = PIXEL_BUDGET) => {
    const v = view.current!, W = v.clientWidth, H = v.clientHeight;
    const { x, y, s } = t.current, c = cam(), id = ident.current, pr = projector(c, t.current);
    const dpr = window.devicePixelRatio || 1;
    const mw = W * MARGIN, mh = H * MARGIN;
    const vp: Plane = { x0: -mw, y0: -mh, w: W + 2 * mw, h: H + 2 * mh, k: 1 }; // the screen and a margin around it
    // tipped back you see the whole book, so draw all of it (at a resolution the budget allows)
    const p: Plane = c.tilt > 0 ? { x0: x, y0: y, w: BOOK_W * s, h: BOOK_H * s, k: 1 } : { ...vp };
    p.k = Math.min(dpr, Math.sqrt(budget / (p.w * p.h)));
    plane.current = p;
    committed.current = { x, y, s };
    const live = budget < PIXEL_BUDGET;
    // the book: only the part of the plane it covers
    const bx0 = Math.max(p.x0, x), by0 = Math.max(p.y0, y), bx1 = Math.min(p.x0 + p.w, x + BOOK_W * s), by1 = Math.min(p.y0 + p.h, y + BOOK_H * s);
    const bp = { x0: bx0, y0: by0, w: Math.max(1, bx1 - bx0), h: Math.max(1, by1 - by0), k: p.k };
    fitCanvas(bookCanvas.current!, bp, live);
    const ctx = bookCanvas.current!.getContext("2d")!;
    if (NOBOOK) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
    else drawRef.current(ctx, committed.current, bp);

    // The room canvas (screen space): the table top and the book's shadow projected the way the tilt projects the
    // plane, the table's apron and legs flat, then what stands on the table and in front of it, each where its depth
    // puts it. (Not in the tilt: the book's canvas is lifted by its thickness there, the table must not be.)
    const rp: Plane = { ...vp, k: Math.min(dpr, Math.sqrt((live ? LIVE_BUDGET : ROOM_BUDGET) / (vp.w * vp.h))) };
    fitCanvas(roomCanvas.current!, rp, live);
    const rc = roomCanvas.current!.getContext("2d")!;
    rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, rc.canvas.width, rc.canvas.height);
    rc.setTransform(rp.k, 0, 0, rp.k, -rp.x0 * rp.k, -rp.y0 * rp.k); // screen -> canvas
    for (const f of TABLE_LAYER.flat ?? []) { const img = image(f.file); if (img) projectImage(rc, pr, img, img.naturalWidth, img.naturalHeight, f, committed.current, rp.k, rp); }
    if (!NOBOOK) {
      if (!shadowImg.current) { // the shadow, drawn once into a small bitmap in world units
        const r = { x: BOOK_W / 2 + 10 - BOOK_W * 0.66, y: BOOK_H / 2 + 60 - BOOK_H * 0.6, w: BOOK_W * 1.32, h: BOOK_H / 2 + 230 - BOOK_H * 0.72 + BOOK_H * 1.44 - (BOOK_H / 2 + 60 - BOOK_H * 0.6) };
        const cv = document.createElement("canvas"), sc = 512 / r.w; cv.width = 512; cv.height = Math.round(r.h * sc);
        const g = cv.getContext("2d")!; g.setTransform(sc, 0, 0, sc, -r.x * sc, -r.y * sc); drawShadow(g);
        shadowImg.current = { cv, r };
      }
      const sh = shadowImg.current; projectImage(rc, pr, sh.cv, sh.cv.width, sh.cv.height, sh.r, committed.current, rp.k, rp);
    }
    const ti = image(TABLE_LAYER.id + ".webp");
    if (ti) { // apron and legs: the flat table image from the front edge down, at the table's depth
      const r = layerRect(TABLE_LAYER), top = BG.y + TABLE_LAYER.nearEdge! * PX, ratio = ti.naturalHeight / r.h;
      const band = { x: r.x, y: top, w: r.w, h: r.y + r.h - top }, pl = placement(c, id, band, TABLE_LAYER.depth);
      rc.drawImage(ti, 0, (top - r.y) * ratio, ti.naturalWidth, band.h * ratio, pl.x, pl.y, pl.w, pl.h);
    }
    for (const l of NEAR) { const img = image(l.id + ".webp"); if (!img) continue; const pl = placement(c, id, layerRect(l), l.depth); rc.drawImage(img, pl.x, pl.y, pl.w, pl.h); }
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
      const v = view.current!, W = v.clientWidth, H = v.clientHeight;
      const wasAtMin = t.current.s <= minScale.current * 1.01;
      fitScale.current = Math.min(W / width, H / height) * 0.93;
      // the identity view: the photo (the first layer) just covers the screen, centred – as far out as you can go
      const wall = layerRect(LAYERS[0]);
      const s0 = (minScale.current = Math.max(W / wall.w, H / wall.h));
      const x0 = W / 2 - (wall.x + wall.w / 2) * s0, y0 = H / 2 - (wall.y + wall.h / 2) * s0;
      ident.current = { s: s0, ax: ANCHOR.x * s0 + x0, ay: ANCHOR.y * s0 + y0 };
      if (wasAtMin || t.current.s < s0) t.current = { x: x0, y: y0, s: s0 };
      clamp();
      render();
    };
    loadImages(() => { if (t.current.s) render(); });
    fit();
    if (import.meta.env.DEV) { // test scripts: jump to a zoom (relative to the book filling the screen), book centred
      (window as unknown as { __zoomTo: (z: number) => void }).__zoomTo = (z) => {
        const v = view.current!, s = Math.min(maxScale(), Math.max(minScale.current, fitScale.current * z));
        t.current = { x: v.clientWidth / 2 - ANCHOR.x * s, y: v.clientHeight / 2 - ANCHOR.y * s, s };
        clamp(); render();
      };
    }
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
    <div ref={view} className={"viewport" + (NOBOOK ? " nobook" : "")} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      <SceneLayers register={register} />
      <div ref={room} className="room"><canvas ref={roomCanvas} className="book-canvas" /></div>
      <div ref={tilt} className="tilt">
        <div ref={gesture} className="gesture"><canvas ref={bookCanvas} className="book-canvas" /></div>
      </div>
      {/* the page block under the lifted spread: its front, standing on the table up to the cover's front edge. (Side
          faces cannot be seen from where you sit; drawn ones just looked like wings.) Its own 3D context: in the same
          one as the canvases Chrome mis-sorts the planes. */}
      <div ref={tilt2} className="tilt">
        <div ref={world3d} className="world3d">
          <div className="book-face" style={{ left: 2, top: BOOK_H, width: BOOK_W - 4, height: BOOK_T }} />
        </div>
      </div>
    </div>
  );
});
