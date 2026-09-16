import { useRef, useState, type FormEvent } from "react";
import { Zoom } from "./Zoom";
import { HandX } from "./HandX";
import { seededRandom } from "./random";

declare const __BUILD__: string; // set in vite.config.ts

const CELL = 20, PAGE_W = 704, PAGE_H = 1000, COVER = 14;
const BOOK_W = PAGE_W * 2 + COVER * 2, BOOK_H = PAGE_H + COVER * 2;
const CW = CELL, CH = CELL; // table cells follow the paper grid
const HEADER_H = 8 * CH;
const TABLE_LEFT = CELL;
const DAY_COL_W = 2; // weekday letter + number

type ColType = "check" | "number" | "rating" | "dots";
type Column = { id: string; name: string; type: ColType };
const TYPE_LABEL: Record<ColType, string> = { check: "Afkrydsning", number: "Tal", rating: "Rating 1–10", dots: "Prikgraf 0–10" };
const widthOf = (t: ColType) => (t === "number" ? 2 : t === "dots" ? 6 : 1); // in table cells

// ponytail: fixed month; months + page turning come in roadmap step 2
const MONTH = { year: 2026, month: 9, label: "September 2026" };
const DEFAULT_COLUMNS: Column[] = [
  { id: "vaegt", name: "Vægt", type: "number" },
  { id: "loeb", name: "Løb", type: "check" },
  { id: "meditation", name: "Meditation", type: "check" },
  { id: "udstraekning", name: "Udstrækning", type: "check" },
  { id: "brok", name: "Mindre brok", type: "check" },
  { id: "clean", name: "Spist clean", type: "check" },
  { id: "dagbog", name: "Dagbog", type: "check" },
  { id: "overskud", name: "Overskud", type: "rating" },
  { id: "produktiv", name: "Produktiv", type: "rating" },
  { id: "glad", name: "Glad", type: "rating" },
  { id: "skaermtid", name: "Skærmtid", type: "rating" },
  { id: "soevn", name: "Søvn score", type: "dots" },
  { id: "dagsscore", name: "Dagsscore", type: "rating" },
];
const DAYS = new Date(MONTH.year, MONTH.month, 0).getDate();
const WEEKDAY = "SMTOTFL"; // indexed by Date.getDay()
const VALUES_KEY = `values-${MONTH.year}-${MONTH.month}`;
const COLUMNS_KEY = "columns";
/** x-position (px) of a 0..10 value inside the 6-cell dots column; 0 and 10 sit mid-cell in the outer cells */
const dotX = (v: number) => CW / 2 + (v / 10) * (5 * CW);
/** Month average of a numeric column, written the Danish way ("7,3"); null when nothing is filled in. */
function average(values: Values, col: Column): string | null {
  const nums = Object.entries(values)
    .filter(([k]) => k.endsWith(":" + col.id))
    .map(([, v]) => Number(v.replace(",", ".")))
    .filter((n) => !Number.isNaN(n));
  if (!nums.length) return null;
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1).replace(".", ",");
}
const count = (values: Values, col: Column) => Object.keys(values).filter((k) => k.endsWith(":" + col.id)).length;
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type Values = Record<string, string>; // "x" for checks, "71,5" / "8" for numbers, "7.5" for dots

/** All handwriting goes through here (and HandX) — swap in Lukas' own glyphs later in one place. */
function Ink({ seed, text, className = "", size, style: extra, tilt = 1 }: { seed: string; text: string; className?: string; size?: number; style?: React.CSSProperties; tilt?: number }) {
  const r = seededRandom(seed);
  const style = { ...extra, fontSize: size, transform: `rotate(${(r() - 0.5) * 5 * tilt}deg) translate(${(r() - 0.5) * 2}px, ${(r() - 0.5) * 2}px)` };
  return <span className={`ink ${className}`} style={style}>{text}</span>;
}

/** A hand-drawn straight line: a few segments with tiny seeded wobble. */
function wobbly(x1: number, y1: number, x2: number, y2: number, seed: string) {
  const r = seededRandom(seed);
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 60));
  let d = `M${x1 + (r() - 0.5)} ${y1 + (r() - 0.5)}`;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    d += ` L${x1 + (x2 - x1) * t + (r() - 0.5) * 1.4} ${y1 + (y2 - y1) * t + (r() - 0.5) * 1.4}`;
  }
  return d;
}

const HEADER_Y = CELL + HEADER_H, BOTTOM_Y = HEADER_Y + (DAYS + 1) * CH;

/** The header line and the line under the averages run across the whole spread. */
function SpreadLines({ seed, children }: { seed: string; children?: React.ReactNode }) {
  return (
    <svg className="lines" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}>
      <path d={wobbly(0, HEADER_Y, PAGE_W, HEADER_Y, seed + "h")} />
      <path d={wobbly(0, BOTTOM_Y, PAGE_W, BOTTOM_Y, seed + "h3")} />
      {children}
    </svg>
  );
}

function TableLines({ xs }: { xs: number[] }) {
  const right = xs[xs.length - 1];
  return (
    <svg className="lines" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}>
      {xs.map((x, i) => <path key={i} d={wobbly(x, 0, x, i === 0 || i === xs.length - 1 ? PAGE_H : BOTTOM_Y, "v" + i)} />)}
      <path d={wobbly((xs[0] + right) / 2, BOTTOM_Y, (xs[0] + right) / 2, PAGE_H, "vmid")} />
      <path d={wobbly(TABLE_LEFT, HEADER_Y + DAYS * CH, right, HEADER_Y + DAYS * CH, "h2")} />
    </svg>
  );
}

/** Pen line joining the sleep dots of consecutive filled-in days. */
function DotGraph({ values, col, left }: { values: Values; col: Column; left: number }) {
  let d = "", pen = false;
  for (let day = 1; day <= DAYS; day++) {
    const v = values[`${day}:${col.id}`];
    if (!v) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${left + dotX(Number(v))} ${(day - 0.5) * CH} `;
    pen = true;
  }
  return <path d={d} />;
}

/** Plausible example month so the layout can be judged with a full page. Runs once (flag in localStorage). */
function demoValues(columns: Column[]): Values {
  const r = seededRandom("demo-" + MONTH.label);
  const v: Values = {};
  let weight = 71.8;
  for (let day = 1; day <= DAYS; day++) {
    const goodDay = r() < 0.6; // some days just go better
    weight += (r() - 0.55) * 0.4;
    const sleep = Math.round((goodDay ? 6.5 : 5) + r() * 3.5);
    for (const c of columns) {
      const key = `${day}:${c.id}`;
      if (c.type === "number") { if (r() < 0.85) v[key] = weight.toFixed(1).replace(".", ","); }
      else if (c.type === "check") { if (r() < (goodDay ? 0.75 : 0.4)) v[key] = "x"; }
      else if (c.type === "dots") v[key] = String(Math.min(10, sleep));
      else if (c.name === "Skærmtid") v[key] = String(Math.round(2 + r() * 4));
      else if (c.name === "Dagsscore") v[key] = String(Math.min(10, Math.round((goodDay ? 7 : 5) + r() * 3)));
      else if (r() < 0.9) v[key] = String(Math.min(10, Math.round(((goodDay ? 6 : 4) + r() * 4) * 2) / 2)).replace(".", ",");
    }
  }
  return v;
}

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

type ValuePrompt = { kind: "value"; key: string; label: string; value: string };
type ColumnPrompt = { kind: "column"; index: number; column: Column }; // index -1 = new
type NotePrompt = { kind: "note"; field: NoteField; label: string; value: string };
type Prompt = ValuePrompt | ColumnPrompt | NotePrompt;
type NoteField = "good" | "better" | "change" | "learned" | `goal${number}`;
type Notes = Partial<Record<NoteField, string>>;
const NOTES_KEY = `notes-${MONTH.year}-${MONTH.month}`;
const GOALS = 6;
const GOALS_Y = 3 * 20; // first goal row on the left page (rows are 2 cells apart, 3 per column)
const GOAL_COL_W = (704 - 12 * 20 - 20) / 2; // two columns to the right of the title box
/** Position of goal i: column 0 holds 1–3, column 1 holds 4–6. Numbers sit in a one-cell square. */
const goalPos = (i: number) => ({ x: TITLE_BOX_X + CELL / 2 + (i >= 3 ? GOAL_COL_W : 0), y: GOALS_Y + (i % 3) * 2 * CELL });
function square(x: number, y: number, seed: string) {
  return [wobbly(x, y, x + CELL, y, seed + "a"), wobbly(x + CELL, y, x + CELL, y + CELL, seed + "b"),
    wobbly(x + CELL, y + CELL, x, y + CELL, seed + "c"), wobbly(x, y + CELL, x, y, seed + "d")].join(" ");
}
const NOTE_LABEL: Record<string, string> = {
  good: "Hvad gik godt denne måned?", better: "Gøre bedre næste måned", change: "Ændre til næste måned", learned: "Hvad har jeg lært denne måned?",
};
for (let i = 0; i < GOALS; i++) NOTE_LABEL["goal" + i] = `Mål ${i + 1}`;
// ponytail: example text so the layout can be judged; seeded once, then Lukas' own text takes over
const DEMO_NOTES: Notes = {
  goal0: "Finde ro i hverdagen og stresse mindre", goal1: "Løbe 10 km uden pause inden d. 30.", goal2: "Mindre mobil om aftenen, max 1 time",
  goal3: "Læse 'Atomic Habits' færdig", goal4: "Ringe til mormor hver søndag", goal5: "Spare 2.000 kr. op til rejsen",
  good: "Løbet 3 gange om ugen, også når det regnede\nMediteret næsten hver morgen, kun 4 dage sprunget over\nMindre skærm om aftenen, telefonen ligger i køkkenet\nBedre søvn i sidste halvdel af måneden\nSpist clean 19 dage, det er rekord\nSkrevet dagbog 20 dage\nVægten er gået fra 71,9 til 71,0\nHar sagt nej til to ting, jeg ikke havde lyst til",
  better: "Stå op kl. 6, også i weekenden\nDrikke mere vand i løbet af dagen\nStrække ud efter hver løbetur",
  change: "Dagbog om aftenen i stedet for at scrolle\nLægge løbetøjet frem aftenen før\nIngen kaffe efter kl. 14",
  learned: "Gode dage starter med en god morgen\nJeg brokker mig mindre, når jeg har sovet nok\nDet er nemmere at sige nej, end jeg troede",
};
const TITLE_BOX_X = 12 * CELL, TITLE_BOX_Y = 4 * CELL; // box around the month title on the left page

type Box = { left: number; top: number; width: number; height: number };
function NoteBox({ field, box, notes, onOpen, bullets, label, minRows }: { field: NoteField; box: Box; notes: Notes; onOpen: (f: NoteField) => void; bullets?: boolean; label?: boolean; minRows?: number }) {
  return (
    <button className="note" aria-label={NOTE_LABEL[field]} onClick={() => onOpen(field)} style={box}>
      {label && <Ink seed={"n" + field} text={NOTE_LABEL[field]} className="note__label" />}
      {(notes[field] || minRows) && <NoteText seed={field} text={notes[field] ?? ""} bullets={bullets} minRows={minRows} />}
    </button>
  );
}

/** Free text written line by line on the grid; `bullets` puts a dot in front of each line. */
function NoteText({ seed, text, bullets, minRows = 0 }: { seed: string; text: string; bullets?: boolean; minRows?: number }) {
  const lines = text.split("\n").filter(Boolean);
  while (lines.length < minRows) lines.push("");
  return (
    <div className="note-text">
      {lines.map((line, i) => (
        <div key={i} className="note-line">
          {bullets && <span className="bullet">•</span>}
          <Ink seed={seed + i} text={line} className="ink--line" tilt={0.25} />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [columns, setColumns] = useState<Column[]>(() => load(COLUMNS_KEY, DEFAULT_COLUMNS));
  const [values, setValues] = useState<Values>(() => {
    if (localStorage.getItem("demo-seeded-2")) return load(VALUES_KEY, {});
    const demo = demoValues(load(COLUMNS_KEY, DEFAULT_COLUMNS));
    localStorage.setItem(VALUES_KEY, JSON.stringify(demo));
    localStorage.setItem("demo-seeded-2", "1");
    return demo;
  });
  const [notes, setNotes] = useState<Notes>(() => {
    if (localStorage.getItem("demo-notes-seeded-2")) return load(NOTES_KEY, {});
    localStorage.setItem(NOTES_KEY, JSON.stringify(DEMO_NOTES));
    localStorage.setItem("demo-notes-seeded-2", "1");
    return DEMO_NOTES;
  });
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const submitNote = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = prompt as NotePrompt;
    const next = { ...notes, [p.field]: (new FormData(e.currentTarget).get("v") as string).trim() };
    setNotes(next);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    setPrompt(null);
  };
  const openNote = (field: NoteField) => setPrompt({ kind: "note", field, label: NOTE_LABEL[field], value: notes[field] ?? "" });
  const lastWritten = useRef<string | null>(null);

  const write = (key: string, value: string | null) => {
    const next = { ...values };
    if (value === null || value === "") delete next[key]; else next[key] = value;
    lastWritten.current = value ? key : null;
    setValues(next);
    localStorage.setItem(VALUES_KEY, JSON.stringify(next));
  };
  const saveColumns = (next: Column[]) => {
    setColumns(next);
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    setPrompt(null);
  };

  const onCell = (day: number, col: Column, e: React.MouseEvent<HTMLButtonElement>) => {
    const key = `${day}:${col.id}`;
    if (col.type === "check") return write(key, values[key] ? null : "x");
    if (col.type === "dots") {
      const r = e.currentTarget.getBoundingClientRect();
      const v = Math.min(10, Math.max(0, Math.round((((e.clientX - r.left) / r.width) * 6 * CW - CW / 2) / (5 * CW) * 20) / 2)); // 0..10 in halves
      return write(key, values[key] === String(v) ? null : String(v));
    }
    setPrompt({ kind: "value", key, label: `${col.name} · ${day}. ${MONTH.label.split(" ")[0].toLowerCase()}`, value: values[key] ?? "" });
  };

  const submitValue = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = (new FormData(e.currentTarget).get("v") as string).trim().replace(".", ",");
    write((prompt as ValuePrompt).key, v);
    setPrompt(null);
  };
  const submitColumn = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = prompt as ColumnPrompt, fd = new FormData(e.currentTarget);
    const col: Column = { ...p.column, name: (fd.get("name") as string).trim(), type: fd.get("type") as ColType };
    if (!col.name) return;
    const next = [...columns];
    if (p.index < 0) next.push(col); else next[p.index] = col;
    saveColumns(next);
  };

  // column x positions (px inside the page); xs has one extra entry = right edge of the table
  const xs = [TABLE_LEFT, TABLE_LEFT + DAY_COL_W * CW];
  for (const c of columns) xs.push(xs[xs.length - 1] + widthOf(c.type) * CW);
  const right = xs[xs.length - 1], mid = (xs[0] + right) / 2;

  return (
    <>
      <Zoom width={BOOK_W} height={BOOK_H}>
        <div className="book">
          <div className="pages">
            <div className="page page--left">
              <SpreadLines seed="L">
                <path d={wobbly(TITLE_BOX_X, 0, TITLE_BOX_X, HEADER_Y, "Lv")} />
                <path d={wobbly(0, TITLE_BOX_Y, TITLE_BOX_X, TITLE_BOX_Y, "Lh")} />
                {Array.from({ length: GOALS }, (_, i) => <path key={i} d={square(goalPos(i).x, goalPos(i).y, "sq" + i)} strokeWidth={1.3} />)}
              </SpreadLines>
              <Ink seed="title" text={MONTH.label} className="title" />
              <Ink seed="subtitle" text="Mål denne måned" className="subtitle" />
              {Array.from({ length: GOALS }, (_, i) => (
                <div key={i}>
                  <span className="goal__number" style={{ left: goalPos(i).x, top: goalPos(i).y }}><Ink seed={"gn" + i} text={String(i + 1)} /></span>
                  <NoteBox field={`goal${i}`} notes={notes} onOpen={openNote}
                    box={{ left: goalPos(i).x + CELL + 4, top: goalPos(i).y, width: GOAL_COL_W - CELL - 14, height: 2 * CELL }} />
                </div>
              ))}
            </div>
            <div className="page page--right">
              <SpreadLines seed="R" />
              <TableLines xs={xs} />
              {columns.map((c, i) => {
                const w = widthOf(c.type) * CW;
                return (
                  <button key={c.id} className={`header header--${c.type}`} style={{ left: xs[i + 1], width: w }}
                    aria-label={`Kolonne ${c.name}`} onClick={() => setPrompt({ kind: "column", index: i, column: c })}>
                    {c.type === "dots" ? (
                      <>
                        <Ink seed={"h" + c.id} text={c.name} className="ink--dots-title" />
                        {[0, 2, 4, 6, 8, 10].map((n) => (
                          <span key={n} className="scale-tick" style={{ left: dotX(n) }}><Ink seed={"s" + n} text={String(n)} className="ink--scale" /></span>
                        ))}
                      </>
                    ) : c.type === "number" ? (
                      <Ink seed={"h" + c.id} text={c.name} className="ink--flat" size={c.name.length > 5 ? 11 : 14} />
                    ) : (
                      <Ink seed={"h" + c.id} text={c.name} className="ink--vertical" />
                    )}
                  </button>
                );
              })}
              <button className="header header--add" style={{ left: xs[xs.length - 1] }} aria-label="Ny kolonne"
                onClick={() => setPrompt({ kind: "column", index: -1, column: { id: generateId(), name: "", type: "check" } })}>
                <Ink seed="plus" text="+" />
              </button>
              <NoteBox field="good" notes={notes} onOpen={openNote} bullets label
                box={{ left: right + CELL / 2, top: HEADER_Y, width: PAGE_W - right - 1.5 * CELL, height: BOTTOM_Y - HEADER_Y }} />
              <NoteBox field="better" notes={notes} onOpen={openNote} label bullets minRows={3}
                box={{ left: TABLE_LEFT, top: BOTTOM_Y, width: mid - TABLE_LEFT, height: PAGE_H - CELL - BOTTOM_Y }} />
              <NoteBox field="change" notes={notes} onOpen={openNote} label bullets minRows={3}
                box={{ left: mid, top: BOTTOM_Y, width: right - mid, height: PAGE_H - CELL - BOTTOM_Y }} />
              <NoteBox field="learned" notes={notes} onOpen={openNote} label bullets minRows={3}
                box={{ left: right, top: BOTTOM_Y, width: PAGE_W - right - CELL, height: PAGE_H - CELL - BOTTOM_Y }} />
              <div className="tracker" style={{ left: TABLE_LEFT, top: CELL + HEADER_H }}>
                <svg className="graph" width={xs[xs.length - 1] - TABLE_LEFT} height={DAYS * CH}>
                  {columns.map((c, i) => c.type === "dots" && <DotGraph key={c.id} values={values} col={c} left={xs[i + 1] - TABLE_LEFT} />)}
                </svg>
                {Array.from({ length: DAYS }, (_, i) => i + 1).map((day) => (
                  <div key={day} className="row">
                    <div className="cell cell--text"><Ink seed={"w" + day} text={WEEKDAY[new Date(MONTH.year, MONTH.month - 1, day).getDay()]} /></div>
                    <div className="cell cell--text"><Ink seed={"d" + day} text={String(day)} /></div>
                    {columns.map((c) => {
                      const key = `${day}:${c.id}`, v = values[key];
                      return (
                        <button key={c.id} className={`cell cell--${c.type}`} style={{ width: widthOf(c.type) * CW }}
                          aria-label={`${c.name} dag ${day}`} aria-pressed={!!v} onClick={(e) => onCell(day, c, e)}>
                          {v && c.type === "check" && <HandX seed={key} animate={lastWritten.current === key} />}
                          {v && c.type === "dots" && <span className="dot" style={{ left: dotX(Number(v)) }} />}
                          {v && (c.type === "number" || c.type === "rating") && <Ink seed={key} text={v} size={c.type === "number" ? 17 : v.length > 2 ? 12.5 : 15} />}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <div className="row row--avg">
                  <div className="cell cell--text" style={{ width: DAY_COL_W * CW }}><Ink seed="avg" text="gns." size={13} /></div>
                  {columns.map((c) => {
                    const sum = c.type === "check" ? String(count(values, c) || "") : average(values, c);
                    return (
                      <div key={c.id} className="cell cell--text" style={{ width: widthOf(c.type) * CW }}>
                        {sum && <Ink seed={"avg" + c.id} text={sum} size={c.type === "number" ? 17 : sum.length > 2 ? 12.5 : 15} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="pages-bottom" />
          <div className="spine" />
          <div className="band-loop" />
          <span className="build">{__BUILD__}</span>
        </div>
      </Zoom>

      {prompt?.kind === "value" && (
        <div className="sheet-backdrop" onClick={() => setPrompt(null)}>
          <form className="sheet" onSubmit={submitValue} onClick={(e) => e.stopPropagation()}>
            <label>{prompt.label}</label>
            <input name="v" inputMode="decimal" autoFocus defaultValue={prompt.value} placeholder="tom = slet" />
            <button type="submit">Skriv</button>
          </form>
        </div>
      )}
      {prompt?.kind === "note" && (
        <div className="sheet-backdrop" onClick={() => setPrompt(null)}>
          <form className="sheet" onSubmit={submitNote} onClick={(e) => e.stopPropagation()}>
            <label>{prompt.label}</label>
            <textarea name="v" autoFocus defaultValue={prompt.value} rows={5} placeholder="Én linje pr. punkt" />
            <button type="submit">Skriv</button>
          </form>
        </div>
      )}
      {prompt?.kind === "column" && (
        <div className="sheet-backdrop" onClick={() => setPrompt(null)}>
          <form className="sheet" onSubmit={submitColumn} onClick={(e) => e.stopPropagation()}>
            <label>{prompt.index < 0 ? "Ny kolonne" : "Ret kolonne"}</label>
            <input name="name" autoFocus defaultValue={prompt.column.name} placeholder="Navn" maxLength={16} />
            <button type="submit">Gem</button>
            <select name="type" defaultValue={prompt.column.type}>
              {(Object.keys(TYPE_LABEL) as ColType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            {prompt.index >= 0 && (
              <button type="button" className="danger" onClick={() => saveColumns(columns.filter((_, i) => i !== prompt.index))}>Slet</button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
