import { useState } from "react";
import { Zoom } from "./Zoom";
import { HandX } from "./HandX";
import { seededRandom } from "./random";

const CELL = 20, PAGE_W = 704, PAGE_H = 1000, COVER = 14;
const BOOK_W = PAGE_W * 2 + COVER * 2, BOOK_H = PAGE_H + COVER * 2;

// ponytail: fixed month + checkbox columns; real data model comes in roadmap step 2
const MONTH = { year: 2026, month: 9, label: "September 2026" };
const COLUMNS = ["Løb", "Meditation", "Udstrækning", "Mindre brok", "Spist clean", "Dagbog"];
const DAYS = new Date(MONTH.year, MONTH.month, 0).getDate();
const STORAGE_KEY = `marks-${MONTH.year}-${MONTH.month}`;

/** Handwritten text with a small, stable per-instance wobble. */
function Ink({ seed, text, className = "" }: { seed: string; text: string; className?: string }) {
  const r = seededRandom(seed);
  const style = { transform: `rotate(${(r() - 0.5) * 5}deg) translate(${(r() - 0.5) * 2}px, ${(r() - 0.5) * 2}px)` };
  return <span className={`ink ${className}`} style={style}>{text}</span>;
}

function load(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

export default function App() {
  const [marks, setMarks] = useState<Record<string, number>>(load);

  const toggle = (key: string) => {
    const next = { ...marks };
    if (next[key]) delete next[key]; else next[key] = Date.now();
    setMarks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <Zoom width={BOOK_W} height={BOOK_H}>
      <div className="book">
        <div className="pages">
          <div className="page page--left">
            <Ink seed="title" text={MONTH.label} className="title" />
            <Ink seed="subtitle" text="Mål denne måned" className="subtitle" />
          </div>
          <div className="page page--right">
            <div className="tracker__headers" style={{ left: CELL * 2 }}>
              {COLUMNS.map((c) => (
                <div key={c} className="tracker__header">
                  <Ink seed={"h" + c} text={c} className="ink--vertical" />
                </div>
              ))}
            </div>
            <div className="tracker" style={{ gridTemplateColumns: `repeat(${COLUMNS.length + 1}, ${CELL}px)` }}>
              {Array.from({ length: DAYS }, (_, i) => i + 1).map((day) => (
                <DayRow key={day} day={day} marks={marks} onToggle={toggle} />
              ))}
            </div>
          </div>
        </div>
        <div className="band-loop" />
        <div className="ribbon" />
      </div>
    </Zoom>
  );
}

function DayRow({ day, marks, onToggle }: { day: number; marks: Record<string, number>; onToggle: (k: string) => void }) {
  return (
    <>
      <div className="cell cell--day"><Ink seed={"d" + day} text={String(day)} /></div>
      {COLUMNS.map((c) => {
        const key = `${day}:${c}`;
        const ts = marks[key];
        return (
          <button key={c} className="cell" aria-label={`${c} dag ${day}`} aria-pressed={!!ts} onClick={() => onToggle(key)}>
            {ts && <HandX seed={key} animate={Date.now() - ts < 1500} />}
          </button>
        );
      })}
    </>
  );
}
