import { seededRandom } from "./random";
import { drawInBox, drawText, widthOfText } from "./glyf";
import {
  CELL, PAGE_W, PAGE_H, COVER, LIP, BOOK_W, BOOK_H, LEFT_PAGE, RIGHT_PAGE, HEADER_Y, TABLE_LEFT, DAY_COL_W,
  TITLE_BOX_X, TITLE_BOX_Y, GOALS, goalPos, goalTextBox, widthOf, dotX, columnXs, bottomY, noteBoxes, NOTE_LABEL,
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
  /** an X being written right now: key + start time, drawn with a pen-stroke animation */
  writing: { key: string; start: number } | null;
};
export type Assets = { paper?: ImageBitmap; leather?: ImageBitmap };
/** world -> plane: plane = world * s + (x, y) */
export type View = { x: number; y: number; s: number };
/** the part of the plane the canvas covers, and its resolution (device px per plane px) */
export type Plane = { x0: number; y0: number; w: number; h: number; k: number };

const INK = "#1e2233", PAPER = "#efe9d4", GRID = "rgba(120,150,130,.42)";
export const WEEKDAY = "SMTOTFL"; // indexed by Date.getDay()

/** Runs in draw.worker.ts, off the main thread: an OffscreenCanvas, no DOM, no fonts (all text is Lukas' glyphs). */
type Ctx = OffscreenCanvasRenderingContext2D;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Handwritten text with a small, stable wobble (seeded), so it looks the same every time. */
function text(ctx: Ctx, str: string, x: number, y: number, o: { size: number; seed: string; weight?: number; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; tilt?: number; rotate?: number; alpha?: number }) {
  const r = seededRandom(o.seed);
  ctx.save();
  ctx.translate(x + (r() - 0.5) * 2, y + (r() - 0.5) * 2);
  ctx.rotate(((r() - 0.5) * 5 * (o.tilt ?? 1) * Math.PI) / 180 + (o.rotate ?? 0));
  ctx.fillStyle = INK;
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  drawText(ctx, str, 0, 0, o.size, o.seed, o.align ?? "left", o.baseline ?? "alphabetic");
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

/** Word-wrap text into lines that fit `width` (canvas units), greedy. */
function wrap(_ctx: Ctx, str: string, width: number, size: number): string[] {
  const out: string[] = [];
  for (const para of str.split("\n")) {
    if (!para.trim()) continue;
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? line + " " + word : word;
      if (widthOfText(next, size, "w") > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Free text written line by line on the grid; `bullets` puts a dot in front of each paragraph. */
function noteText(ctx: Ctx, str: string, box: Rect, seed: string, o: { bullets?: boolean; minRows?: number; top?: number }) {
  const indent = o.bullets ? 14 : 0, size = 15.5;
  const paras = str.split("\n").filter((p) => p.trim());
  while (paras.length < (o.minRows ?? 0)) paras.push("");
  let row = 0;
  paras.forEach((para, i) => {
    const lines = para ? wrap(ctx, para, box.w - 10 - indent, size) : [""];
    if (o.bullets) text(ctx, "•", box.x + 6, box.y + (o.top ?? 0) + row * CELL + 15, { size: 22, weight: 700, seed: seed + "b" + i, tilt: 0 });
    lines.forEach((line, j) => {
      if (line) text(ctx, line, box.x + 6 + indent, box.y + (o.top ?? 0) + row * CELL + 15, { size, seed: seed + i + "-" + j, tilt: 0.25 });
      row++;
    });
  });
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
  const { s } = view, k = plane.k;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s * k, 0, 0, s * k, (view.x - plane.x0) * k, (view.y - plane.y0) * k);
  const vis: Rect = { x: (plane.x0 - view.x) / s, y: (plane.y0 - view.y) / s, w: plane.w / s, h: plane.h / s };
  drawBackground(ctx, vis, assets);
  drawGrid(ctx, vis, LEFT_PAGE);
  drawGrid(ctx, vis, RIGHT_PAGE);
  ctx.save(); ctx.translate(LEFT_PAGE.x, LEFT_PAGE.y); drawLeftPage(ctx, scene, { x: vis.x - LEFT_PAGE.x, y: vis.y - LEFT_PAGE.y, w: vis.w, h: vis.h }); ctx.restore();
  ctx.save(); ctx.translate(RIGHT_PAGE.x, RIGHT_PAGE.y); drawRightPage(ctx, scene, { x: vis.x - RIGHT_PAGE.x, y: vis.y - RIGHT_PAGE.y, w: vis.w, h: vis.h }, now); ctx.restore();
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

function drawLeftPage(ctx: Ctx, scene: Scene, vis: Rect) {
  const { notes } = scene, by = bottomY(scene.days);
  ctx.beginPath();
  wobbly(ctx, 0, HEADER_Y, PAGE_W, HEADER_Y, "Lh");
  wobbly(ctx, 0, by, PAGE_W, by, "Lh3");
  wobbly(ctx, TITLE_BOX_X, 0, TITLE_BOX_X, HEADER_Y, "Lv");
  wobbly(ctx, 0, TITLE_BOX_Y, TITLE_BOX_X, TITLE_BOX_Y, "Lhb");
  strokeInk(ctx, 1.7);
  if (!overlaps(vis, { x: 0, y: 0, w: PAGE_W, h: HEADER_Y })) return;
  text(ctx, scene.monthLabel, 0.6 * CELL, 1.3 * CELL + 30, { size: 38, weight: 500, seed: "title" });
  labelled(ctx, "Mål denne måned", 12.6 * CELL, CELL + 19, "subtitle");
  for (let i = 0; i < GOALS; i++) {
    const p = goalPos(i);
    ctx.beginPath();
    wobbly(ctx, p.x, p.y, p.x + CELL, p.y, "sq" + i + "a"); wobbly(ctx, p.x + CELL, p.y, p.x + CELL, p.y + CELL, "sq" + i + "b");
    wobbly(ctx, p.x + CELL, p.y + CELL, p.x, p.y + CELL, "sq" + i + "c"); wobbly(ctx, p.x, p.y + CELL, p.x, p.y, "sq" + i + "d");
    strokeInk(ctx, 1.3);
    text(ctx, String(i + 1), p.x + CELL / 2, p.y + CELL / 2, { size: 18, weight: 700, seed: "gn" + i, align: "center", baseline: "middle" });
    const g = notes[`goal${i}`];
    if (g) noteText(ctx, g, goalTextBox(i), "goal" + i, {});
  }
}

function drawRightPage(ctx: Ctx, scene: Scene, vis: Rect, now: number) {
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
      if (c.type === "dots") {
        text(ctx, c.name, left + w / 2, HEADER_Y - 30, { size: 16.5, seed: "h" + c.id, align: "center" });
        for (const n of [0, 2, 4, 6, 8, 10]) text(ctx, String(n), left + dotX(n), HEADER_Y - 5, { size: 12, seed: "s" + n, align: "center" });
      } else if (c.type === "number") {
        text(ctx, c.name, left + w / 2, HEADER_Y - 7, { size: c.name.length > 5 ? 11 : 14, seed: "h" + c.id, align: "center", tilt: 0 });
      } else {
        // reads bottom→top, letter bottoms facing right ("A")
        text(ctx, c.name, left + w / 2 + 5, HEADER_Y - 8, { size: 16.5, seed: "h" + c.id, rotate: -Math.PI / 2, baseline: "middle" });
      }
    });
    text(ctx, "+", right + CELL / 2, HEADER_Y - 6, { size: 20, seed: "plus", align: "center", alpha: 0.35 });
  }

  // day rows (only the visible ones)
  const first = Math.max(1, Math.floor((vis.y - HEADER_Y) / CELL) + 1), last = Math.min(days, Math.ceil((vis.y + vis.h - HEADER_Y) / CELL));
  for (let day = first; day <= last; day++) {
    const y = HEADER_Y + (day - 1) * CELL;
    text(ctx, WEEKDAY[new Date(scene.year, scene.month - 1, day).getDay()], xs[0] + CELL / 2, y + CELL / 2, { size: 15, seed: "w" + day, align: "center", baseline: "middle" });
    text(ctx, String(day), xs[0] + 1.5 * CELL, y + CELL / 2, { size: 15, seed: "d" + day, align: "center", baseline: "middle" });
    columns.forEach((c, i) => {
      const key = `${day}:${c.id}`, v = values[key];
      if (!v) return;
      const left = xs[i + 1], w = widthOf(c.type) * CELL;
      if (c.type === "check") {
        const progress = scene.writing?.key === key ? Math.min(1, (now - scene.writing.start) / 300) : 1;
        handX(ctx, left, y, key, progress);
      } else if (c.type === "dots") {
        ctx.beginPath(); ctx.arc(left + dotX(Number(v)), y + CELL / 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      } else {
        text(ctx, v, left + w / 2, y + CELL / 2, { size: c.type === "number" ? 17 : v.length > 2 ? 12.5 : 15, seed: key, align: "center", baseline: "middle" });
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
    noteText(ctx, notes[f] ?? "", b, f, { bullets: true, minRows: f === "good" ? 0 : 3, top: CELL });
  });
}
