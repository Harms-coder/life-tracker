#!/usr/bin/env python3
"""Measure the template's geometry once, from the PDF itself, into haandskrift/skabelon.json.

Everything downstream (cutting glyphs out of Lukas' photos) needs to know exactly where each box sits.
Rather than trusting numbers typed by hand, this renders the PDF and finds:
  corners – the four black squares, used to rectify a photo onto the page
  boxes   – the light blue cells, 5 per character, grouped into rows of 3 characters
  baseline – the dotted line inside each box (the glyph's baseline), as a fraction of the box height
All coordinates are fractions of the page, so they hold at any photo resolution.
"""
import json, subprocess, sys

import cv2
from pathlib import Path
import numpy as np
from PIL import Image

PDF = Path("haandskrift/haandskrift-skabelon.pdf")
OUT = Path("haandskrift/skabelon.json")
DPI = 200
# the character each row of 3 holds, page by page, in the order they are printed
PAGES = [
    ["0","1","2","3","4","5","6","7","8","9","X","✓","•","○","—",".",",","-",":","/","!","?","(",")","%","+","'","&","="],
    list("abcdefghijklmnopqrstuvwxyzæøå"),
    list("ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ"),
]

def render(page):
    stem = f"/tmp/skab_cal_{page}"
    subprocess.run(["pdftoppm","-r",str(DPI),"-png","-f",str(page),"-l",str(page),str(PDF),stem],
                   check=True, env={"PATH":"/opt/homebrew/bin:/usr/bin:/bin"})
    return Image.open(next(Path("/tmp").glob(f"skab_cal_{page}-*.png"))).convert("RGB")

def runs(mask, lo):
    """start/end indices of True-runs at least `lo` long"""
    out, s = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and s is None: s = i
        elif not v and s is not None:
            if i - s >= lo: out.append((s, i))
            s = None
    return out

def measure(im):
    a = np.asarray(im).astype(int)
    H, W, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dark = (r < 90) & (g < 90) & (b < 90)
    blue = (np.abs(r - 158) < 55) & (np.abs(g - 199) < 45) & (np.abs(b - 217) < 45)  # the template's light blue, rgb(158,199,217)

    # corners: the four solid black squares. Found as connected components that are square and about the right
    # size, then the one nearest each corner of the page – the heading is dark too, so a plain "darkest in this
    # quarter" would drift towards it.
    n, lab, stats, cent = cv2.connectedComponentsWithStats(dark.astype(np.uint8), 8)
    side = 0.018 * max(W, H)  # the squares are ~6.5 mm on an A4
    cands = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if not (0.45 * side < w < 2.2 * side and 0.45 * side < h < 2.2 * side): continue
        if area < 0.55 * w * h or abs(w - h) > 0.35 * max(w, h): continue  # solid and square
        cands.append((cent[i][0], cent[i][1]))
    corners = {}
    for name, (cx, cy) in {"tl": (0, 0), "tr": (W, 0), "bl": (0, H), "br": (W, H)}.items():
        if not cands: continue
        x, y = min(cands, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        corners[name] = [round(x / W, 6), round(y / H, 6)]
    if len(corners) < 4 or len(set(map(tuple, corners.values()))) < 4:
        print(f"  advarsel: fandt ikke fire tydelige hjoernefirkanter ({len(cands)} kandidater)", file=sys.stderr)

    # boxes: rows of blue, then columns within each row
    rows = runs(blue.sum(1) > W * 0.007, int(0.012 * H))  # inside a row only the ~18 vertical dividers are blue
    boxes = []
    for y0, y1 in rows:
        band = blue[y0:y1]
        cols = runs(band.sum(0) > (y1 - y0) * 0.5, 1)  # a divider is only 1-3 px wide
        if len(cols) < 6: continue
        # 6 dividers per character (5 cells). The gap between two characters is exactly one cell wide, so the
        # dividers come out evenly spaced and the blocks cannot be told apart by distance: take them 6 at a time.
        xs = [(c0 + c1) / 2 for c0, c1 in cols]
        if len(xs) % 6: print(f"  advarsel: {len(xs)} skillelinjer i en raekke, ikke et multiplum af 6", file=sys.stderr)
        row = [[[round(xs[k] / W, 6), round(xs[k + 1] / W, 6)] for k in range(i, i + 5)] for i in range(0, len(xs) - 5, 6)]
        boxes.append({"y": [round(y0 / H, 6), round(y1 / H, 6)], "chars": row})

    # the dotted baseline: the one broken blue line inside a cell (the solid ones are its top and bottom edges)
    base = None
    if boxes and boxes[0]["chars"]:
        (bx0, bx1), (by0, by1) = boxes[0]["chars"][0][0], boxes[0]["y"]
        cell = blue[int(by0 * H):int(by1 * H), int(bx0 * W) + 3:int(bx1 * W) - 3]
        wide = cell.shape[1]
        dotted = [i for i, v in enumerate(cell.sum(1)) if 0.1 * wide < v < 0.8 * wide]
        if dotted: base = round(float(np.mean(dotted)) / cell.shape[0], 4)
    return corners, boxes, base

def main():
    pages = []
    for p in (1, 2, 3):
        im = render(p)
        corners, boxes, base = measure(im)
        chars = PAGES[p - 1]
        cells, i = [], 0
        for row in boxes:
            for col in row["chars"]:
                if i >= len(chars): break
                cells.append({"char": chars[i], "y": row["y"], "x": col})
                i += 1
        pages.append({"page": p, "corners": corners, "baseline": base, "cells": cells})
        n5 = sum(1 for c in cells if len(c["x"]) == 5)
        print(f"side {p}: {len(cells)} tegn ({n5} med 5 bokse), forventet {len(chars)}, grundlinje {base} nede i boksen", file=sys.stderr)
        missing = [c["char"] for c in cells if len(c["x"]) != 5]
        if missing: print("   ikke 5 bokse:", missing, file=sys.stderr)
        if i < len(chars): print("   MANGLER:", chars[i:], file=sys.stderr)
    OUT.write_text(json.dumps({"dpi": DPI, "pages": pages}, ensure_ascii=False, indent=1))
    print(f"-> {OUT}", file=sys.stderr)

main()
