import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookCanvas, type BookCanvasHandle } from "./BookCanvas";
import { Backdrop } from "./Backdrop";
import type { Scene } from "./draw";

type Writing = NonNullable<Scene["writing"]>;
import { BOOK_H, BOOK_W, columnXs, dotX, hitTest, NOTE_LABEL, RIGHT_PAGE, widthOf, CELL, type ColType, type Column, type NoteField } from "./layout";
import { seededRandom } from "./random";
import { HANDS, setHand, type Hand } from "./glyf";
import { migrate as migratePhotos, photosNow, save as savePhotosTo, warm as warmPhotos } from "./photos";
import { clearMonth, download as downloadBackup, restore as restoreBackup } from "./backup";
import { eraseSound, penSound, setSoundOn, soundOn } from "./sound";

declare const __BUILD__: string; // set in vite.config.ts

const TYPE_LABEL: Record<ColType, string> = { check: "Afkrydsning", number: "Tal", rating: "Rating 1–10", dots: "Prikgraf 0–10" };

/** `?idag=N` pretends today is day N of the month on screen (screenshots). */
const TODAY = Number(new URLSearchParams(location.search).get("idag")) || 0;
/** Today's day of the month, if `m` is this month: its row gets a pencil mark. */
function todayIn(m: { year: number; month: number }) {
  const d = new Date();
  if (TODAY) return TODAY;
  return d.getFullYear() === m.year && d.getMonth() + 1 === m.month ? d.getDate() : undefined;
}
/** One month of the book: `month` 1..12. Everything written in it is stored under its own keys. */
type Month = { year: number; month: number };
const MONTHS_DA = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];
const labelOf = (m: Month) => `${MONTHS_DA[m.month - 1]} ${m.year}`;
const daysOf = (m: Month) => new Date(m.year, m.month, 0).getDate();
const stepMonth = (m: Month, dir: 1 | -1): Month => ({ year: m.year + (m.month + dir < 1 ? -1 : m.month + dir > 12 ? 1 : 0), month: ((m.month + dir + 11) % 12) + 1 });
const keyOf = (kind: "values" | "notes" | "photos", m: Month) => `${kind}-${m.year}-${m.month}`;
/** The month the demo text and values were written into, once, on the first visit. */
const DEMO_MONTH: Month = { year: 2026, month: 9 };
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
const COLUMNS_KEY = "columns";
const BACKUP_AT = "backup-at", BACKUP_ASKED = "backup-asked"; // when a copy was last saved; which month was reminded
const HAND_KEY = "hand";
/** How fast the pen writes; `?pen=6` slows it down so a screenshot can catch it half-written. */
const PEN_K = Number(new URLSearchParams(location.search).get("pen")) || 1;
/** How far a rotated column heading sits from its column's left edge (`?ox=N`); it rides on the scene, since
 *  draw.ts runs in a worker and cannot read the address itself. */
const HEAD_POS = Number(new URLSearchParams(location.search).get("ox")) || 0;
const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type Values = Record<string, string>; // "x" for checks, "71,5" / "8" for numbers, "7.5" for dots
type Notes = Partial<Record<NoteField, string>>;
import type { Photos } from "./photos"; // slot -> a small JPEG as a data URL, kept in IndexedDB

// ponytail: example text/values so the layout can be judged; seeded once, then Lukas' own data takes over
const DEMO_NOTES: Notes = {
  goal0: "Finde ro i hverdagen og stresse mindre", goal1: "Løbe 10 km uden pause inden d. 30.", goal2: "Mindre mobil om aftenen, max 1 time",
  goal3: "Læse 'Atomic Habits' færdig", goal4: "Ringe til mormor hver søndag", goal5: "Spare 2.000 kr. op til rejsen",
  good: "Løbet 3 gange om ugen, også når det regnede\nMediteret næsten hver morgen, kun 4 dage sprunget over\nMindre skærm om aftenen, telefonen ligger i køkkenet\nBedre søvn i sidste halvdel af måneden\nSpist clean 19 dage, det er rekord\nSkrevet dagbog 20 dage\nVægten er gået fra 71,9 til 71,0\nHar sagt nej til to ting, jeg ikke havde lyst til",
  better: "Stå op kl. 6, også i weekenden\nDrikke mere vand i løbet af dagen\nStrække ud efter hver løbetur",
  change: "Dagbog om aftenen i stedet for at scrolle\nLægge løbetøjet frem aftenen før\nIngen kaffe efter kl. 14",
  learned: "Gode dage starter med en god morgen\nJeg brokker mig mindre, når jeg har sovet nok\nDet er nemmere at sige nej, end jeg troede",
};
// ponytail: example plans, merged in once so the big field is not empty when Lukas first looks at it
const DEMO_PLANS: Notes = {
  plan0: "10 min meditation hver morgen\nIngen mail før kl. 9\nEn fridag om ugen uden planer",
  plan1: "Løbe 3 gange om ugen, tirsdag, torsdag, søndag\nLægge 500 m på hver anden uge\nStrække ud bagefter",
  plan2: "Telefonen i køkkenet efter kl. 21\nSlette de to værste apps\nLæse i stedet for at scrolle",
  plan3: "20 sider hver aften før jeg sover\nBogen ligger på natbordet, ikke i tasken",
  plan4: "Fast tid: søndag kl. 16\nSkrive det i kalenderen hele måneden frem",
  plan5: "500 kr. overføres automatisk den 1.\nIngen takeaway på hverdage\nSælge cyklen der står i kælderen",
};

function demoValues(columns: Column[]): Values {
  const r = seededRandom("demo-" + labelOf(DEMO_MONTH));
  const v: Values = {};
  let weight = 71.8;
  for (let day = 1; day <= daysOf(DEMO_MONTH); day++) {
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

/** How long the pen takes over `chars` characters: about nine a second, and never less than a moment. */
const penMs = (chars: number) => (chars > 0 ? Math.min(3000, 260 + Math.max(chars, 5) * 110) * PEN_K : 0);
/** How many characters two strings start out the same - counted in whole characters, so an emoji is not cut in half. */
function prefixLen(a: string, b: string) {
  const A = Array.from(a), B = Array.from(b);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  return A.slice(0, i).join("").length;
}
const lines = (s: string) => s.split("\n").filter((l) => l.trim()); // the paragraphs the book draws, in its order
/** What changed between two lists of points: lines that are word for word the same are left alone, the rest are
 *  paired up in order, and each pair only differs from the character where they part company. */
function diffLines(before: string[], after: string[]) {
  const used = before.map(() => false);
  const same = after.map((l) => { const i = before.findIndex((b, j) => !used[j] && b === l); if (i >= 0) used[i] = true; return i; });
  const oldLeft = before.map((_, i) => i).filter((i) => !used[i]);
  const newLeft = after.map((_, i) => i).filter((i) => same[i] < 0);
  const eraseEdits: { line: number; from: number }[] = [], writeEdits: { line: number; from: number }[] = [];
  let eraseChars = 0, writeChars = 0;
  for (let i = 0; i < Math.max(oldLeft.length, newLeft.length); i++) {
    const o = oldLeft[i], n = newLeft[i];
    const k = o !== undefined && n !== undefined ? prefixLen(before[o], after[n]) : 0;
    if (o !== undefined && before[o].length > k) { eraseEdits.push({ line: o, from: k }); eraseChars += before[o].length - k; }
    if (n !== undefined && after[n].length > k) { writeEdits.push({ line: n, from: k }); writeChars += after[n].length - k; }
  }
  return { eraseEdits, writeEdits, eraseChars, writeChars };
}

type ValuePrompt = { kind: "value"; key: string; label: string; value: string; rating: boolean };
type ColumnPrompt = { kind: "column"; index: number; column: Column }; // index -1 = new
type SettingsPrompt = { kind: "settings" };
type ReminderPrompt = { kind: "reminder" };
type PhotoPrompt = { kind: "photo"; slot: string };
type NotePrompt = { kind: "note"; field: NoteField; label: string; value: string; bullets: boolean };
type Prompt = ValuePrompt | ColumnPrompt | NotePrompt | SettingsPrompt | PhotoPrompt | ReminderPrompt;

/** The text you write is a list of points, one line each - the same lines the book draws, with the same dot in
 *  front. A written line has a black dot, the empty one at the end a faint one: that is where the next point goes. */
function Lines({ value, bullets }: { value: string; bullets: boolean }) {
  const [rows, setRows] = useState<string[]>(() => [...value.split("\n").filter((l) => l.trim()), ""]);
  // the caret starts on the empty line at the BOTTOM: opening a box is nearly always to add a point, not to edit
  // the first one (Lukas). Once, when the sheet opens: as autoFocus on "the last line" it followed every new line
  // that typing adds, and jumped down a line with each letter.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLInputElement>(".line:last-child input")?.focus(); }, []);
  const set = (i: number, v: string) => {
    const next = [...rows];
    next[i] = v;
    if (v.trim() && i === next.length - 1) next.push(""); // always one empty line to write on
    setRows(next);
  };
  const move = (el: HTMLInputElement, step: 1 | -1) => {
    const line = el.closest(".line");
    const to = (step === 1 ? line?.nextElementSibling : line?.previousElementSibling)?.querySelector("input");
    (to as HTMLInputElement | null)?.focus();
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Enter") { e.preventDefault(); if (rows[i].trim()) move(e.currentTarget, 1); }
    if (e.key === "Backspace" && !rows[i] && rows.length > 1 && i < rows.length - 1) {
      e.preventDefault(); move(e.currentTarget, -1);
      setRows(rows.filter((_, j) => j !== i));
    }
  };
  return (
    <div className="lines" ref={box}>
      <input type="hidden" name="v" value={rows.map((r) => r.trim()).filter(Boolean).join("\n")} />
      {rows.map((r, i) => (
        <div className="line" key={i}>
          {bullets && <span className={r.trim() ? "dot" : "dot empty"}>•</span>}
          <input value={r} enterKeyHint="next" onKeyDown={(e) => onKey(e, i)} onChange={(e) => set(i, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

/** Every input in the book opens the same slip of paper: heading, what you are writing, and the buttons. */
function Sheet({ title, onClose, onSubmit, children }: { title: string; onClose: () => void; onSubmit?: (e: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onSubmit={onSubmit ?? ((e) => e.preventDefault())} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Luk">×</button>
        </div>
        {children}
      </form>
    </div>
  );
}

export default function App() {
  const [columns, setColumns] = useState<Column[]>(() => load(COLUMNS_KEY, DEFAULT_COLUMNS));
  const [month, setMonth] = useState<Month>(() => {
    // the demo month is filled in once, on the first visit, whichever month the book then opens at
    seedOnce("demo-seeded-2", keyOf("values", DEMO_MONTH), () => demoValues(load(COLUMNS_KEY, DEFAULT_COLUMNS)), {});
    const n = seedOnce("demo-notes-seeded-2", keyOf("notes", DEMO_MONTH), () => DEMO_NOTES, {});
    if (!localStorage.getItem("demo-plans-seeded")) { // the plans came later than the rest of the demo text: merged in without touching anything already written
      localStorage.setItem("demo-plans-seeded", "1");
      localStorage.setItem(keyOf("notes", DEMO_MONTH), JSON.stringify({ ...DEMO_PLANS, ...n }));
    }
    const today = new Date(); // the book always opens at this month (Lukas): today's row is where you write
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [values, setValues] = useState<Values>(() => load(keyOf("values", month), {}));
  const [notes, setNotes] = useState<Notes>(() => load(keyOf("notes", month), {}));
  const [hand, setHandState] = useState<Hand>(() => (localStorage.getItem(HAND_KEY) as Hand) in HANDS ? (localStorage.getItem(HAND_KEY) as Hand) : "lukas");
  const [photos, setPhotos] = useState<Photos>(() => photosNow(keyOf("photos", month)));
  const DAYS = daysOf(month), VALUES_KEY = keyOf("values", month), NOTES_KEY = keyOf("notes", month), PHOTOS_KEY = keyOf("photos", month);
  const sceneOf = (m: Month, v: Values, n: Notes): Scene => ({ ...m, monthLabel: labelOf(m), days: daysOf(m), columns, values: v, notes: n, writing: null, hand, headPos: HEAD_POS || undefined, today: todayIn(m) });
  /** The spread on the other side of a leaf turned in `dir`, read straight from storage. */
  const otherScene = (dir: 1 | -1) => {
    const m = stepMonth(month, dir);
    return { scene: sceneOf(m, load(keyOf("values", m), {}), load(keyOf("notes", m), {})), photos: photosNow(keyOf("photos", m)) };
  };
  /** The leaf has landed: the book is open at that month now. */
  const onTurned = (dir: 1 | -1) => {
    const m = stepMonth(month, dir);
    setMonth(m); setValues(load(keyOf("values", m), {})); setNotes(load(keyOf("notes", m), {})); setPhotos(photosNow(keyOf("photos", m)));
  };
  // Once a month, until a copy has been saved in it: the book lives only on this phone (see backup.ts).
  // Not in dev, where it would sit on top of every screenshot - `?husk` shows it there.
  const [prompt, setPrompt] = useState<Prompt | null>(() => {
    if (import.meta.env.DEV && !new URLSearchParams(location.search).has("husk")) return null;
    const d = new Date(), ym = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const savedAt = Number(localStorage.getItem(BACKUP_AT)) || 0;
    if (localStorage.getItem(BACKUP_ASKED) === ym || savedAt >= new Date(d.getFullYear(), d.getMonth(), 1).getTime()) return null;
    localStorage.setItem(BACKUP_ASKED, ym); // asked once this month, whatever the answer
    return { kind: "reminder" };
  });
  const [sound, setSound] = useState(soundOn);
  const [busyNote, setBusyNote] = useState("");   // what the backup buttons are doing, shown in the sheet
  const [confirmWipe, setConfirmWipe] = useState(false); // "Ryd" asks twice: it cannot be undone
  const backupInput = useRef<HTMLInputElement>(null);
  const close = () => { setPrompt(null); setBusyNote(""); setConfirmWipe(false); };
  const fileInput = useRef<HTMLInputElement>(null);
  const fileSlot = useRef("");
  const book = useRef<BookCanvasHandle>(null);
  const scene = useRef<Scene>(sceneOf(month, values, notes));
  scene.current = { ...sceneOf(month, values, notes), writing: scene.current.writing };

  setHand(hand); // the hit-test measures text here too, and the widths differ between the two hands
  const redraw = () => book.current?.redraw();
  useEffect(() => { book.current?.setPhotos(photos); book.current?.refresh(); }, [month, columns, values, notes, hand, photos]);
  // The pictures come out of IndexedDB, which cannot be read on the spot: the month on screen is read first and
  // shown as soon as it is there, then its neighbours, so a leaf taken hold of already has theirs in hand.
  useEffect(() => {
    let live = true;
    (async () => {
      await migratePhotos();
      const mine = await warmPhotos(keyOf("photos", month));
      if (live) setPhotos(mine);
      for (const dir of [1, -1] as const) await warmPhotos(keyOf("photos", stepMonth(month, dir)));
    })();
    return () => { live = false; };
  }, [month]);

  /** Write it in the book the way a hand would: the rubber first goes over what was taken away, then the pen
   *  writes what was added - and only that. Adding a question mark writes the question mark, not the sentence. */
  const startPen = (key: string, w: Omit<Writing, "key" | "start" | "eraseMs" | "writeMs"> & { eraseChars: number; writeChars: number }) => {
    const pen: Writing = { key, start: performance.now(), eraseMs: penMs(w.eraseChars), writeMs: penMs(w.writeChars), erase: w.erase, eraseEdits: w.eraseEdits, writeEdits: w.writeEdits };
    if (!pen.eraseMs && !pen.writeMs) return;
    scene.current.writing = pen;
    eraseSound(pen.eraseMs);
    penSound(pen.writeMs, pen.eraseMs);
    const step = () => {
      if (scene.current.writing !== pen) return; // something else is being written now
      redraw();
      if (performance.now() - pen.start < pen.eraseMs + pen.writeMs) requestAnimationFrame(step);
      else { scene.current.writing = null; redraw(); }
    };
    requestAnimationFrame(step);
  };
  const write = (key: string, value: string | null, pen = true) => {
    const before = values[key] ?? "", after = value ?? "";
    const next = { ...values };
    if (!after) delete next[key]; else next[key] = after;
    setValues(next);
    localStorage.setItem(VALUES_KEY, JSON.stringify(next));
    if (!pen || before === after) return;
    const k = prefixLen(before, after); // "71,4" -> "71,5" changes one digit, and that is all that moves
    startPen(key, {
      erase: before || undefined,
      eraseEdits: [{ line: 0, from: k }], writeEdits: [{ line: 0, from: k }],
      eraseChars: Math.max(0, before.length - k), writeChars: Math.max(0, after.length - k),
    });
  };
  const saveColumns = (next: Column[]) => {
    setColumns(next);
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    setPrompt(null);
  };
  const saveNote = (field: NoteField, text: string) => {
    const before = lines(notes[field] ?? ""), after = lines(text);
    const next = { ...notes, [field]: text };
    setNotes(next);
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    setPrompt(null);
    startPen(field, { erase: before.join("\n"), ...diffLines(before, after) });
  };

  /** How near the dot the finger has to land before it can slide it, in world px (a cell is 20). */
  const DOT_REACH = 12;

  /** Where in a dots column the finger is, as a whole 0..10 (Lukas: no halves). `x` is measured from its left edge. */
  const dotValue = (x: number) => Math.min(10, Math.max(0, Math.round(((x - dotX(0)) / (dotX(10) - dotX(0))) * 10)));

  /** A finger ON THE DOT in the sleep graph slides it, rather than panning the book. Anywhere else in the cell
   *  is not enough: a finger sweeping across the page would drag the dots it passed (Lukas). The day is fixed
   *  when the finger goes down, so a drag that wanders up or down still moves the dot it started on.
   *  BookCanvas decides the rest: it only hands the drag over if the finger then moves slowly and sideways. */
  const grab = (wx: number, wy: number) => {
    const hit = hitTest(wx, wy, columns, DAYS, notes);
    if (!hit || hit.kind !== "cell" || hit.col.type !== "dots") return null;
    const key = `${hit.day}:${hit.col.id}`;
    const v0 = values[key];
    if (v0 === undefined) return null; // no dot yet: a tap puts one down, there is nothing to slide
    const left = RIGHT_PAGE.x + columnXs(columns)[columns.indexOf(hit.col) + 1];
    if (Math.abs(wx - (left + dotX(Number(v0)))) > DOT_REACH) return null;
    let last = v0;
    return (mx: number) => {
      const v = String(dotValue(mx - left));
      if (v === last) return; // one redraw per step, not one per frame
      last = v;
      write(key, v, false);
    };
  };

  /** Photos go in as small JPEGs: a phone picture is 3-4 MB, and four of those would not fit in localStorage. */
  const shrink = (file: File) => new Promise<string>((done, fail) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      done(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
  const savePhotos = (next: Photos) => {
    setPhotos(next);
    setPrompt(null);
    savePhotosTo(PHOTOS_KEY, next).catch(() => alert("Der er ikke plads til flere billeder på telefonen. Fjern et af dem først."));
  };
  const pickPhoto = (slot: string) => { fileSlot.current = slot; fileInput.current?.click(); };

  /** Save the whole book to a file, read one back, or empty this month. The book lives only on this phone. */
  const saveCopy = async () => {
    setBusyNote("Samler bogen …");
    try {
      const how = await downloadBackup();
      localStorage.setItem(BACKUP_AT, String(Date.now()));
      setBusyNote(how === "delt" ? "Kopien er klar – vælg hvor den skal gemmes." : "Kopien er hentet.");
    }
    catch (e) { setBusyNote((e as Error).name === "AbortError" ? "" : "Kunne ikke gemme kopien."); }
  };
  const onBackupFile = async (e: FormEvent<HTMLInputElement>) => {
    const file = (e.currentTarget.files ?? [])[0];
    e.currentTarget.value = "";
    if (!file) return;
    setBusyNote("Læser kopien …");
    try {
      const n = await restoreBackup(file);
      setBusyNote(`${n} ${n === 1 ? "måned" : "måneder"} hentet ind. Åbner bogen igen …`);
      setTimeout(() => location.reload(), 900); // every month's state was replaced under us: start clean
    } catch (err) { setBusyNote((err as Error).message || "Kunne ikke læse filen."); }
  };
  const wipeMonth = async () => {
    if (!confirmWipe) { setConfirmWipe(true); setTimeout(() => setConfirmWipe(false), 4000); return; }
    setConfirmWipe(false);
    await clearMonth(month.year, month.month);
    setValues({}); setNotes({}); setPhotos({});
    setPrompt(null);
  };
  const onFile = async (e: FormEvent<HTMLInputElement>) => {
    const file = (e.currentTarget.files ?? [])[0];
    e.currentTarget.value = ""; // so the same picture can be chosen again
    if (!file) return;
    savePhotos({ ...photos, [fileSlot.current]: await shrink(file) });
  };

  const onTap = (wx: number, wy: number) => {
    const hit = hitTest(wx, wy, columns, DAYS, notes);
    if (!hit) return;
    if (hit.kind === "cell") {
      const { day, col } = hit, key = `${day}:${col.id}`;
      if (col.type === "check") return write(key, values[key] ? null : "x");
      if (col.type === "dots") {
        const v = dotValue(hit.fx * widthOf("dots") * CELL);
        return write(key, values[key] === String(v) ? null : String(v));
      }
      return setPrompt({ kind: "value", key, label: `${col.name} · ${day}. ${MONTHS_DA[month.month - 1].toLowerCase()}`, value: values[key] ?? "", rating: col.type === "rating" });
    }
    if (hit.kind === "photo") return photos[hit.slot] ? setPrompt({ kind: "photo", slot: hit.slot }) : pickPhoto(hit.slot);
    if (hit.kind === "header") return setPrompt({ kind: "column", index: hit.index, column: columns[hit.index] });
    if (hit.kind === "add") return setPrompt({ kind: "column", index: -1, column: { id: generateId(), name: "", type: "check" } });
    // the goals are written straight onto their line; everything else is a list of points with a dot in front
    setPrompt({ kind: "note", field: hit.field, label: NOTE_LABEL[hit.field], value: notes[hit.field] ?? "", bullets: !hit.field.startsWith("goal") });
  };

  const submitValue = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = (new FormData(e.currentTarget).get("v") as string).trim().replace(".", ",");
    write((prompt as ValuePrompt).key, v);
    setPrompt(null);
  };
  const submitColumn = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const p = prompt as ColumnPrompt;
    const col: Column = { ...p.column, name: (new FormData(e.currentTarget).get("name") as string).trim() };
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
      <BookCanvas ref={book} width={BOOK_W} height={BOOK_H} scene={scene} onTap={onTap} grab={grab} otherScene={otherScene} onTurned={onTurned} backdrop={<Backdrop />} />
      <span className="build">{__BUILD__}</span>
      <button className="turn prev" onClick={() => book.current?.turn(-1)} aria-label="Forrige måned">‹</button>
      <button className="turn next" onClick={() => book.current?.turn(1)} aria-label="Næste måned">›</button>
      <input ref={fileInput} type="file" accept="image/*" hidden onInput={onFile} />
      <input ref={backupInput} type="file" accept="application/json,.json" hidden onInput={onBackupFile} />
      <button className="hand-pick" onClick={() => setPrompt({ kind: "settings" })} aria-label="Indstillinger">✎</button>

      {prompt?.kind === "photo" && (
        <Sheet title="Billede" onClose={close}>
          <div className="sheet-row">
            <button type="button" className="ghost" onClick={() => pickPhoto(prompt.slot)}>Vælg et andet</button>
            <button type="button" className="danger" onClick={() => { const next = { ...photos }; delete next[prompt.slot]; savePhotos(next); }}>Fjern</button>
          </div>
        </Sheet>
      )}
      {prompt?.kind === "reminder" && (
        <Sheet title="Gem en kopi af bogen?" onClose={close}>
          <p className="sheet-note">Bogen findes kun på denne telefon. En kopi i Filer eller iCloud gør, at intet går tabt, hvis telefonen bliver væk eller ryddes.</p>
          <div className="sheet-row">
            <button type="button" className="ghost" onClick={close}>Ikke nu</button>
            <button type="button" className="primary" onClick={saveCopy}>Gem en kopi</button>
          </div>
          {busyNote && <p className="sheet-note">{busyNote}</p>}
        </Sheet>
      )}
      {prompt?.kind === "settings" && (
        <Sheet title="Indstillinger" onClose={close}>
          <p className="sheet-label">Håndskrift</p>
          <div className="chips wide">
            {(Object.keys(HANDS) as Hand[]).map((h) => (
              <button type="button" key={h} className={"chip" + (h === hand ? " on" : "")}
                      onClick={() => { setHandState(h); localStorage.setItem(HAND_KEY, h); }}>{HANDS[h]}</button>
            ))}
          </div>
          {/* The only copy of the book there is: an app on the home screen and the same book in Safari are two
              separate stores on iOS, and nothing backs either of them up. */}
          <p className="sheet-label">Lyd</p>
          <div className="chips wide">
            {[true, false].map((on) => (
              <button type="button" key={String(on)} className={"chip" + (on === sound ? " on" : "")}
                      onClick={() => { setSound(on); setSoundOn(on); }}>{on ? "Til" : "Fra"}</button>
            ))}
          </div>
          <p className="sheet-label">Sikkerhedskopi</p>
          <div className="sheet-row">
            <button type="button" className="ghost" onClick={saveCopy}>Gem en kopi</button>
            <button type="button" className="ghost" onClick={() => backupInput.current?.click()}>Hent en kopi ind</button>
          </div>
          <p className="sheet-note">{busyNote || "Kopien indeholder alle måneder, også billederne. Gem den i Filer eller iCloud."}</p>
          <p className="sheet-label">Denne måned</p>
          <button type="button" className="danger" onClick={wipeMonth}>
            {confirmWipe ? `Tryk igen for at rydde ${labelOf(month).toLowerCase()}` : "Ryd " + labelOf(month).toLowerCase()}
          </button>
          <p className="sheet-note">Sletter alt på begge sider i denne måned. Gem en kopi først.</p>
        </Sheet>
      )}

      {prompt?.kind === "value" && (
        <Sheet title={prompt.label} onClose={close} onSubmit={submitValue}>
          {prompt.rating ? (
            // a rating is one of ten numbers: tap it, no keyboard
            <div className="chips">
              {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
                <button type="button" key={n} className={"chip" + (Math.round(Number(prompt.value.replace(",", "."))) === Number(n) ? " on" : "")}
                        onClick={() => { write(prompt.key, prompt.value === n ? null : n); close(); }}>{n}</button>
              ))}
            </div>
          ) : (
            <input className="hand-input" name="v" inputMode="decimal" autoFocus defaultValue={prompt.value} placeholder="—" />
          )}
          <div className="sheet-row">
            {prompt.value !== "" && <button type="button" className="danger" onClick={() => { write(prompt.key, null); close(); }}>Slet</button>}
            {!prompt.rating && <button type="submit" className="primary">Skriv</button>}
          </div>
        </Sheet>
      )}
      {prompt?.kind === "note" && (
        <Sheet title={prompt.label} onClose={close} onSubmit={submitNote}>
          <Lines value={prompt.value} bullets={prompt.bullets} />
          <div className="sheet-row">
            {/^goal\d+$/.test(prompt.field) && prompt.value && (
              // a goal reached gets a yellow star, drawn by the pen like everything else; tapped again it is rubbed out
              <button type="button" className="ghost" onClick={() => { const k = "done-" + prompt.field; write(k, values[k] ? null : "x"); close(); }}>
                {values["done-" + prompt.field] ? "Ikke nået alligevel" : "Nået ★"}
              </button>
            )}
            <button type="submit" className="primary">Skriv</button>
          </div>
        </Sheet>
      )}
      {prompt?.kind === "column" && (
        <Sheet title={prompt.index < 0 ? "Ny kolonne" : "Ret kolonne"} onClose={close} onSubmit={submitColumn}>
          <input className="hand-input" name="name" autoFocus defaultValue={prompt.column.name} placeholder="Navn" maxLength={16} />
          <div className="chips wide">
            {(Object.keys(TYPE_LABEL) as ColType[]).map((t) => (
              <button type="button" key={t} className={"chip" + (prompt.column.type === t ? " on" : "")}
                      onClick={() => setPrompt({ ...prompt, column: { ...prompt.column, type: t } })}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
          <div className="sheet-row">
            {prompt.index >= 0 && <button type="button" className="danger" onClick={() => saveColumns(columns.filter((_, i) => i !== prompt.index))}>Slet</button>}
            <button type="submit" className="primary">Gem</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
