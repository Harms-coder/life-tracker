import { useLayoutEffect, useRef } from "react";
import scene from "./scene.json";
import { LAYERS, layerRect, type Rect } from "./layout";

export type LayerEl = { el: HTMLElement; rect: Rect; depth: number };
const url = (file: string) => `${import.meta.env.BASE_URL}${scene.path}${file}`;
// To bisect a crash on a phone: ?noplane = the table as a flat 2D layer instead of tilting with the book;
// ?lag=N = only the first N layers of scene.json (0 = the book alone).
const PARAMS = new URLSearchParams(location.search);
const NOPLANE = PARAMS.has("noplane");
const N = PARAMS.has("lag") ? Number(PARAMS.get("lag")) : LAYERS.length;
const TABLE_AT = LAYERS.findIndex((l) => l.isTablePlane);

/** A layer image as a canvas holding its bitmap. Not an <img>: iOS Safari crashed ("a problem repeatedly occurred")
 *  with the layers as images, in particular the huge (in CSS px) table tiles inside the 3D tilt – it can rasterize a
 *  transformed image at its CSS size. A canvas is composited from its own bitmap whatever its CSS size, like the book. */
function LayerCanvas({ file, className, style, onEl }: { file: string; className: string; style: React.CSSProperties; onEl?: (el: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current!, img = new Image();
    img.onload = () => { cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext("2d")!.drawImage(img, 0, 0); };
    img.src = url(file);
    return () => { img.onload = null; };
  }, [file]);
  return <canvas ref={(el) => { (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = el; onEl?.(el); }} className={className} style={style} />;
}

/** The room as depth layers (src/scene.json): each a canvas in world units that BookCanvas places every frame from
 *  the camera. Layers listed before the table plane come before the tilt (book + table top) in the DOM, the ones after
 *  it – things standing on the table, the chair – after it, so they overlap the table's edge as in the photo. */
export function SceneLayers({ near, register }: { near: boolean; register: (id: string, l: LayerEl | null) => void }) {
  return (
    <div className="scene2d">
      {LAYERS.filter((l, i) => i < N && (NOPLANE || !l.flat) && i > TABLE_AT === near).map((l) => {
        const rect = layerRect(l);
        return <LayerCanvas key={l.id} file={l.id + ".webp"} className="layer" style={{ width: rect.w, height: rect.h }}
          onEl={(el) => register(l.id, el && { el, rect, depth: l.depth })} />;
      })}
    </div>
  );
}

/** The table top unwarped into the book's plane (`flat` tiles from tools/scene-assets.py), lying under the book inside
 *  the tilt, so the two tip together: at the identity view the tilt projects it back onto the photo exactly. */
export function TablePlane() {
  const tiles = NOPLANE || TABLE_AT >= N ? [] : LAYERS.find((l) => l.isTablePlane)?.flat ?? [];
  return <>{tiles.map((f) => <LayerCanvas key={f.file} file={f.file} className="plane" style={{ left: f.x, top: f.y, width: f.w, height: f.h }} />)}</>;
}
