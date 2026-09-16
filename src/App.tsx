import { useRef, useState, type FormEvent } from "react";
import { Zoom } from "./Zoom";
import { HandX } from "./HandX";
import { seededRandom } from "./random";

const CELL = 20, PAGE_W = 704, PAGE_H = 1000, COVER = 14;
const BOOK_W = PAGE_W * 2 + COVER * 2, BOOK_H = PAGE_H + COVER * 2;
const HEADER_ROWS = 8; // header area is rows 1..8, days start at row 8
const TABLE_LEFT = CELL;

type Column = { name: string; type: "check" | "number" | "rating" | "dots"; width: number };

// ponytail: fixed month + columns; real data model (own columns, months) comes in roadmap step 2
const MONTH = { year: 2026, month: 9, label: "September 2026" };
const COLUMNS: Column[] = [
  { name: "Vægt", type: "number", width: 2 },
  { name: "Løb", type: "check", width: 1 },
  { name: "Meditation", type: "check", width: 1 },
  { name: "Udstrækning", type: "check", width: 1 },
  { name: "Mindre brok", type: "check", width: 1 },
  { name: "Spist clean", type: "check", width: 1 },
  { name: "Dagbog", type: "check", width: 1 },
  { name: "Overskud", type: "rating", width: 1 },
  { name: "Produktiv", type: "rating", width: 1 },
  { name: "Glad", type: "rating", width: 1 },
  { name: "Skærmtid", type: "rating", width: 1 },
  { name: "Søvn score", type: "dots", width: 6 },
  { name: "Dagsscore", type: "rating", width: 1 },
];
/** x-position (px) of a 0..10 sleep value inside the 6-cell column; shared by dots and scale labels */
const dotX = (v: number) => CELL / 2 + (v / 10) * (5 * CELL); // 0 and 10 sit mid-cell in the outer cells
const DAY_COL_W = 2; // weekday letter + number
const DAYS = new Date(MONTH.year, MONTH.month, 0).getDate();
const WEEKDAY = "SMTOTFL"; // indexed by Date.getDay()
const STORAGE_KEY = `values-${MONTH.year}-${MONTH.month}`;
const TABLE_W = (DAY_COL_W + COLUMNS.reduce((n, c) => n + c.width, 0)) * CELL;

type Values = Record<string, string>; // "x" for checks, "71,5" / "8" for numbers, "7.5" for dots

function Ink({ seed, text, className = "", size }: { seed: string; text: string; className?: string; size?: number }) {
  const r = seededRandom(seed);
  const style = { fontSize: size, transform: `rotate(${(r() - 0.5) * 5}deg) translate(${(r() - 0.5) * 2}px, ${(r() - 0.5) * 2}px)` };
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

function TableLines() {
  const top = CELL, bottom = PAGE_H - CELL, headerY = HEADER_ROWS * CELL;
  const xs = [TABLE_LEFT, TABLE_LEFT + DAY_COL_W * CELL];
  for (const c of COLUMNS) xs.push(xs[xs.length - 1] + c.width * CELL);
  return (
    <svg className="lines" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}>
      {xs.map((x, i) => <path key={i} d={wobbly(x, top, x, bottom, "v" + i)} />)}
      <path d={wobbly(TABLE_LEFT, headerY, TABLE_LEFT + TABLE_W, headerY, "h")} />
      <path d={wobbly(TABLE_LEFT, headerY + DAYS * CELL, TABLE_LEFT + TABLE_W, headerY + DAYS * CELL, "h2")} />
    </svg>
  );
}

function load(): Values {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

type Prompt = { key: string; label: string; value: string };

export default function App() {
  const [values, setValues] = useState<Values>(load);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const lastWritten = useRef<string | null>(null);

  const write = (key: string, value: string | null) => {
    const next = { ...values };
    if (value === null || value === "") delete next[key]; else next[key] = value;
    lastWritten.current = value ? key : null;
    setValues(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const onCell = (day: number, col: Column, e: React.MouseEvent<HTMLButtonElement>) => {
    const key = `${day}:${col.name}`;
    if (col.type === "check") return write(key, values[key] ? null : "x");
    if (col.type === "dots") {
      const r = e.currentTarget.getBoundingClientRect();
      const v = Math.min(10, Math.max(0, Math.round((((e.clientX - r.left) / r.width) * 6 * CELL - CELL / 2) / (5 * CELL) * 20) / 2)); // 0..10 in halves
      return write(key, values[key] === String(v) ? null : String(v));
    }
    setPrompt({ key, label: `${col.name} · ${day}. ${MONTH.label.split(" ")[0].toLowerCase()}`, value: values[key] ?? "" });
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = (new FormData(e.currentTarget).get("v") as string).trim().replace(".", ",");
    write(prompt!.key, v);
    setPrompt(null);
  };

  let x = TABLE_LEFT + DAY_COL_W * CELL;
  const headers = COLUMNS.map((c) => { const left = x; x += c.width * CELL; return { c, left }; });

  return (
    <>
      <Zoom width={BOOK_W} height={BOOK_H}>
        <div className="book">
          <div className="pages">
            <div className="page page--left">
              <Ink seed="title" text={MONTH.label} className="title" />
              <Ink seed="subtitle" text="Mål denne måned" className="subtitle" />
            </div>
            <div className="page page--right">
              <TableLines />
              {headers.map(({ c, left }) =>
                c.type === "dots" ? (
                  <div key={c.name} className="header header--dots" style={{ left, width: c.width * CELL }}>
                    <Ink seed={"h" + c.name} text={c.name} className="ink--dots-title" />
                    {[0, 2, 4, 6, 8, 10].map((n) => (
                      <span key={n} className="scale-tick" style={{ left: dotX(n) }}><Ink seed={"s" + n} text={String(n)} className="ink--scale" /></span>
                    ))}
                  </div>
                ) : (
                  <div key={c.name} className="header" style={{ left, width: c.width * CELL }}>
                    <Ink seed={"h" + c.name} text={c.name} className="ink--vertical" />
                  </div>
                ),
              )}
              <div className="tracker" style={{ left: TABLE_LEFT, top: HEADER_ROWS * CELL }}>
                {Array.from({ length: DAYS }, (_, i) => i + 1).map((day) => (
                  <div key={day} className="row">
                    <div className="cell cell--text"><Ink seed={"w" + day} text={WEEKDAY[new Date(MONTH.year, MONTH.month - 1, day).getDay()]} /></div>
                    <div className="cell cell--text"><Ink seed={"d" + day} text={String(day)} /></div>
                    {COLUMNS.map((c) => {
                      const key = `${day}:${c.name}`, v = values[key];
                      return (
                        <button key={c.name} className={`cell cell--${c.type}`} style={{ width: c.width * CELL }}
                          aria-label={`${c.name} dag ${day}`} aria-pressed={!!v} onClick={(e) => onCell(day, c, e)}>
                          {v && c.type === "check" && <HandX seed={key} animate={lastWritten.current === key} />}
                          {v && c.type === "dots" && <span className="dot" style={{ left: dotX(Number(v)) }} />}
                          {v && (c.type === "number" || c.type === "rating") && <Ink seed={key} text={v} size={v.length > 2 ? 12.5 : 15} />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="band-loop" />
        </div>
      </Zoom>
      {prompt && (
        <div className="sheet-backdrop" onClick={() => setPrompt(null)}>
          <form className="sheet" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <label>{prompt.label}</label>
            <input name="v" inputMode="decimal" autoFocus defaultValue={prompt.value} placeholder="tom = slet" />
            <button type="submit">Skriv</button>
          </form>
        </div>
      )}
    </>
  );
}
