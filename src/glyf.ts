import lukasGlyffer from "./glyffer.json";
import louiseGlyffer from "./glyffer-louise.json";
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
type Set = Record<string, Variant[]>;
/** The handwritings on the shelf: one filled-in set of template sheets each (tools/glyffer.py). */
export const HANDS = { lukas: "Lukas", louise: "Louise" } as const;
export type Hand = keyof typeof HANDS;
const SETS: Record<Hand, Set> = {
  lukas: lukasGlyffer as unknown as Set,
  louise: louiseGlyffer as unknown as Set,
};
let GLYPHS: Set = SETS.lukas;
/** Which handwriting everything below is drawn in. drawScene sets it from the scene, so the worker follows. */
export const setHand = (h: Hand) => { GLYPHS = SETS[h] ?? SETS.lukas; };

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

/** The text split into what the pen writes one at a time: a character of Lukas' hand, or an emoji (one grapheme,
 *  flags and skin tones and all), which no template sheet has. Emojis are set in the system's emoji font. */
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("da", { granularity: "grapheme" }) : null;
const parts = (str: string): { ch: string; emoji: boolean }[] => {
  const out: { ch: string; emoji: boolean }[] = [];
  for (const ch of segmenter ? Array.from(segmenter.segment(str), (x) => x.segment) : Array.from(str)) {
    if (EMOJI.test(ch)) out.push({ ch, emoji: true });
    else for (const c of ch) out.push({ ch: c, emoji: false }); // a grapheme of plain letters: one glyph each
  }
  return out;
};
const EMOJI_SIZE = 1.05; // of the nominal size: a little taller than the capitals, as emoji sit next to text
const emojiFont = (size: number) => `${size * EMOJI_SIZE}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
const emojiW = new Map<string, number>();
let measurer: OffscreenCanvasRenderingContext2D | null = null;
const emojiWidth = (ch: string, size: number) => {
  const key = ch + size;
  let w = emojiW.get(key);
  if (w === undefined) {
    measurer ??= new OffscreenCanvas(1, 1).getContext("2d")!;
    measurer.font = emojiFont(size);
    w = measurer.measureText(ch).width;
    emojiW.set(key, w);
  }
  return w;
};

export const has = (ch: string) => !!(GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS[ch.toUpperCase()]);

export function widthOfText(str: string, size: number, seed: string) {
  const r = seededRandom(seed);
  const em = size * EM;
  let w = 0;
  for (const { ch, emoji } of parts(str)) {
    if (emoji) w += emojiWidth(ch, size) / em + GAP;
    else w += ch === " " ? SPACE : (pick(ch, r)?.w ?? SPACE) + GAP;
  }
  return w * em;
}

/** Draw `str` with its baseline at y (or centred/topped, matching the canvas baseline names). */
export function drawText(ctx: OffscreenCanvasRenderingContext2D, str: string, x: number, y: number,
                         size: number, seed: string, align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "alphabetic") {
  const em = size * EM;
  const total = widthOfText(str, size, seed);
  let pen = align === "center" ? -total / 2 : align === "right" ? -total : 0;
  const by = baseline === "middle" ? y + (CAP / 2) * em : baseline === "top" ? y + CAP * em : y;
  const r = seededRandom(seed);
  for (const { ch, emoji } of parts(str)) {
    if (emoji) {
      ctx.save();
      ctx.font = emojiFont(size); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      ctx.fillText(ch, x + pen, by);
      ctx.restore();
      pen += emojiWidth(ch, size) + GAP * em;
      continue;
    }
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
 * One character drawn to fill a cell (used for the X's in the table). `progress` 0..1 draws it the way a hand
 * does: the first stroke is pulled from one corner to the other, then the second one crosses it. The glyph is a
 * traced outline, not a pen path, so each stroke is revealed through a narrow band laid along its own line.
 */
export function drawInBox(ctx: OffscreenCanvasRenderingContext2D, ch: string, x: number, y: number,
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
  if (progress < 1) {
    // \ first, then /, each growing from its starting corner
    const hw = 0.17 * Math.min(gw, gh);
    const band = (x1: number, y1: number, x2: number, y2: number, p: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy * hw, ny = ux * hw;
      const ex = x1 + ux * len * p + ux * hw, ey = y1 + uy * len * p + uy * hw;
      const sx = x1 - ux * hw, sy = y1 - uy * hw;
      ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(sx - nx, sy - ny); ctx.closePath();
    };
    ctx.beginPath();
    band(0, 0, gw, gh, Math.min(1, progress * 2));
    if (progress > 0.5) band(gw, 0, 0, gh, progress * 2 - 1);
    ctx.clip();
  }
  ctx.scale(s, s);
  ctx.translate(0, v.t > 0 ? 0 : v.t);
  ctx.scale(v.k, v.k);
  ctx.translate(v.tr[0], v.tr[1]);
  ctx.scale(v.tr[2], v.tr[3]);
  ctx.fill(pathFor(v.d));
  ctx.restore();
  return true;
}
