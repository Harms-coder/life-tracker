import { widthOfText } from "./glyf";

/** Geometry of the spread in world pixels (1 grid square = 20 px). Shared by drawing and hit-testing. */
export const CELL = 20, PAGE_W = 704, PAGE_H = 1000, COVER = 24;
/** How far the cover board sticks out past the book on every side. It has to clear the page stack's OVERHANG in
 *  bog3d.ts, or the stack rolls out over the board and the dark rim around the book disappears. Everything that
 *  draws or measures the spread works in this box, not in BOOK_W x BOOK_H: leave the lip undrawn and WebGL
 *  smears the outermost pixel row out over it (stripes along the edge, a see-through corner). */
export const LIP = 30;
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

export const HEADER_H = 8 * CELL, HEADER_Y = CELL + HEADER_H;
export const DAY_COL_W = 2, TABLE_LEFT = CELL;
export const TITLE_BOX_X = 12 * CELL, TITLE_BOX_Y = 4 * CELL;
export const GOALS = 6, GOALS_Y = 3 * CELL, GOAL_COL_W = (PAGE_W - TITLE_BOX_X - CELL) / 2;

export type ColType = "check" | "number" | "rating" | "dots";
export type Column = { id: string; name: string; type: ColType };
export type NoteField = "good" | "better" | "change" | "learned" | `goal${number}` | `plan${number}`;
export type Rect = { x: number; y: number; w: number; h: number };

export const NOTE_LABEL: Record<string, string> = {
  good: "Hvad gik godt denne måned?", better: "Gøre bedre næste måned", change: "Ændre til næste måned", learned: "Hvad har jeg lært denne måned?",
};
for (let i = 0; i < GOALS; i++) NOTE_LABEL["goal" + i] = `Mål ${i + 1}`;
for (let i = 0; i < GOALS; i++) NOTE_LABEL["plan" + i] = `Sådan kommer jeg i mål med ${i + 1}`;

/** The big field on the left page: the six goals again, larger, three in each column, each with room to write
 *  how it is going to happen. Rows are whole cells so the writing still sits on the grid. */
export const PLAN_Y = HEADER_Y + CELL, PLAN_ROW_H = 10 * CELL, PLAN_COL_W = PAGE_W / 2;
export const PLAN_SQ = 1.5 * CELL; // the numbered square, half again as big as the one in the goal list
export function planBoxes(i: number): { num: Rect; goal: Rect; plan: Rect } {
  const x = (i < GOALS / 2 ? 0 : 1) * PLAN_COL_W, y = PLAN_Y + (i % (GOALS / 2)) * PLAN_ROW_H;
  return {
    num: { x: x + CELL, y, w: PLAN_SQ, h: PLAN_SQ },
    goal: { x: x + CELL + PLAN_SQ + 8, y, w: PLAN_COL_W - 2 * CELL - PLAN_SQ - 8, h: 2 * CELL },
    plan: { x: x + CELL, y: y + 2 * CELL, w: PLAN_COL_W - 2 * CELL, h: PLAN_ROW_H - 3 * CELL },
  };
}

/** Somewhere to tape a photo in. Left page: three along the bottom and one in the box under the month. Right
 *  page: the top right corner, the space over the sleep graph's heading, and the foot of the "what went well"
 *  box. Slots are named, so what is in them survives a change of layout. */
export const PHOTOS_LEFT = ["b1", "b2", "b3"] as const;
export function photoBoxes(days: number): { slot: string; box: Rect }[] {
  const top = bottomY(days) + CELL, h = PAGE_H - CELL - top, m = CELL, w = (PAGE_W - 4 * m) / 3;
  const out: { slot: string; box: Rect }[] = PHOTOS_LEFT.map((slot, i) => ({ slot, box: { x: m + i * (w + m), y: top, w, h } }));
  out.push({ slot: "b5", box: { x: 8, y: TITLE_BOX_Y + 8, w: TITLE_BOX_X - 16, h: HEADER_Y - TITLE_BOX_Y - 16 } });
  return out;
}
/** `notes` decides one of them: the slot at the foot of "what went well" shares its box with the text, so it is
 *  only offered while the text has not reached down to it (Lukas: writing there must take the space back). */
export function photoBoxesRight(columns: Column[], days: number, notes?: Partial<Record<NoteField, string>>): { slot: string; box: Rect }[] {
  const xs = columnXs(columns), right = xs[xs.length - 1];
  const out: { slot: string; box: Rect }[] = [{ slot: "b4", box: { x: right + 1.5 * CELL, y: CELL, w: PAGE_W - right - 2.5 * CELL, h: HEADER_Y - 2 * CELL } }];
  const dots = columns.findIndex((c) => c.type === "dots");
  if (dots >= 0) out.push({ slot: "b6", box: { x: xs[dots + 1] + 4, y: CELL + 4, w: widthOf("dots") * CELL - 8, h: HEADER_Y - 50 - CELL - 4 } }); // above "Søvn score"
  const g = noteBoxes(columns, days).good;
  const b7 = { x: g.x + 4, y: g.y + g.h - 7 * CELL, w: g.w - 8, h: 7 * CELL - 6 };
  const good = notes?.good ?? "";
  if (!notes || noteBottom(good, g, true, CELL) < b7.y) out.push({ slot: "b7", box: b7 });
  return out;
}
/** The free text in the boxes: its size, and how far a bulleted line is indented. */
export const NOTE_SIZE = 15.5, NOTE_INDENT = 14;
/** Word-wrap into lines that fit `width`, greedy. Shared, so the drawing and the hit-test count the same rows. */
export function wrapText(str: string, width: number, size: number): string[] {
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
/** How many grid rows the text fills in `box` (bullets indent it, so it wraps sooner). */
export function noteRows(str: string, box: Rect, bullets: boolean): number {
  return wrapText(str, box.w - 10 - (bullets ? NOTE_INDENT : 0), NOTE_SIZE).length;
}
/** The bottom of that text, as a y inside the page (`top` is where the first row sits in the box). */
export const noteBottom = (str: string, box: Rect, bullets: boolean, top: number) =>
  box.y + top + Math.max(0, noteRows(str, box, bullets) - 1) * CELL + 15 + 6;

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
  | { kind: "note"; field: NoteField }
  | { kind: "photo"; slot: string };

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** What is under a world point? */
export function hitTest(wx: number, wy: number, columns: Column[], days: number, notes?: Partial<Record<NoteField, string>>): Hit | null {
  // left page: goals, the plan under each of them, and the photos along the bottom
  const lx = wx - LEFT_PAGE.x, ly = wy - LEFT_PAGE.y;
  if (lx >= 0 && lx < PAGE_W && ly >= 0 && ly < PAGE_H) {
    for (let i = 0; i < GOALS; i++) {
      const b = goalTextBox(i), p = goalPos(i);
      if (inRect(b, lx, ly) || inRect({ x: p.x, y: p.y, w: CELL, h: CELL }, lx, ly)) return { kind: "note", field: `goal${i}` };
    }
    for (let i = 0; i < GOALS; i++) {
      const { num, goal, plan } = planBoxes(i);
      if (inRect(num, lx, ly) || inRect(goal, lx, ly)) return { kind: "note", field: `goal${i}` };
      if (inRect(plan, lx, ly)) return { kind: "note", field: `plan${i}` };
    }
    for (const { slot, box } of photoBoxes(days)) if (inRect(box, lx, ly)) return { kind: "photo", slot };
    return null;
  }
  const x = wx - RIGHT_PAGE.x, y = wy - RIGHT_PAGE.y;
  if (x < 0 || x >= PAGE_W || y < 0 || y >= PAGE_H) return null;
  const xs = columnXs(columns), right = xs[xs.length - 1];
  for (const { slot, box } of photoBoxesRight(columns, days, notes)) if (inRect(box, x, y)) return { kind: "photo", slot }; // before the headers: one sits in the header band
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
