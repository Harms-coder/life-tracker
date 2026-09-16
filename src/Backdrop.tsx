import { useEffect, useState } from "react";
import { BG } from "./layout";

/**
 * The room behind the book: a generated photo (and, when there is one, a silent looping video) per time
 * of day, in public/baggrund/<tid>.jpg|mp4. Missing files fall back to "aften". The layer is placed in
 * world units (BG) inside the 2D scene layer, so it pans and zooms with the book.
 * Preview a time with ?tid=morgen|middag|aften|nat.
 */
export type Slot = "morgen" | "middag" | "aften" | "nat";
const SLOTS: Slot[] = ["morgen", "middag", "aften", "nat"];
const FALLBACK: Slot = "aften";
export const slotFor = (hour: number): Slot => (hour >= 5 && hour < 10 ? "morgen" : hour >= 10 && hour < 17 ? "middag" : hour >= 17 && hour < 21 ? "aften" : "nat");
const forced = new URLSearchParams(location.search).get("tid") as Slot | null;
const currentSlot = () => (forced && SLOTS.includes(forced) ? forced : slotFor(new Date().getHours()));
const url = (slot: Slot, ext: string) => `${import.meta.env.BASE_URL}baggrund/${slot}.${ext}`;

function Layer({ slot, fadeIn }: { slot: Slot; fadeIn: boolean }) {
  const [img, setImg] = useState(slot); // the slot whose files are actually shown (after fallback)
  const [noVideo, setNoVideo] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setNoVideo(false); setPlaying(false); }, [img]);
  return (
    <div className={"bg-layer" + (fadeIn ? " fade-in" : "")} style={{ left: BG.x, top: BG.y, width: BG.w, height: BG.h }}>
      <img src={url(img, "jpg")} alt="" draggable={false} onError={() => img !== FALLBACK && setImg(FALLBACK)} />
      {!noVideo && (
        <video key={img} src={url(img, "mp4")} muted playsInline autoPlay loop preload="auto" disablePictureInPicture
          style={{ opacity: playing ? 1 : 0 }}
          ref={(v) => { if (v) { v.muted = true; v.defaultMuted = true; v.play().catch(() => {}); } }}
          onPlaying={() => setPlaying(true)} onError={() => setNoVideo(true)} />
      )}
    </div>
  );
}

export function Backdrop() {
  const [layers, setLayers] = useState<Slot[]>(() => [currentSlot()]);
  useEffect(() => {
    const tick = () => setLayers((l) => (l[l.length - 1] === currentSlot() ? l : [...l.slice(-1), currentSlot()]));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  // once the new layer has faded in, drop the old one
  useEffect(() => { if (layers.length > 1) { const id = setTimeout(() => setLayers((l) => l.slice(-1)), 2600); return () => clearTimeout(id); } }, [layers]);
  return <>{layers.map((slot, i) => <Layer key={slot + i} slot={slot} fadeIn={i > 0} />)}</>;
}
