import { useLayoutEffect, useRef } from "react";
import scene from "./scene.json";
import { LAYERS, layerRect, type Rect } from "./layout";

export type LayerEl = { el: HTMLElement; rect: Rect; depth: number };
declare const __BUILD__: string; // set in vite.config.ts
/** Layer files keep their names between builds, so the build stamp busts the phone's cache of the old ones. */
export const url = (file: string) => `${import.meta.env.BASE_URL}${scene.path}${file}?v=${encodeURIComponent(__BUILD__)}`;
const TABLE_AT = LAYERS.findIndex((l) => l.isTablePlane);
export const TABLE_LAYER = LAYERS[TABLE_AT];
/** Layers behind the table (wall, view, window): composited canvases before the tilt, each placed by its depth. */
export const FAR = LAYERS.slice(0, TABLE_AT);
/** What stands on the table and in front of it (decor, chair): drawn into the room canvas by BookCanvas. Only these
 *  two kinds of element are used for the room – iOS Safari crashed ("a problem repeatedly occurred") with more
 *  canvases or images inside or after the 3D tilt, whatever their size. */
export const NEAR = LAYERS.slice(TABLE_AT + 1);

const images = new Map<string, HTMLImageElement>();
/** The images the canvases draw from (the table tiles, the flat table for its legs, the near layers); `onLoad` after each. */
export function loadImages(onLoad: () => void) {
  for (const f of [...(TABLE_LAYER.flat ?? []).map((t) => t.file), TABLE_LAYER.id + ".webp", ...NEAR.map((l) => l.id + ".webp")]) {
    if (images.has(f)) continue;
    const img = new Image(); images.set(f, img); img.onload = onLoad; img.src = url(f);
  }
}
export const image = (file: string) => { const i = images.get(file); return i && i.complete && i.naturalWidth ? i : null; };

/** A far layer as a canvas holding its bitmap (an <img> in the same place also crashed iOS Safari). */
function LayerCanvas({ file, style, onEl }: { file: string; style: React.CSSProperties; onEl: (el: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current!, img = new Image();
    img.onload = () => { cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext("2d")!.drawImage(img, 0, 0); };
    img.src = url(file);
    return () => { img.onload = null; };
  }, [file]);
  return <canvas ref={(el) => { (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = el; onEl(el); }} className="layer" style={style} />;
}

/** The far layers, in world units; BookCanvas sets their transform every frame from the camera. */
export function SceneLayers({ register }: { register: (id: string, l: LayerEl | null) => void }) {
  return (
    <div className="scene2d">
      {FAR.map((l) => { const rect = layerRect(l); return <LayerCanvas key={l.id} file={l.id + ".webp"} style={{ width: rect.w, height: rect.h }} onEl={(el) => register(l.id, el && { el, rect, depth: l.depth })} />; })}
    </div>
  );
}
