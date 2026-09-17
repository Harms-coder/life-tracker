import glyffer from "./glyffer.json";
import { seededRandom } from "./random";

/**
 * Lukas' own handwriting. tools/glyffer.py cuts every character out of the photographed template sheets and
 * traces it; each variant is stored in units of the template box's HEIGHT, measured from its baseline, so
 * drawing needs one scale factor and nothing else.
 *
 * `size` keeps meaning what it did with the font: EM converts it to the box height that gives the same
 * x-height on the page, so every call site's numbers still hold.
 */
type Variant = { d: string; k: number; w: number; t: number; tr: number[] };
const GLYPHS = glyffer as unknown as Record<string, Variant[]>;

const EM = 1.42;   // box heights per nominal font size
const SPACE = 0.2; // a word space, in box heights
const GAP = 0.035; // between two characters
/** Pen weight added along every outline, in box heights. The template was filled in with a fine pen, so traced
 *  straight the letters read thinner on the page than the X's, which are drawn large in a cell. */
const BOLD = 0.009;
/** Where a capital reaches above the baseline, in box heights: used to place "middle" and "top" text. */
const CAP = 0.36;

const cache = new Map<string, Path2D>();
const pathFor = (d: string) => { let p = cache.get(d); if (!p) { p = new Path2D(d); cache.set(d, p); } return p; };

/** Same character, same cell => same variant: the caller's seed drives the choice. */
const pick = (ch: string, r: () => number): Variant | null => {
  const v = GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS[ch.toUpperCase()];
  return v && v.length ? v[Math.min(v.length - 1, Math.floor(r() * v.length))] : null;
};

export const has = (ch: string) => !!(GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS[ch.toUpperCase()]);

export function widthOfText(str: string, size: number, seed: string) {
  const r = seededRandom(seed);
  let w = 0;
  for (const ch of str) w += ch === " " ? SPACE : (pick(ch, r)?.w ?? SPACE) + GAP;
  return w * size * EM;
}

/** Draw `str` with its baseline at y (or centred/topped, matching the canvas baseline names). */
export function drawText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number,
                         size: number, seed: string, align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "alphabetic") {
  const em = size * EM;
  const total = widthOfText(str, size, seed);
  let pen = align === "center" ? -total / 2 : align === "right" ? -total : 0;
  const by = baseline === "middle" ? y + (CAP / 2) * em : baseline === "top" ? y + CAP * em : y;
  const r = seededRandom(seed);
  for (const ch of str) {
    if (ch === " ") { pen += SPACE * em; continue; }
    const v = pick(ch, r);
    if (!v) { pen += SPACE * em; continue; }
    ctx.save();
    ctx.translate(x + pen, by);
    ctx.scale(em, em);
    ctx.translate(0, -v.t);
    ctx.scale(v.k, v.k);
    ctx.translate(v.tr[0], v.tr[1]);
    ctx.scale(v.tr[2], v.tr[3]);
    const p = pathFor(v.d);
    ctx.fill(p);
    // widen the stroke: one unit here is em * v.k * |sx| screen px after the transforms above
    ctx.lineWidth = BOLD / (v.k * Math.abs(v.tr[2]));
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke(p);
    ctx.restore();
    pen += (v.w + GAP) * em;
  }
  return total;
}

/**
 * One character drawn to fill a cell (used for the X's in the table). `progress` 0..1 reveals it left to
 * right, which is what gives the written-just-now stroke when a box is ticked.
 */
export function drawInBox(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number,
                          w: number, h: number, seed: string, progress = 1) {
  const v = pick(ch, seededRandom(seed));
  if (!v || progress <= 0) return false;
  const r = seededRandom(seed + "p");
  const fill = 0.66 + r() * 0.1;                       // how much of the cell it takes up
  const s = Math.min((w * fill) / v.w, (h * fill) / (v.t > 0 ? v.t : 1));
  const gw = v.w * s, gh = (v.t > 0 ? v.t : 1) * s;
  ctx.save();
  ctx.translate(x + (w - gw) / 2 + (r() - 0.5) * w * 0.07, y + (h - gh) / 2 + (r() - 0.5) * h * 0.07);
  ctx.rotate((r() - 0.5) * 0.14);
  if (progress < 1) { ctx.beginPath(); ctx.rect(-gw * 0.2, -gh * 0.3, gw * (0.4 + 1.2 * progress), gh * 1.6); ctx.clip(); }
  ctx.scale(s, s);
  ctx.translate(0, v.t > 0 ? 0 : v.t);
  ctx.scale(v.k, v.k);
  ctx.translate(v.tr[0], v.tr[1]);
  ctx.scale(v.tr[2], v.tr[3]);
  ctx.fill(pathFor(v.d));
  ctx.restore();
  return true;
}
