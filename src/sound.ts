/**
 * The book's sounds: three short recordings (generated in Higgsfield, public/lyd/, raw files in
 * baggrund-kilder/lyd/) played through Web Audio. The pen and the rubber are cut to however long the writing
 * takes, from a random place in the recording so it never sounds the same twice; the leaf plays whole.
 *
 * iOS only lets a page make sound after a touch, so the context is woken (and the files fetched) on the first
 * one. The phone's silent switch mutes it, as it does every other web page.
 */
const KEY = "sound";
const FILES = { pen: 0.9, visk: 0.45, blad: 0.8 } as const; // name -> how loud it plays
type Name = keyof typeof FILES;
let ctx: AudioContext | null = null;
const buffers: Partial<Record<Name, AudioBuffer>> = {};

export const soundOn = () => localStorage.getItem(KEY) !== "0";
export const setSoundOn = (on: boolean) => localStorage.setItem(KEY, on ? "1" : "0");

function wake() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    for (const name of Object.keys(FILES) as Name[]) {
      fetch(`${import.meta.env.BASE_URL}lyd/${name}.mp3`).then((r) => r.arrayBuffer())
        .then((b) => ctx!.decodeAudioData(b)).then((buf) => (buffers[name] = buf)).catch(() => {});
    }
  }
  if (ctx.state === "suspended") ctx.resume();
}
for (const ev of ["touchend", "pointerdown"]) document.addEventListener(ev, wake, { passive: true });

/** Play `name` for `ms` (the whole of it if left out), starting `delay` ms from now, fading in and out. */
function play(name: Name, ms?: number, delay = 0) {
  const buf = buffers[name];
  if (!soundOn() || !ctx || !buf || ctx.state !== "running") return;
  const len = ms === undefined ? buf.duration : Math.min(ms / 1000, 6);
  if (len <= 0) return;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.loop = len > buf.duration;
  src.connect(g).connect(ctx.destination);
  const t0 = ctx.currentTime + delay / 1000, v = FILES[name];
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + 0.03);
  g.gain.setValueAtTime(v, t0 + Math.max(0.03, len - 0.08));
  g.gain.linearRampToValueAtTime(0, t0 + len);
  const from = ms === undefined ? 0 : Math.random() * Math.max(0, buf.duration - len);
  src.start(t0, from);
  src.stop(t0 + len + 0.05);
}

export const penSound = (ms: number, delay = 0) => play("pen", ms, delay);
export const eraseSound = (ms: number) => play("visk", ms);
export const turnSound = (ms: number) => play("blad", ms + 250);
