/** ?bog3d: the book as real curved geometry instead of the flat CSS-tilted plate. Read here so both the
 *  drawing and the canvas component see the same answer. */
export const USE_3D = new URLSearchParams(location.search).has("bog3d");

/** Geometry of the spread in world pixels (1 grid square = 20 px). Shared by drawing and hit-testing. */
export const CELL = 20, PAGE_W = 704, PAGE_H = 1000, COVER = 24;
export const BOOK_W = PAGE_W * 2 + COVER * 2, BOOK_H = PAGE_H + COVER * 2;
export const LEFT_PAGE = { x: COVER, y: COVER }, RIGHT_PAGE = { x: COVER + PAGE_W, y: COVER };
/** The background photo (9:16), in world units relative to the book's top-left corner. Its size sets how big
 *  the book is on the table, its offset where on the table it lies (the book tips over its own centre, so the centre
 *  stays put at every zoom; tuned by eye against the photo). */
export const BG = { x: -648, y: -2069, w: 2752, h: 4892 };
/** The sharp top-down table top (public/baggrund/bord.webp, 3:4): centred on the book and big enough to fill the screen once the book lies flat, in world units. It fades in
 *  as the camera goes overhead, so looking straight down you see the table from above – crisp, and with no far edge for
 *  the book to grow past as it unfolds. Its edges are faded in the file itself, so it blends into the photo. */
export const TABLE = { x: -222, y: -742, w: 1900, h: 2533 };
/** How far the table's flat colour reaches past that picture, so a tall screen never sees past the wood. */
export const TABLE_PAD = 700;
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
