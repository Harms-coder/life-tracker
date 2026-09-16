import scene from "./scene.json";
import { LAYERS, layerRect, type Rect } from "./layout";

export type LayerEl = { el: HTMLImageElement; rect: Rect; depth: number };
const url = (file: string) => `${import.meta.env.BASE_URL}${scene.path}${file}`;

const TABLE_AT = LAYERS.findIndex((l) => l.isTablePlane);
/** The room as depth layers (src/scene.json): each an <img> in world units that BookCanvas places every frame from
 *  the camera. Layers listed before the table plane come before the tilt (book + table top) in the DOM, the ones after
 *  it – things standing on the table, the chair – after it, so they overlap the table's edge as in the photo. */
export function SceneLayers({ near, register }: { near: boolean; register: (id: string, l: LayerEl | null) => void }) {
  return (
    <div className="scene2d">
      {LAYERS.filter((l, i) => !l.flat && i > TABLE_AT === near).map((l) => {
        const rect = layerRect(l);
        return <img key={l.id} className="layer" src={url(l.id + ".webp")} alt="" draggable={false} style={{ width: rect.w, height: rect.h }}
          ref={(el) => { register(l.id, el && { el, rect, depth: l.depth }); }} />;
      })}
    </div>
  );
}

/** The table top unwarped into the book's plane (`flat` tiles from tools/scene-assets.py), lying under the book inside
 *  the tilt, so the two tip together: at the identity view the tilt projects it back onto the photo exactly. */
export function TablePlane() {
  const tiles = LAYERS.find((l) => l.isTablePlane)?.flat ?? [];
  return <>{tiles.map((f) => <img key={f.file} className="plane" src={url(f.file)} alt="" draggable={false} style={{ left: f.x, top: f.y, width: f.w, height: f.h }} />)}</>;
}
