/**
 * The book's sounds, made on the spot with Web Audio - no files to fetch. Filtered noise is what paper sounds
 * like: a narrow, high band scratching in short strokes is a pen, a lower one rubbed back and forth is the
 * rubber, and a band sweeping up and falling off is a leaf turning over.
 *
 * iOS only lets a page make sound after a touch, so the context is woken on the first one. The phone's silent
 * switch mutes it, as it does every other web page.
 */
const KEY = "sound";
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export const soundOn = () => localStorage.getItem(KEY) !== "0";
export const setSoundOn = (on: boolean) => localStorage.setItem(KEY, on ? "1" : "0");

function wake() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
}
for (const ev of ["touchend", "pointerdown"]) document.addEventListener(ev, wake, { passive: true });

/** Noise through a band-pass filter into a gain the caller shapes over time. */
function band(freq: number, q: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noise; src.loop = true;
  const f = ctx!.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = ctx!.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(ctx!.destination);
  return { src, f, g };
}
const ready = () => soundOn() && ctx && noise && ctx.state === "running";

/** The pen: short strokes of scratching, for `ms`. */
export function penSound(ms: number) {
  if (!ready() || ms <= 0) return;
  const { src, f, g } = band(3800, 1.4), t0 = ctx!.currentTime, end = t0 + ms / 1000;
  for (let t = t0; t < end; ) {
    const len = 0.05 + Math.random() * 0.1, peak = 0.05 + Math.random() * 0.05;
    g.gain.setTargetAtTime(peak, t, 0.008);
    f.frequency.setValueAtTime(3000 + Math.random() * 1800, t);
    g.gain.setTargetAtTime(0.004, t + len, 0.015);
    t += len + 0.02 + Math.random() * 0.05;
  }
  g.gain.setTargetAtTime(0, end, 0.02);
  src.start(t0); src.stop(end + 0.2);
}

/** The rubber: a duller sound, rubbed back and forth. */
export function eraseSound(ms: number) {
  if (!ready() || ms <= 0) return;
  const { src, g } = band(1300, 0.8), t0 = ctx!.currentTime, end = t0 + ms / 1000;
  for (let t = t0; t < end; t += 0.11) {
    g.gain.setTargetAtTime(0.07, t, 0.015);
    g.gain.setTargetAtTime(0.015, t + 0.06, 0.02);
  }
  g.gain.setTargetAtTime(0, end, 0.03);
  src.start(t0); src.stop(end + 0.2);
}

/** A leaf turning over for `ms`: the paper lifting, swishing across, and settling. */
export function turnSound(ms: number) {
  if (!ready()) return;
  const { src, f, g } = band(700, 0.7), t0 = ctx!.currentTime, s = ms / 1000;
  f.frequency.setValueAtTime(700, t0);
  f.frequency.exponentialRampToValueAtTime(2600, t0 + s * 0.55);
  f.frequency.exponentialRampToValueAtTime(900, t0 + s);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.12, t0 + s * 0.5);
  g.gain.linearRampToValueAtTime(0.03, t0 + s * 0.9);
  g.gain.linearRampToValueAtTime(0, t0 + s + 0.08);
  src.start(t0); src.stop(t0 + s + 0.15);
}
