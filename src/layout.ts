import scene from "./scene.json";
/** Geometry of the spread in world pixels (1 grid square = 20 px). Shared by drawing and hit-testing. */
export const CELL = 20, PAGE_W = 704, PAGE_H = 1000, COVER = 24;
export const BOOK_W = PAGE_W * 2 + COVER * 2, BOOK_H = PAGE_H + COVER * 2;
export const LEFT_PAGE = { x: COVER, y: COVER }, RIGHT_PAGE = { x: COVER + PAGE_W, y: COVER };
/** The scene's depth layers (src/scene.json). The photo lies flat in world units relative to the book's top-left corner:
 *  its size sets how big the book is on the table (`book.widthFraction`), the book's centre sits at `book.anchor` of it. */
export type Layer = { id: string; file: string; depth: number; x: number; y: number; w: number; h: number; pad?: number[]; isTablePlane?: boolean; flat?: (Rect & { file: string })[] };
export const LAYERS = scene.layers as Layer[];
const bgW = BOOK_W / scene.book.widthFraction, bgH = (bgW * scene.height) / scene.width;
export const BG = { x: BOOK_W / 2 - scene.book.anchor.x * bgW, y: BOOK_H / 2 - scene.book.anchor.y * bgH, w: bgW, h: bgH };
export const PX = bgW / scene.width; // world px per photo px
/** A layer's rect in world px, including its mirrored margins (`pad`, see tools/scene-assets.py). */
export const layerRect = (l: Layer): Rect => {
  const [pt, pr, pb, pl] = l.pad ?? [0, 0, 0, 0];
  return { x: BG.x + (l.x - pl * l.w) * PX, y: BG.y + (l.y - pt * l.h) * PX, w: l.w * (1 + pl + pr) * PX, h: l.h * (1 + pt + pb) * PX };
};
/** The table top inside the photo (fractions of BG): looking straight down you can pan over this, never up to the
 *  window. Must contain the whole flat book (0..BOOK_H) with some margin, or its ends cannot be reached. */
export const TABLE = { x: BG.x, y: BG.y + 0.46 * BG.h, w: BG.w, h: 0.32 * BG.h };
/** Thickness of the closed half of the book (the page block), in world px (1 cell = 5 mm): 2 cm, as in the reference. */
export const BOOK_T = 80;

export const HEADER_H = 8 * CELL, HEADER_Y = CELL + HEADER_H;
export const DAY_COL_W = 2, TABLE_LEFT = CELL;
export const TITLE_BOX_X = 12 * CELL, TITLE_BOX_Y = 4 * CELL;
export const GOALS = 6, GOALS_Y = 3 * CELL, GOAL_COL_W = (PAGE_W - TITLE_BOX_X - CELL) / 2;

export type ColType = "check" | "number" | "rating" | "dots";
export type Column = { id: string; name: string; type: ColType };
export type NoteField = "good" | "better" | "change" | "learned" | `goal${number}`;
export type Rect = { x: number; y: number; w: number; h: number };

export const NOTE_LABEL: Record<string, string> = {
  good: "Hvad gik godt denne måned?", better: "Gøre bedre næste måned", change: "Ændre til næste måned", learned: "Hvad har jeg lært denne måned?",
};
for (let i = 0; i < GOALS; i++) NOTE_LABEL["goal" + i] = `Mål ${i + 1}`;

export const widthOf = (t: ColType) => (t === "number" ? 2 : t === "dots" ? 6 : 1); // in cells
/** x-position of a 0..10 value inside the 6-cell dots column; 0 and 10 sit mid-cell in the outer cells */
export const dotX = (v: number) => CELL / 2 + (v / 10) * (5 * CELL);
export const bottomY = (days: number) => HEADER_Y + (days + 1) * CELL;

/** Column x positions (page-relative). Two entries first (day column), then one per column, last = right edge. */
export function columnXs(columns: Column[]): number[] {
  const xs = [TABLE_LEFT, TABLE_LEFT + DAY_COL_W * CELL];
  for (const c of columns) xs.push(xs[xs.length - 1] + widthOf(c.type) * CELL);
  return xs;
}

/** Goal i: column 0 holds 1–3, column 1 holds 4–6. The number sits in a one-cell square at (x, y). */
export const goalPos = (i: number) => ({ x: TITLE_BOX_X + CELL / 2 + (i >= 3 ? GOAL_COL_W : 0), y: GOALS_Y + (i % 3) * 2 * CELL });
export const goalTextBox = (i: number): Rect => ({ x: goalPos(i).x + CELL + 4, y: goalPos(i).y, w: GOAL_COL_W - CELL - 14, h: 2 * CELL });

/** Free-text boxes on the right page (page-relative). */
export function noteBoxes(columns: Column[], days: number): Record<"good" | "better" | "change" | "learned", Rect> {
  const xs = columnXs(columns), right = xs[xs.length - 1], mid = (xs[0] + right) / 2, by = bottomY(days);
  return {
    good: { x: right + CELL / 2, y: HEADER_Y, w: PAGE_W - right - 1.5 * CELL, h: by - HEADER_Y },
    better: { x: TABLE_LEFT, y: by, w: mid - TABLE_LEFT, h: PAGE_H - CELL - by },
    change: { x: mid, y: by, w: right - mid, h: PAGE_H - CELL - by },
    learned: { x: right, y: by, w: PAGE_W - right - CELL, h: PAGE_H - CELL - by },
  };
}

export type Hit =
  | { kind: "cell"; day: number; col: Column; fx: number }
  | { kind: "header"; index: number }
  | { kind: "add" }
  | { kind: "note"; field: NoteField };

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** What is under a world point? */
export function hitTest(wx: number, wy: number, columns: Column[], days: number): Hit | null {
  // left page: goals
  const lx = wx - LEFT_PAGE.x, ly = wy - LEFT_PAGE.y;
  if (lx >= 0 && lx < PAGE_W && ly >= 0 && ly < PAGE_H) {
    for (let i = 0; i < GOALS; i++) {
      const b = goalTextBox(i), p = goalPos(i);
      if (inRect(b, lx, ly) || inRect({ x: p.x, y: p.y, w: CELL, h: CELL }, lx, ly)) return { kind: "note", field: `goal${i}` };
    }
    return null;
  }
  const x = wx - RIGHT_PAGE.x, y = wy - RIGHT_PAGE.y;
  if (x < 0 || x >= PAGE_W || y < 0 || y >= PAGE_H) return null;
  const xs = columnXs(columns), right = xs[xs.length - 1];
  if (y >= CELL && y < HEADER_Y) {
    if (x >= right && x < right + CELL) return { kind: "add" };
    for (let i = 0; i < columns.length; i++) if (x >= xs[i + 1] && x < xs[i + 2]) return { kind: "header", index: i };
  }
  if (y >= HEADER_Y && y < HEADER_Y + days * CELL && x >= xs[1] && x < right) {
    const day = Math.floor((y - HEADER_Y) / CELL) + 1;
    for (let i = 0; i < columns.length; i++) if (x >= xs[i + 1] && x < xs[i + 2]) return { kind: "cell", day, col: columns[i], fx: (x - xs[i + 1]) / (xs[i + 2] - xs[i + 1]) };
  }
  const boxes = noteBoxes(columns, days);
  for (const f of ["good", "better", "change", "learned"] as const) if (inRect(boxes[f], x, y)) return { kind: "note", field: f };
  return null;
}
