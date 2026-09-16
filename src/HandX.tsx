import { seededRandom } from "./random";

/**
 * A hand-drawn X. Two slightly curved strokes with seeded jitter in
 * position, rotation, curvature and stroke width, so no two cells match
 * but each cell is stable across renders. Drawn in a 20x20 box.
 */
export function HandX({ seed, animate }: { seed: string; animate: boolean }) {
  const rnd = seededRandom(seed);
  const j = (amount: number) => (rnd() - 0.5) * 2 * amount;

  const stroke = (x1: number, y1: number, x2: number, y2: number) => {
    // control point offset perpendicular to the stroke => gentle curve
    const mx = (x1 + x2) / 2 + j(2.2);
    const my = (y1 + y2) / 2 + j(2.2);
    return `M${x1 + j(1.6)} ${y1 + j(1.6)} Q${mx} ${my} ${x2 + j(1.6)} ${y2 + j(1.6)}`;
  };

  const inset = 3.5 + j(1);
  const a = stroke(inset, inset, 20 - inset, 20 - inset);
  const b = stroke(20 - inset, inset + j(1), inset, 20 - inset);
  const rotate = j(9);
  const dx = j(1.5);
  const dy = j(1.5);
  const width = 1.5 + rnd() * 0.7;
  const first = rnd() < 0.5;

  return (
    <svg
      viewBox="0 0 20 20"
      className={"hand-x" + (animate ? " hand-x--write" : "")}
      style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)` }}
    >
      <path d={first ? a : b} strokeWidth={width} />
      <path d={first ? b : a} strokeWidth={width * (0.9 + rnd() * 0.2)} />
    </svg>
  );
}
