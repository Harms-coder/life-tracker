import scene from "./scene.json";
import { BG, BOOK_H, BOOK_W, type Rect } from "./layout";
import type { View } from "./draw";

/** The camera, one source of truth for every layer (TASK_scene_depth.md). All numbers come from scene.json. */
export const CAM = scene.camera;
/** The book's centre, in world px: layers zoom, pan and tilt about it. */
export const ANCHOR = { x: BOOK_W / 2, y: BOOK_H / 2 };
/** The identity view – the photo just covers the screen, every layer at scale 1, the scene identical to the photo:
 *  its scale and where the anchor is on screen in it. */
export type Ident = { s: number; ax: number; ay: number };
export type Cam = {
  z: number; // zoom relative to the identity view
  px: number; py: number; // pan: the anchor's screen offset from where it is in the identity view
  t: number; // 0..1: the tilt going away, from the book filling the screen to zoomFlat
  tilt: number; // degrees, the book's plane against the screen
  a: number; // 0..1 share of tiltFar still there (drives the lift of the spread, the page block, the pan limits)
  s: number; // world px -> screen px for the book's plane
};
const tiltFar = (window as unknown as { __tiltMax?: number }).__tiltMax ?? CAM.tiltFar; // tests may override

export function camera(v: View, id: Ident, fit: number): Cam {
  const z = v.s / id.s;
  const t = Math.min(1, Math.max(0, (v.s / fit - 1) / (CAM.zoomFlat - 1)));
  const tilt = tiltFar + (CAM.tiltNear - tiltFar) * (1 - Math.pow(1 - t, 3)); // easeOutCubic
  return { z, px: ANCHOR.x * v.s + v.x - id.ax, py: ANCHOR.y * v.s + v.y - id.ay, t, tilt, a: tiltFar ? tilt / tiltFar : 0, s: v.s };
}

/** Where a layer goes on screen: scaled about the anchor and panned by its depth (the far ones barely move), the ones
 *  behind the book drifting up as the camera dives, so the horizon rises. */
export function placement(c: Cam, id: Ident, r: Rect, depth: number): Rect {
  const S = id.s * (1 + (c.z - 1) * depth);
  const rise = depth < 1 ? c.t * CAM.horizonRise * (1 - depth) * BG.h * c.s : 0;
  return { x: id.ax + (r.x - ANCHOR.x) * S + c.px * depth, y: id.ay + (r.y - ANCHOR.y) * S + c.py * depth - rise, w: r.w * S, h: r.h * S };
}
export function layerTransform(c: Cam, id: Ident, r: Rect, depth: number): string {
  const p = placement(c, id, r, depth);
  return `translate(${p.x}px, ${p.y}px) scale(${p.w / r.w})`;
}

/** The tilt as a projection between the book's plane (screen px before the tilt) and the screen: the same maths as the
 *  CSS `perspective() rotateX()` about the anchor, so what is drawn with it lines up with what the CSS tilts. */
export function projector(c: Cam, v: View) {
  const th = (c.tilt * Math.PI) / 180, sn = Math.sin(th), cs = Math.cos(th), P = CAM.perspective * v.s;
  const ox = v.x + ANCHOR.x * v.s, oy = v.y + ANCHOR.y * v.s;
  return {
    ox, oy,
    /** how much wider the plane is than the screen at a plane row (local y) */
    widen: (ly: number) => 1 - ((ly - oy) * sn) / P,
    toScreen: (lx: number, ly: number) => { const rx = lx - ox, ry = ly - oy, w = 1 - (ry * sn) / P; return w > 1e-3 ? { x: ox + rx / w, y: oy + (ry * cs) / w } : null; },
    toLocal: (sx: number, sy: number) => { const rx = sx - ox, ry = sy - oy, d = cs + (ry * sn) / P; if (d <= 1e-3) return null; const ly = ry / d; return { x: ox + rx * (1 - (ly * sn) / P), y: oy + ly }; },
  };
}
