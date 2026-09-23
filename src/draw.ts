import { seededRandom } from "./random";
import { drawInBox, drawText, setHand, widthOfText, vExtentOfText, type Hand } from "./glyf";
import {
  CELL, PAGE_W, PAGE_H, COVER, LIP, BOOK_W, BOOK_H, LEFT_PAGE, RIGHT_PAGE, HEADER_Y, TABLE_LEFT, DAY_COL_W,
  TITLE_BOX_X, TITLE_BOX_Y, GOALS, goalPos, goalTextBox, widthOf, dotX, columnXs, bottomY, noteBoxes, NOTE_LABEL,
  PLAN_Y, PLAN_ROW_H, planBoxes, photoBoxes, photoBoxesRight, wrapText, NOTE_SIZE, NOTE_INDENT,
  type Column, type NoteField, type Rect,
} from "./layout";

/**
 * Everything on the table is drawn here, into one canvas, so the phone only ever moves, scales and
 * tilts a single bitmap. All handwriting goes through `text()` and `handX()` – Lukas' own glyphs
 * are swapped in here later, nowhere else.
 */
export type Scene = {
  monthLabel: string; year: number; month: number; days: number;
  columns: Column[];
  values: Record<string, string>;
  notes: Partial<Record<NoteField, string>>;
  /** What the pen is doing right now, to one value key ("5:loeb") or note field. It first rubs out what was
   *  removed, then writes what was added - and only that: `edits` say which line changed and from which
   *  character, so an added question mark neither rewrites its sentence nor touches the lines around it. */
  writing: {
    key: string; start: number;
    eraseMs: number; writeMs: number;
    /** the text/value as it WAS: drawn while the rubber is still going over it */
    erase?: string;
    /** line = paragraph index (0 for a cell), from = the character the change starts at */
    eraseEdits?: { line: number; from: number }[];
    writeEdits?: { line: number; from: number }[];
  } | null;
  /** whose handwriting the page is written in */
  hand: Hand;
  /** how far a rotated heading's anchor sits from its column's left edge (`?ox=N` while we pick the number) */
  headPos?: number;
  /** today's day of the month, when this spread is the current month: its row gets a pencil mark */
  today?: number;
};
export type Assets = {
  paper?: ImageBitmap; leather?: ImageBitmap;
  /** photos taped into the book, by slot (see photoBoxes in layout.ts) */
  photos?: Record<string, ImageBitmap>;
};
/** world -> plane: plane = world * s + (x, y) */
export type View = { x: number; y: number; s: number };
/** the part of the plane the canvas covers, and its resolution (device px per plane px; `ky` when it differs
 *  vertically - the whole-spread stand-in is drawn into a power-of-two canvas so WebGL can mipmap it) */
export type Plane = { x0: number; y0: number; w: number; h: number; k: number; ky?: number };

/** How far above the line the upright column headers start. "Vægt" floats clear of its line; the rest sat on
 *  theirs (Lukas, twice). Measured on the page: 8 put the first letter ON the line, since the rotated text's
 *  first glyph starts a few px before its anchor. */
const HEADER_LIFT = 14;
/** A rotated heading is written along a VERTICAL baseline, and the letters' feet stood on the black line down
 *  the right-hand side of its column - written on the line (Lukas). The word is now centred between the two
 *  lines instead: its own ink reach above and below the baseline decides where the baseline goes, so a word
 *  with tall letters and one without both end up with the same air on each side. */
const HEAD_MASS = 2.5;
function headAnchor(name: string, seed: string, left: number, w: number) {
  const [up, down] = vExtentOfText(name, 16.5, seed); // SAME seed as the drawing, or it measures other glyphs
  // + HEAD_MASS: a letter's ink sits mostly between the baseline and the x-height, so the middle of its REACH is
  // not where the eye sees its middle. Measured on the page (centre of mass per column) and corrected by that much.
  return left + w / 2 - (up + down) / 2 + HEAD_MASS;
}
const INK = "#1e2233", PAPER = "#efe9d4", GRID = "rgba(120,150,130,.42)";
export const WEEKDAY = "SMTOTFL"; // indexed by Date.getDay()

/** Runs in draw.worker.ts, off the main thread: an OffscreenCanvas, no DOM, no fonts (all text is Lukas' glyphs). */
type Ctx = OffscreenCanvasRenderingContext2D;
/** What the pen is doing to `key` at `now`: nothing, rubbing the old out, or writing the new. */
export type Pen = { erasing: boolean; p: number; edits?: { line: number; from: number }[]; text?: string };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function penOn(scene: Scene, key: string, now: number): Pen | null {
  const w = scene.writing;
  if (!w || w.key !== key) return null;
  const t = now - w.start;
  if (w.eraseMs > 0 && t < w.eraseMs) return { erasing: true, p: clamp01(t / w.eraseMs), edits: w.eraseEdits, text: w.erase };
  if (w.writeMs > 0 && t < w.eraseMs + w.writeMs) return { erasing: false, p: clamp01((t - w.eraseMs) / w.writeMs), edits: w.writeEdits };
  return null;
}
/** How much of `line` (a wrapped line starting at character `off` of its paragraph) the pen is working on, and
 *  from which character of it. A line no edit mentions is simply already on the page. */
function penPart(pen: Pen | null | undefined, para: number, off: number, line: string) {
  if (!pen) return null;
  const e = pen.edits?.find((x) => x.line === para);
  if (pen.edits && !e) return null;
  const from = Math.max(0, Math.min(line.length, (e?.from ?? 0) - off));
  return from >= line.length ? null : { from, chars: line.length - from };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Handwritten text with a small, stable wobble (seeded), so it looks the same every time. */
function text(ctx: Ctx, str: string, x: number, y: number, o: { size: number; seed: string; weight?: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; tilt?: number; rotate?: number; alpha?: number; reveal?: number; from?: number; erase?: boolean }) {
  if (o.reveal !== undefined && !o.erase && o.reveal <= 0 && !o.from) return;
  const r = seededRandom(o.seed);
  ctx.save();
  ctx.translate(x + (r() - 0.5) * 2, y + (r() - 0.5) * 2);
  ctx.rotate(((r() - 0.5) * 5 * (o.tilt ?? 1) * Math.PI) / 180 + (o.rotate ?? 0));
  ctx.fillStyle = INK;
  const draw = () => drawText(ctx, str, 0, 0, o.size, o.seed, o.align ?? "left", o.baseline ?? "alphabetic");
  if (o.reveal === undefined) {
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    draw();
    ctx.restore();
    return;
  }
  // The same seed gives the same glyph picks, so the width of the first `from` characters is exactly where they
  // end on the page: the pen (or the rubber) starts there and the rest of the line never moves.
  const wAll = widthOfText(str, o.size, o.seed);
  const wPre = o.from ? widthOfText(str.slice(0, o.from), o.size, o.seed) : 0;
  const x0 = o.align === "center" ? -wAll / 2 : o.align === "right" ? -wAll : 0;
  const edge = o.erase ? wAll - (wAll - wPre) * o.reveal : wPre + (wAll - wPre) * o.reveal;
  const part = (from: number, to: number, alpha: number) => {
    if (to <= from || alpha <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + from, -o.size * 2.5, to - from, o.size * 5); ctx.clip();
    ctx.globalAlpha = (o.alpha ?? 1) * alpha;
    draw();
    ctx.restore();
  };
  part(-2, edge, 1);
  if (o.erase) part(edge, wAll + 2, 0.22 * (1 - o.reveal)); // where the rubber has been: a fading smudge, then nothing
  ctx.restore();
}

/** A hand-drawn straight line: a few segments with tiny seeded wobble. */
function wobbly(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, seed: string) {
  const r = seededRandom(seed);
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 60));
  ctx.moveTo(x1 + (r() - 0.5), y1 + (r() - 0.5));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    ctx.lineTo(x1 + (x2 - x1) * t + (r() - 0.5) * 1.4, y1 + (y2 - y1) * t + (r() - 0.5) * 1.4);
  }
}
function strokeInk(ctx: Ctx, width: number, alpha = 0.85) {
  ctx.strokeStyle = INK; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.globalAlpha = alpha; ctx.stroke(); ctx.globalAlpha = 1;
}

/** A hand-drawn X in a 20x20 box at (x, y). `progress` 0..1 animates the two pen strokes. */
function handX(ctx: Ctx, x: number, y: number, seed: string, progress = 1) {
  ctx.fillStyle = INK;
  if (drawInBox(ctx, "X", x, y, 20, 20, seed, progress)) return; // Lukas' own X
  const rnd = seededRandom(seed);
  const j = (amount: number) => (rnd() - 0.5) * 2 * amount;
  const stroke = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2 + j(2.2), my = (y1 + y2) / 2 + j(2.2);
    return [x1 + j(1.6), y1 + j(1.6), mx, my, x2 + j(1.6), y2 + j(1.6)];
  };
  const inset = 3.5 + j(1);
  const a = stroke(inset, inset, 20 - inset, 20 - inset);
  const b = stroke(20 - inset, inset + j(1), inset, 20 - inset);
  const rotate = (j(9) * Math.PI) / 180, dx = j(1.5), dy = j(1.5);
  const width = 1.5 + rnd() * 0.7;
  const first = rnd() < 0.5;
  const second = width * (0.9 + rnd() * 0.2);
  ctx.save();
  ctx.translate(x + 10 + dx, y + 10 + dy); ctx.rotate(rotate); ctx.translate(-10, -10);
  const draw = (p: number[], w: number, part: number) => {
    if (part <= 0) return;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[2], p[3], p[4], p[5]);
    if (part < 1) { const len = Math.hypot(p[4] - p[0], p[5] - p[1]) * 1.1; ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - part); }
    strokeInk(ctx, w, 0.88);
    ctx.setLineDash([]);
  };
  draw(first ? a : b, width, Math.min(1, progress * 2));
  draw(first ? b : a, second, Math.min(1, progress * 2 - 1));
  ctx.restore();
}

/** A goal reached gets a star in place of its numbered square (Lukas' picture): drawn the way one draws a star
 *  without lifting the pen - five straight-ish strokes that cross, the number sitting in the pentagon in the
 *  middle - in yellow felt-tip. No two alike: each leans its own way, the corners overshoot or fall short, a stroke
 *  bows a little, and the pen ends past where it began. The lines may cross the number, as they would on paper.
 *  `progress` 0..1 is how far the pen has got. */
function handStar(ctx: Ctx, cx: number, cy: number, size: number, seed: string, progress = 1) {
  const r = seededRandom(seed), j = (a: number) => (r() - 0.5) * 2 * a;
  const R = size * (1.02 + j(0.08)), turn = j(0.16), squash = 1 + j(0.07);
  // the five points, each a little off; drawn in star order (every second point), starting at any of them
  const start = Math.floor(r() * 5);
  const pt = (k: number) => {
    const a = -Math.PI / 2 + turn + (k * 2 * Math.PI) / 5 + j(0.07), rr = R * (1 + j(0.09));
    return [cx + Math.cos(a) * rr * squash, cy + 0.08 * size + (Math.sin(a) * rr) / squash];
  };
  const P = Array.from({ length: 5 }, (_, k) => pt(k));
  const order = [0, 2, 4, 1, 3, 0].map((k) => P[(k + start) % 5]);
  // the last stroke runs on past the first point, as a hand closing a star does
  const last = order[5], prev = order[4], over = 0.08 + r() * 0.14;
  order[5] = [last[0] + (last[0] - prev[0]) * over, last[1] + (last[1] - prev[1]) * over];
  // points along the path; each stroke bows a little, and the pen presses harder in the middle of it
  const pts: number[][] = [];
  for (let s = 0; s < 5; s++) {
    const a = order[s], b = order[s + 1], bow = j(0.05) * size;
    const nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
    for (let k = s ? 1 : 0; k <= 16; k++) {
      const u = k / 16, bend = Math.sin(u * Math.PI) * bow;
      pts.push([a[0] + (b[0] - a[0]) * u + (nx / l) * bend, a[1] + (b[1] - a[1]) * u + (ny / l) * bend, 0.8 + 0.2 * Math.sin(u * Math.PI)]);
    }
  }
  const shown = Math.round(progress * (pts.length - 1)), W = size * (0.075 + j(0.01));
  ctx.save();
  ctx.strokeStyle = "#f4c804"; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let k = 1; k <= shown; k++) {
    // it lifts off thin at the very end
    const tail = Math.min(1, (pts.length - 1 - k) / 10) * 0.6 + 0.4;
    ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.lineWidth = W * pts[k][2] * tail; ctx.stroke();
  }
  ctx.restore();
}
/** Whether goal i shows a star (reached, or being rubbed out right now). */
const starred = (scene: Scene, i: number, now: number) => !!(scene.values[`done-goal${i}`] || penOn(scene, `done-goal${i}`, now)?.erasing);
/** The goal's star, where its numbered square would be. */
function goalStar(ctx: Ctx, scene: Scene, i: number, sq: Rect, now: number) {
  const key = `done-goal${i}`, pen = penOn(scene, key, now);
  if (!starred(scene, i, now)) return;
  const p = pen ? (pen.erasing ? 1 : pen.p) : 1;
  if (pen?.erasing) ctx.globalAlpha = 1 - pen.p; // rubbed out: it fades off the page
  handStar(ctx, sq.x + sq.w / 2, sq.y + sq.h / 2, sq.w, key + sq.w, p);
  ctx.globalAlpha = 1;
}
/** Today's row, shaded in pencil: soft graphite hatching, the way one shades with the side of a pencil. */
function todayMark(ctx: Ctx, y: number, xs: number[], right: number, day: number) {
  const r = seededRandom("today" + day);
  ctx.save();
  ctx.beginPath(); ctx.rect(xs[0], y + 1, right - xs[0], CELL - 2); ctx.clip();
  ctx.strokeStyle = "rgba(72,72,80,.6)"; ctx.lineCap = "round"; ctx.globalAlpha = 0.28; ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let x = xs[0] - CELL; x < right; x += 3.2 + r()) { ctx.moveTo(x, y + CELL + 1); ctx.lineTo(x + 9 + r() * 2, y - 1); }
  ctx.stroke();
  ctx.restore();
}
/** Photo corners holding the picture in, as in an old album (Lukas' picture): a little pocket of cream card over
 *  each corner, standing a hair out past the photo, pressed flat along its fold, and throwing a soft shadow onto
 *  the picture along its inner edge. In the photo's own (centred, turned) coordinates. */
function photoCorners(ctx: Ctx, w: number, h: number, seed: string) {
  const r = seededRandom(seed + "corners"), c = Math.max(14, Math.min(34, Math.min(w, h) * 0.22)), out = 2.5;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = (sx * w) / 2 + sx * out, y = (sy * h) / 2 + sy * out, k = c * (0.95 + r() * 0.1);
    // the corner point, and the two ends of its fold, which lies across the picture
    const A = [x, y], B = [x - sx * k, y], C = [x, y - sy * k];
    const tri = (dx: number, dy: number) => { ctx.beginPath(); ctx.moveTo(A[0] + dx, A[1] + dy); ctx.lineTo(B[0] + dx, B[1] + dy); ctx.lineTo(C[0] + dx, C[1] + dy); ctx.closePath(); };
    ctx.fillStyle = "rgba(30,22,10,.16)"; tri(0.9, 1.5); ctx.fill(); tri(1.8, 3); ctx.fill(); // its shadow on the page
    // the shadow the pocket's edge throws onto the picture, just inside the fold
    const ix = -sx, iy = -sy;
    for (const [d, a, wd] of [[1.2, 0.3, 1.4], [2.6, 0.14, 2.6]]) {
      ctx.beginPath(); ctx.moveTo(B[0] + ix * d * 0.3, B[1] + iy * d); ctx.lineTo(C[0] + ix * d, C[1] + iy * d * 0.3);
      ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.lineWidth = wd; ctx.stroke();
    }
    tri(0, 0);
    // card: shaded from the corner (in its own shadow) to the fold (catching the light)
    const mx = (B[0] + C[0]) / 2, my = (B[1] + C[1]) / 2;
    const g = ctx.createLinearGradient(A[0], A[1], mx, my);
    g.addColorStop(0, "#cfc2a4"); g.addColorStop(0.6, "#e2d7bd"); g.addColorStop(1, "#efe6d0");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(90,72,40,.45)"; ctx.lineWidth = 0.7; ctx.stroke();
    // an embossed rim just inside the two outer edges, and the fold itself as a bright ridge
    const inset = 1.6;
    ctx.beginPath();
    ctx.moveTo(B[0] + sx * 2.6, B[1] - sy * inset); ctx.lineTo(A[0] - sx * inset, A[1] - sy * inset); ctx.lineTo(C[0] - sx * inset, C[1] + sy * 2.6);
    ctx.strokeStyle = "rgba(255,250,235,.45)"; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(B[0] + sx * 0.8, B[1] - sy * 0.5); ctx.lineTo(C[0] - sx * 0.5, C[1] + sy * 0.8);
    ctx.strokeStyle = "rgba(255,253,245,.9)"; ctx.lineWidth = 1.1; ctx.stroke();
  }
}

/** Word-wrap: layout.ts owns it, so the hit-test counts the same rows as the drawing. */
const wrap = (_ctx: Ctx, str: string, width: number, size: number) => wrapText(str, width, size);

/** Free text written line by line on the grid; `bullets` puts a dot in front of each paragraph. */
function noteText(ctx: Ctx, str: string, box: Rect, seed: string, o: { bullets?: boolean; minRows?: number; top?: number; pen?: Pen | null; until?: number }) {
  const indent = o.bullets ? NOTE_INDENT : 0, size = NOTE_SIZE;
  const paras = str.split("\n").filter((p) => p.trim());
  while (paras.length < (o.minRows ?? 0)) paras.push("");
  // laid out first, so a line knows where it starts in its paragraph and its share of the pen's journey
  const rows: { bullet: boolean; line: string; off: number; i: number; j: number; row: number }[] = [];
  let row = 0;
  paras.forEach((para, i) => {
    const lines = para ? wrap(ctx, para, box.w - 10 - indent, size) : [""];
    let off = 0;
    lines.forEach((line, j) => { rows.push({ bullet: !!o.bullets && j === 0, line, off, i, j, row: row++ }); off += line.length + 1; });
  });
  // the pen's time is shared out over the characters that actually change, in the order they are read
  const parts = rows.map((r) => (r.line ? penPart(o.pen, r.i, r.off, r.line) : null));
  const total = parts.reduce((n, part) => n + (part?.chars ?? 0), 0);
  let done = 0;
  rows.forEach((r, k) => {
    const y = box.y + (o.top ?? 0) + r.row * CELL + 15;
    if (o.until !== undefined && y > o.until) return; // a photo is taped in below: the text stops above it
    const part = parts[k];
    const p = !part || !total ? 1 : clamp01((o.pen!.p * total - done) / part.chars);
    // the bullet goes up with the first stroke of its point, and only leaves when the whole point is rubbed out
    const gone = !!part && o.pen!.erasing && part.from === 0 && p >= 1;
    const coming = !!part && !o.pen!.erasing && part.from === 0 && p <= 0;
    if (r.bullet && !gone && !coming) text(ctx, "•", box.x + 6, y, { size: 22, weight: 700, seed: seed + "b" + r.i, tilt: 0 });
    if (r.line) {
      text(ctx, r.line, box.x + 6 + indent, y, { size, seed: seed + r.i + "-" + r.j, tilt: 0.25, ...(part ? { reveal: p, from: part.from, erase: o.pen!.erasing } : {}) });
      if (part) done += part.chars;
    }
  });
}

/** A square drawn by hand: four wobbly sides. */
function handBox(ctx: Ctx, b: Rect, seed: string, width = 1.3, alpha = 0.85) {
  ctx.beginPath();
  wobbly(ctx, b.x, b.y, b.x + b.w, b.y, seed + "a");
  wobbly(ctx, b.x + b.w, b.y, b.x + b.w, b.y + b.h, seed + "b");
  wobbly(ctx, b.x + b.w, b.y + b.h, b.x, b.y + b.h, seed + "c");
  wobbly(ctx, b.x, b.y + b.h, b.x, b.y, seed + "d");
  strokeInk(ctx, width, alpha);
}

/** A photo in the book, held by its corners: a black border, a little askew, with a shadow under it. An empty slot is a
 *  faint hand-drawn frame with a + in it, so you can see where one can go. */
function photo(ctx: Ctx, box: Rect, img: ImageBitmap | undefined, seed: string) {
  if (!img) {
    handBox(ctx, box, seed, 1.2, 0.3);
    text(ctx, "+", box.x + box.w / 2, box.y + box.h / 2 + 8, { size: 24, seed: seed + "p", align: "center", alpha: 0.28 });
    return;
  }
  const r = seededRandom(seed + "tilt");
  const B = 5; // the white border round the picture
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate((r() - 0.5) * 0.055);
  ctx.fillStyle = "rgba(40,30,15,.20)"; ctx.fillRect(-box.w / 2 + 3, -box.h / 2 + 4, box.w, box.h);
  ctx.fillStyle = "#161616"; ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(-box.w / 2 + B, -box.h / 2 + B, box.w - 2 * B, box.h - 2 * B); ctx.clip();
  const sc = Math.max((box.w - 2 * B) / img.width, (box.h - 2 * B) / img.height); // fill the frame, crop the overhang
  ctx.drawImage(img, (-img.width * sc) / 2, (-img.height * sc) / 2, img.width * sc, img.height * sc);
  ctx.restore();
  photoCorners(ctx, box.w, box.h, seed);
  ctx.restore();
}

function labelled(ctx: Ctx, label: string, x: number, y: number, seed: string) {
  text(ctx, label, x, y, { size: 19, weight: 500, seed });
  const w = widthOfText(label, 19, seed); // same seed as the text above => the same glyph picks => the same width
  ctx.beginPath(); wobbly(ctx, x, y + 5, x + w, y + 5, seed + "u"); strokeInk(ctx, 1.4);
}

function average(values: Record<string, string>, col: Column): string | null {
  const nums = Object.entries(values).filter(([k]) => k.endsWith(":" + col.id)).map(([, v]) => Number(v.replace(",", "."))).filter((n) => !Number.isNaN(n));
  if (!nums.length) return null;
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1).replace(".", ",");
}
const count = (values: Record<string, string>, col: Column) => Object.keys(values).filter((k) => k.endsWith(":" + col.id)).length;

// ---------------------------------------------------------------------------------------------

export function drawScene(ctx: Ctx, view: View, plane: Plane, scene: Scene, assets: Assets, now: number) {
  const { s } = view, k = plane.k, ky = plane.ky ?? plane.k;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s * k, 0, 0, s * ky, (view.x - plane.x0) * k, (view.y - plane.y0) * ky);
  const vis: Rect = { x: (plane.x0 - view.x) / s, y: (plane.y0 - view.y) / s, w: plane.w / s, h: plane.h / s };
  setHand(scene.hand);
  drawBackground(ctx, vis, assets);
  drawGrid(ctx, vis, LEFT_PAGE);
  drawGrid(ctx, vis, RIGHT_PAGE);
  ctx.save(); ctx.translate(LEFT_PAGE.x, LEFT_PAGE.y); drawLeftPage(ctx, scene, { x: vis.x - LEFT_PAGE.x, y: vis.y - LEFT_PAGE.y, w: vis.w, h: vis.h }, now, assets); ctx.restore();
  ctx.save(); ctx.translate(RIGHT_PAGE.x, RIGHT_PAGE.y); drawRightPage(ctx, scene, { x: vis.x - RIGHT_PAGE.x, y: vis.y - RIGHT_PAGE.y, w: vis.w, h: vis.h }, now, assets); ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/** The cover board: the whole box the mesh in bog3d.ts covers, lip and all. Stopping at BOOK_W x BOOK_H left
 *  the lip with nothing in it, and the shader filled it by repeating the edge pixel - the striped rim and the
 *  see-through corner Lukas saw zoomed in. */
function drawCover(ctx: Ctx, vis: Rect, assets: Assets) {
  if (!overlaps(vis, COVER_BOX)) return;
  roundRect(ctx, -LIP, -LIP, BOOK_W + 2 * LIP, BOOK_H + 2 * LIP, 9);
  ctx.fillStyle = "#141414"; ctx.fill();
  if (assets.leather) { const p = ctx.createPattern(assets.leather, "repeat"); if (p) { ctx.fillStyle = p; ctx.fill(); } }
  const sheen = ctx.createLinearGradient(0, 0, BOOK_W, BOOK_H * 0.6);
  sheen.addColorStop(0, "rgba(255,255,255,.10)"); sheen.addColorStop(0.35, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(0,0,0,.18)");
  ctx.fillStyle = sheen; ctx.fill();
  // elastic loop
  ctx.fillStyle = "#101010"; roundRect(ctx, BOOK_W - 50, BOOK_H * 0.54, 44, 60, 3); ctx.fill();
}

/** Everything on the spread that never changes - cover, paper, its texture, the curvature and wave shading, the
 *  spine - drawn ONCE into a bitmap and copied in from there on every redraw. Drawn afresh at every zoom step it
 *  was the whole cost of a redraw (50-120 ms of pattern and gradient fills); one copy is a few ms. It is all
 *  soft, so CACHE_K = 1.25 px per world px is plenty even zoomed right in (and it is 10 MB the iPhone has to hold).
 *  The grid and the ink are drawn live: they have to stay crisp. */
const CACHE_K = 1.25;
/** The whole board in spread coordinates: the book plus the lip that sticks out around it. */
const COVER_BOX: Rect = { x: -LIP, y: -LIP, w: BOOK_W + 2 * LIP, h: BOOK_H + 2 * LIP };
let cache: OffscreenCanvas | null = null;
function drawBackground(ctx: Ctx, vis: Rect, assets: Assets) {
  if (!cache) { // the worker waits for the textures before its first draw, so this is built once (~100 ms)
    cache = new OffscreenCanvas(Math.round(COVER_BOX.w * CACHE_K), Math.round(COVER_BOX.h * CACHE_K));
    const c = cache.getContext("2d")!;
    c.setTransform(CACHE_K, 0, 0, CACHE_K, LIP * CACHE_K, LIP * CACHE_K); // spread coordinates: the lip is at -LIP
    drawCover(c, COVER_BOX, assets);
    drawPaper(c, COVER_BOX, assets, LEFT_PAGE, "left");
    drawPaper(c, COVER_BOX, assets, RIGHT_PAGE, "right");
    drawSpine(c);
  }
  // only the visible part: the source is clipped, so a deep zoom does not ask for a blit the size of the world
  const x0 = Math.max(COVER_BOX.x, vis.x), y0 = Math.max(COVER_BOX.y, vis.y);
  const x1 = Math.min(COVER_BOX.x + COVER_BOX.w, vis.x + vis.w), y1 = Math.min(COVER_BOX.y + COVER_BOX.h, vis.y + vis.h);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(cache, (x0 - COVER_BOX.x) * CACHE_K, (y0 - COVER_BOX.y) * CACHE_K, (x1 - x0) * CACHE_K, (y1 - y0) * CACHE_K, x0, y0, x1 - x0, y1 - y0);
}

/** The squared grid, live and crisp. Multiplied onto the paper so the fold's shadow still darkens it. */
function drawGrid(ctx: Ctx, vis: Rect, at: { x: number; y: number }) {
  const page: Rect = { x: at.x, y: at.y, w: PAGE_W, h: PAGE_H };
  if (!overlaps(vis, page)) return;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.beginPath(); ctx.rect(2, 0, PAGE_W - 4, PAGE_H); ctx.clip(); // inside the paper's uneven outer edge
  const vx0 = Math.max(0, vis.x - at.x), vy0 = Math.max(0, vis.y - at.y), vx1 = Math.min(PAGE_W, vis.x + vis.w - at.x), vy1 = Math.min(PAGE_H, vis.y + vis.h - at.y);
  ctx.beginPath();
  for (let x = Math.floor(vx0 / CELL) * CELL; x <= vx1; x += CELL) { ctx.moveTo(x + 0.5, vy0); ctx.lineTo(x + 0.5, vy1); }
  for (let y = Math.floor(vy0 / CELL) * CELL; y <= vy1; y += CELL) { ctx.moveTo(vx0, y + 0.5); ctx.lineTo(vx1, y + 0.5); }
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function drawPaper(ctx: Ctx, vis: Rect, assets: Assets, at: { x: number; y: number }, side: "left" | "right") {
  const page: Rect = { x: at.x, y: at.y, w: PAGE_W, h: PAGE_H };
  if (!overlaps(vis, page)) return;
  ctx.save();
  ctx.translate(at.x, at.y);
  // slightly uneven outer edge
  ctx.beginPath();
  if (side === "left") { ctx.moveTo(0, 0); ctx.lineTo(PAGE_W, 0); ctx.lineTo(PAGE_W, PAGE_H); ctx.lineTo(1.2, PAGE_H); ctx.lineTo(0, PAGE_H * 0.97); ctx.lineTo(0.8, PAGE_H * 0.78); ctx.lineTo(0, PAGE_H * 0.55); ctx.lineTo(1.5, PAGE_H * 0.31); ctx.lineTo(0.3, PAGE_H * 0.12); }
  else { ctx.moveTo(0, 0); ctx.lineTo(PAGE_W, 0.6); ctx.lineTo(PAGE_W - 1.4, PAGE_H * 0.22); ctx.lineTo(PAGE_W, PAGE_H * 0.47); ctx.lineTo(PAGE_W - 0.6, PAGE_H * 0.69); ctx.lineTo(PAGE_W - 1.8, PAGE_H * 0.88); ctx.lineTo(PAGE_W - 0.4, PAGE_H); ctx.lineTo(0, PAGE_H); }
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (assets.paper) { const p = ctx.createPattern(assets.paper, "repeat"); if (p) { ctx.fillStyle = p; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, PAGE_W, PAGE_H); ctx.globalAlpha = 1; } }
  // curvature: pages bulge up before they dive into the spine; a light outer edge; one faint crease
  const spineX = side === "left" ? PAGE_W : 0, dir = side === "left" ? -1 : 1;
  const g = ctx.createLinearGradient(spineX, 0, spineX + dir * 130, 0);
  g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(0.07, "rgba(0,0,0,.26)"); g.addColorStop(0.3, "rgba(0,0,0,.07)"); g.addColorStop(0.55, "rgba(255,255,255,.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const e = ctx.createLinearGradient(PAGE_W - spineX, 0, PAGE_W - spineX - dir * 30, 0);
  e.addColorStop(0, "rgba(0,0,0,.07)"); e.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = e; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  // the paper is not perfectly flat: a few soft waves across the page
  const w = ctx.createLinearGradient(0, 0, PAGE_W, 0);
  const waves = side === "left" ? [0.12, 0.3, 0.52, 0.72] : [0.2, 0.42, 0.62, 0.84];
  w.addColorStop(0, "rgba(0,0,0,0)");
  for (const c of waves) { w.addColorStop(Math.max(0, c - 0.08), "rgba(0,0,0,0)"); w.addColorStop(c - 0.02, "rgba(0,0,0,.06)"); w.addColorStop(c + 0.03, "rgba(255,255,255,.08)"); w.addColorStop(Math.min(1, c + 0.09), "rgba(0,0,0,0)"); }
  ctx.fillStyle = w; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.beginPath();
  if (side === "left") { ctx.moveTo(PAGE_W * 0.22, 0); ctx.lineTo(PAGE_W * 0.34, PAGE_H); } else { ctx.moveTo(PAGE_W * 0.5, 0); ctx.lineTo(PAGE_W * 0.38, PAGE_H); }
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

function drawSpine(ctx: Ctx) {
  const g = ctx.createLinearGradient(BOOK_W / 2 - 18, 0, BOOK_W / 2 + 18, 0);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.45, "rgba(0,0,0,.38)"); g.addColorStop(0.5, "rgba(0,0,0,.48)"); g.addColorStop(0.55, "rgba(0,0,0,.38)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(BOOK_W / 2 - 18, COVER, 36, PAGE_H);
}

function drawLeftPage(ctx: Ctx, scene: Scene, vis: Rect, now: number, assets: Assets) {
  const { notes } = scene, by = bottomY(scene.days);
  ctx.beginPath();
  wobbly(ctx, 0, HEADER_Y, PAGE_W, HEADER_Y, "Lh");
  wobbly(ctx, 0, by, PAGE_W, by, "Lh3");
  wobbly(ctx, TITLE_BOX_X, 0, TITLE_BOX_X, HEADER_Y, "Lv");
  wobbly(ctx, TITLE_BOX_X, TITLE_BOX_Y, 0, TITLE_BOX_Y, "Lhb");
  strokeInk(ctx, 1.7);
  if (overlaps(vis, { x: 0, y: 0, w: PAGE_W, h: HEADER_Y })) {
    // on the line at 3 cells, small enough to stay clear of the one above: drawn bigger, the digits sat across it
    text(ctx, scene.monthLabel, 0.6 * CELL, 3 * CELL, { size: 31, weight: 500, seed: "title" });
    labelled(ctx, "Mål denne måned", 12.6 * CELL, CELL + 19, "subtitle");
    for (let i = 0; i < GOALS; i++) {
      const p = goalPos(i);
      // a reached goal's square becomes a star, with the number in the middle of it
      if (!starred(scene, i, now) || penOn(scene, `done-goal${i}`, now)?.erasing) handBox(ctx, { x: p.x, y: p.y, w: CELL, h: CELL }, "sq" + i);
      text(ctx, String(i + 1), p.x + CELL / 2, p.y + CELL / 2, { size: 18, weight: 700, seed: "gn" + i, align: "center", baseline: "middle" });
      goalStar(ctx, scene, i, { x: p.x, y: p.y, w: CELL, h: CELL }, now);
      const pen = penOn(scene, `goal${i}`, now);
      const g = pen?.erasing ? pen.text : notes[`goal${i}`];
      if (g) noteText(ctx, g, goalTextBox(i), "goal" + i, { pen });
    }
  }

  // the big field: the six goals again, larger, and under each one how it is going to happen
  if (overlaps(vis, { x: 0, y: PLAN_Y, w: PAGE_W, h: GOALS / 2 * PLAN_ROW_H })) {
    for (let i = 0; i < GOALS; i++) {
      const { num, goal, plan } = planBoxes(i);
      if (!starred(scene, i, now) || penOn(scene, `done-goal${i}`, now)?.erasing) handBox(ctx, num, "pq" + i);
      text(ctx, String(i + 1), num.x + num.w / 2, num.y + num.h / 2, { size: 24, weight: 700, seed: "pn" + i, align: "center", baseline: "middle" });
      goalStar(ctx, scene, i, num, now);
      const gpen = penOn(scene, `goal${i}`, now);
      const g = gpen?.erasing ? gpen.text : notes[`goal${i}`];
      if (g) {
        // the same goal, written large: the pen works on the same characters here as in the list above
        const lines = wrap(ctx, g, goal.w, 18).slice(0, 2);
        let off = 0;
        const parts = lines.map((line) => { const part = penPart(gpen, i, off, line); off += line.length + 1; return part; });
        const total = parts.reduce((n, part) => n + (part?.chars ?? 0), 0);
        let done = 0;
        lines.forEach((line, j) => {
          const part = parts[j];
          const p = !part || !total ? 1 : clamp01((gpen!.p * total - done) / part.chars);
          text(ctx, line, goal.x, goal.y + 19 + j * 21, { size: 18, seed: "pg" + i + j, tilt: 0.25, ...(part ? { reveal: p, from: part.from, erase: gpen!.erasing } : {}) });
          if (part) done += part.chars;
        });
      }
      const ppen = penOn(scene, `plan${i}`, now);
      const pl = ppen?.erasing ? ppen.text : notes[`plan${i}`];
      if (pl) noteText(ctx, pl, plan, "plan" + i, { bullets: true, pen: ppen });
    }
  }

  // and three photos along the bottom
  for (const { slot, box } of photoBoxes(scene.days)) {
    if (overlaps(vis, box)) photo(ctx, box, assets.photos?.[slot], slot);
  }
}
function drawRightPage(ctx: Ctx, scene: Scene, vis: Rect, now: number, assets: Assets) {
  const { columns, values, notes, days } = scene;
  const xs = columnXs(columns), right = xs[xs.length - 1], mid = (xs[0] + right) / 2, by = bottomY(days);
  // lines
  ctx.beginPath();
  wobbly(ctx, 0, HEADER_Y, PAGE_W, HEADER_Y, "Rh");
  wobbly(ctx, 0, by, PAGE_W, by, "Rh3");
  xs.forEach((x, i) => wobbly(ctx, x, 0, x, i === 0 || i === xs.length - 1 ? PAGE_H : by, "v" + i));
  wobbly(ctx, mid, by, mid, PAGE_H, "vmid");
  wobbly(ctx, TABLE_LEFT, HEADER_Y + days * CELL, right, HEADER_Y + days * CELL, "h2");
  strokeInk(ctx, 1.7);

  // headers
  if (overlaps(vis, { x: 0, y: 0, w: PAGE_W, h: HEADER_Y })) {
    columns.forEach((c, i) => {
      const left = xs[i + 1], w = widthOf(c.type) * CELL;
      // every heading sits the same way in the field (HEAD_POS); the scale under a dot graph is not a heading and
      // stays down by its own line. A heading lying flat is only as "long" as it is tall.
      if (c.type === "dots") {
        text(ctx, c.name, left + w / 2, HEADER_Y - 30, { size: 16.5, seed: "h" + c.id, align: "center" });
        for (const n of [0, 2, 4, 6, 8, 10]) text(ctx, String(n), left + dotX(n), HEADER_Y - 5, { size: 12, seed: "s" + n, align: "center" });
      } else if (c.type === "number") {
        text(ctx, c.name, left + w / 2, HEADER_Y - 7, { size: c.name.length > 5 ? 11 : 14, seed: "h" + c.id, align: "center", tilt: 0 });
      } else {
        // reads bottom→top, letter bottoms facing right ("A"): the anchor is where the first letter starts
        text(ctx, c.name, headAnchor(c.name, "h" + c.id, left, w) + (scene.headPos ?? 0), HEADER_Y - HEADER_LIFT, { size: 16.5, seed: "h" + c.id, rotate: -Math.PI / 2 });
      }
    });
    text(ctx, "+", right + CELL / 2, HEADER_Y - 6, { size: 20, seed: "plus", align: "center", alpha: 0.35 });
  }

  const rightPhotos = photoBoxesRight(columns, days, notes);
  for (const { slot, box } of rightPhotos) if (overlaps(vis, box)) photo(ctx, box, assets.photos?.[slot], slot);
  const b7 = assets.photos?.b7 ? rightPhotos.find((p) => p.slot === "b7")?.box : undefined;

  if (scene.today && scene.today <= days) todayMark(ctx, HEADER_Y + (scene.today - 1) * CELL, xs, right, scene.today);

  // day rows (only the visible ones)
  const first = Math.max(1, Math.floor((vis.y - HEADER_Y) / CELL) + 1), last = Math.min(days, Math.ceil((vis.y + vis.h - HEADER_Y) / CELL));
  for (let day = first; day <= last; day++) {
    const y = HEADER_Y + (day - 1) * CELL;
    text(ctx, WEEKDAY[new Date(scene.year, scene.month - 1, day).getDay()], xs[0] + CELL / 2, y + CELL / 2, { size: 15, seed: "w" + day, align: "center", baseline: "middle" });
    text(ctx, String(day), xs[0] + 1.5 * CELL, y + CELL / 2, { size: 15, seed: "d" + day, align: "center", baseline: "middle" });
    columns.forEach((c, i) => {
      const key = `${day}:${c.id}`;
      const pen = penOn(scene, key, now);
      const v = pen?.erasing ? pen.text ?? "" : values[key]; // being rubbed out: it is off the page already, but not off the paper
      if (!v) return;
      const left = xs[i + 1], w = widthOf(c.type) * CELL;
      const p = pen ? pen.p : 1, gone = pen?.erasing ? 1 - p : p;
      if (c.type === "check") {
        if (pen?.erasing) { ctx.globalAlpha = 0.22 * (1 - p); handX(ctx, left, y, key, 1); ctx.globalAlpha = 1; }
        handX(ctx, left, y, key, gone);
      } else if (c.type === "dots") {
        if (gone <= 0) return;
        ctx.beginPath(); ctx.arc(left + dotX(Number(v)), y + CELL / 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.globalAlpha = 0.9 * gone; ctx.fill(); ctx.globalAlpha = 1;
      } else {
        const from = pen?.edits?.[0]?.from ?? 0;
        text(ctx, v, left + w / 2, y + CELL / 2, { size: c.type === "number" ? 17 : v.length > 2 ? 12.5 : 15, seed: key, align: "center", baseline: "middle", ...(pen ? { reveal: p, from, erase: pen.erasing } : {}) });
      }
    });
  }
  // sleep graph: pen line joining consecutive filled-in days
  columns.forEach((c, i) => {
    if (c.type !== "dots") return;
    const left = xs[i + 1];
    ctx.beginPath();
    let pen = false;
    for (let day = 1; day <= days; day++) {
      const v = values[`${day}:${c.id}`];
      if (!v) { pen = false; continue; }
      const px = left + dotX(Number(v)), py = HEADER_Y + (day - 0.5) * CELL;
      if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      pen = true;
    }
    strokeInk(ctx, 1.3, 0.8);
  });
  // averages / counts
  const ay = HEADER_Y + days * CELL + CELL / 2;
  if (ay > vis.y && ay < vis.y + vis.h) {
    text(ctx, "gns.", xs[0] + CELL, ay, { size: 13, seed: "avg", align: "center", baseline: "middle" });
    columns.forEach((c, i) => {
      const sum = c.type === "check" ? String(count(values, c) || "") : average(values, c);
      if (sum) text(ctx, sum, xs[i + 1] + (widthOf(c.type) * CELL) / 2, ay, { size: c.type === "number" ? 17 : sum.length > 2 ? 12.5 : 15, seed: "avg" + c.id, align: "center", baseline: "middle" });
    });
  }
  // free-text boxes
  const boxes = noteBoxes(columns, days);
  (["good", "better", "change", "learned"] as const).forEach((f) => {
    const b = boxes[f];
    if (!overlaps(vis, b)) return;
    labelled(ctx, NOTE_LABEL[f], b.x + 6, b.y + 16, "n" + f);
    const pen = penOn(scene, f, now);
    noteText(ctx, (pen?.erasing ? pen.text : notes[f]) ?? "", b, f, { bullets: true, minRows: f === "good" ? 0 : 3, top: CELL, pen, until: f === "good" && b7 ? b7.y - 8 : undefined });
  });
}
