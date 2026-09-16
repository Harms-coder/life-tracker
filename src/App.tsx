import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BookCanvas, type BookCanvasHandle } from "./BookCanvas";
import { Backdrop } from "./Backdrop";
import { drawScene, type Assets, type Plane, type Scene, type View } from "./draw";
import { BOOK_H, BOOK_W, dotX, hitTest, NOTE_LABEL, widthOf, CELL, type ColType, type Column, type NoteField } from "./layout";
import { seededRandom } from "./random";
import paperUrl from "./textures/paper.png";
import leatherUrl from "./textures/leather.png";

declare const __BUILD__: string; // set in vite.config.ts

const TYPE_LABEL: Record<ColType, string> = { check: "Afkrydsning", number: "Tal", rating: "Rating 1–10", dots: "Prikgraf 0–10" };

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
const VALUES_KEY = `values-${MONTH.year}-${MONTH.month}`;
const COLUMNS_KEY = "columns";
const NOTES_KEY = `notes-${MONTH.year}-${MONTH.month}`;
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type Values = Record<string, string>; // "x" for checks, "71,5" / "8" for numbers, "7.5" for dots
type Notes = Partial<Record<NoteField, string>>;

// ponytail: example text/values so the layout can be judged; seeded once, then Lukas' own data takes over
const DEMO_NOTES: Notes = {
  goal0: "Finde ro i hverdagen og stresse mindre", goal1: "Løbe 10 km uden pause inden d. 30.", goal2: "Mindre mobil om aftenen, max 1 time",
  goal3: "Læse 'Atomic Habits' færdig", goal4: "Ringe til mormor hver søndag", goal5: "Spare 2.000 kr. op til rejsen",
  good: "Løbet 3 gange om ugen, også når det regnede\nMediteret næsten hver morgen, kun 4 dage sprunget over\nMindre skærm om aftenen, telefonen ligger i køkkenet\nBedre søvn i sidste halvdel af måneden\nSpist clean 19 dage, det er rekord\nSkrevet dagbog 20 dage\nVægten er gået fra 71,9 til 71,0\nHar sagt nej til to ting, jeg ikke havde lyst til",
  better: "Stå op kl. 6, også i weekenden\nDrikke mere vand i løbet af dagen\nStrække ud efter hver løbetur",
  change: "Dagbog om aftenen i stedet for at scrolle\nLægge løbetøjet frem aftenen før\nIngen kaffe efter kl. 14",
  learned: "Gode dage starter med en god morgen\nJeg brokker mig mindre, når jeg har sovet nok\nDet er nemmere at sige nej, end jeg troede",
};
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
function seedOnce<T>(flag: string, key: string, make: () => T, fallback: T): T {
  if (localStorage.getItem(flag)) return load(key, fallback);
  const v = make();
  localStorage.setItem(key, JSON.stringify(v));
  localStorage.setItem(flag, "1");
  return v;
}

type ValuePrompt = { kind: "value"; key: string; label: string; value: string };
type ColumnPrompt = { kind: "column"; index: number; column: Column }; // index -1 = new
type NotePrompt = { kind: "note"; field: NoteField; label: string; value: string };
type Prompt = ValuePrompt | ColumnPrompt | NotePrompt;

const assets: Assets = {};
function loadAssets(onLoad: () => void) {
  for (const [name, url] of [["paper", paperUrl], ["leather", leatherUrl]] as const) {
    const img = new Image();
    img.onload = () => { assets[name] = img; onLoad(); };
    img.src = url;
  }
}

export default function App() {
  const [columns, setColumns] = useState<Column[]>(() => load(COLUMNS_KEY, DEFAULT_COLUMNS));
  const [values, setValues] = useState<Values>(() => seedOnce("demo-seeded-2", VALUES_KEY, () => demoValues(load(COLUMNS_KEY, DEFAULT_COLUMNS)), {}));
  const [notes, setNotes] = useState<Notes>(() => seedOnce("demo-notes-seeded-2", NOTES_KEY, () => DEMO_NOTES, {}));
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const book = useRef<BookCanvasHandle>(null);
  const scene = useRef<Scene>({ ...MONTH, monthLabel: MONTH.label, days: DAYS, columns, values, notes, writing: null });
  scene.current = { ...scene.current, columns, values, notes };

  const draw = useCallback((ctx: CanvasRenderingContext2D, view: View, plane: Plane) => drawScene(ctx, view, plane, scene.current, assets, performance.now()), []);
  const redraw = () => book.current?.redraw();
  useEffect(() => { redraw(); }, [columns, values, notes]);
  useEffect(() => {
    loadAssets(redraw);
    document.fonts?.load("500 20px Caveat").then(redraw).catch(() => {});
  }, []);

  const write = (key: string, value: string | null) => {
    const next = { ...values };
    if (value === null || value === "") delete next[key]; else next[key] = value;
    setValues(next);
    localStorage.setItem(VALUES_KEY, JSON.stringify(next));
    if (value === "x") { // pen-stroke animation for a new X
      scene.current.writing = { key, start: performance.now() };
      const step = () => { redraw(); if (performance.now() - scene.current.writing!.start < 320) requestAnimationFrame(step); else { scene.current.writing = null; redraw(); } };
      requestAnimationFrame(step);
    }
  };
  const saveColumns = (next: Column[]) => {
    setColumns(next);
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    setPrompt(null);
  };
  const saveNote = (field: NoteField, text: string) => {
    const next = { ...notes, [field]: text };
    setNotes(next);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    setPrompt(null);
  };

  const onTap = (wx: number, wy: number) => {
    const hit = hitTest(wx, wy, columns, DAYS);
    if (!hit) return;
    if (hit.kind === "cell") {
      const { day, col } = hit, key = `${day}:${col.id}`;
      if (col.type === "check") return write(key, values[key] ? null : "x");
      if (col.type === "dots") {
        const v = Math.min(10, Math.max(0, Math.round(((hit.fx * widthOf("dots") * CELL - dotX(0)) / (dotX(10) - dotX(0))) * 20) / 2)); // 0..10 in halves
        return write(key, values[key] === String(v) ? null : String(v));
      }
      return setPrompt({ kind: "value", key, label: `${col.name} · ${day}. ${MONTH.label.split(" ")[0].toLowerCase()}`, value: values[key] ?? "" });
    }
    if (hit.kind === "header") return setPrompt({ kind: "column", index: hit.index, column: columns[hit.index] });
    if (hit.kind === "add") return setPrompt({ kind: "column", index: -1, column: { id: generateId(), name: "", type: "check" } });
    setPrompt({ kind: "note", field: hit.field, label: NOTE_LABEL[hit.field], value: notes[hit.field] ?? "" });
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
  const submitNote = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    saveNote((prompt as NotePrompt).field, (new FormData(e.currentTarget).get("v") as string).trim());
  };

  return (
    <>
      <BookCanvas ref={book} width={BOOK_W} height={BOOK_H} draw={draw} onTap={onTap} backdrop={<Backdrop />} />
      <span className="build">{__BUILD__}</span>

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
