#!/usr/bin/env python3
"""A proof sheet of src/glyffer.json: every character, all its variants, drawn from the traced paths."""
import json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
g = json.loads((ROOT / "src/glyffer.json").read_text())
CELL, PAD = 72, 26
order = [c for c in "0123456789X✓•○—.,-:/!?()%+'&=" if c in g] + \
        [c for c in "abcdefghijklmnopqrstuvwxyzæøå" if c in g] + \
        [c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ" if c in g]
rows = []
for ch in order:
    cells = []
    for v in g[ch]:
        em = CELL / 0.55                      # box heights -> px, so a glyph fills most of the cell
        base = CELL * 0.78                    # where the baseline sits in the cell
        tx, ty, sx, sy = v["tr"]
        cells.append(f'<g transform="translate({(CELL - v["w"] * em) / 2:.1f},{base:.1f})">'
                     f'<g transform="translate(0,{-v["t"] * em:.2f}) scale({v["k"] * em:.5f})">'
                     f'<g transform="translate({tx},{ty}) scale({sx},{sy})">'
                     f'<path d="{v["d"]}" fill="#1e2233"/></g></g></g>')
    rows.append((ch, cells))
W = PAD + 5 * (CELL + 8) + 10
H = len(rows) * (CELL + 8) + 20
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="#fffdf6"/>']
for i, (ch, cells) in enumerate(rows):
    y = 10 + i * (CELL + 8)
    svg.append(f'<text x="4" y="{y + CELL * 0.7:.0f}" font-family="system-ui" font-size="15" fill="#888">{ch.replace("&","&amp;").replace("<","&lt;")}</text>')
    for j, c in enumerate(cells):
        x = PAD + j * (CELL + 8)
        svg.append(f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" fill="none" stroke="#e3ddc8"/>')
        svg.append(f'<g transform="translate({x},{y})">{c}</g>')
svg.append("</svg>")
out = ROOT / "screenshots/glyf-ark.svg"
out.write_text("\n".join(svg))
subprocess.run(["rsvg-convert", "-o", str(ROOT / "screenshots/glyf-ark.png"), str(out)],
               env={"PATH": "/opt/homebrew/bin:/usr/bin:/bin"}, check=False)
print(out, len(rows), "tegn")
