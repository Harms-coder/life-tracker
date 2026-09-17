#!/usr/bin/env python3
"""haandskrift/fotos/*.jpg  ->  src/glyffer.json  (Lukas' own handwriting as SVG paths)

For each photo: find the four black corner squares, rectify the sheet onto the template's own geometry
(haandskrift/skabelon.json), work out which of the three sheets it is, cut out all 5 x 29 boxes, drop the
template's light blue printing, keep only the pen, and trace what is left into an SVG path.

Run: python3 tools/glyffer.py [--debug]   (--debug also writes arbejde/ with the rectified sheets and cut-outs)
"""
import json, subprocess, sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SKAB = json.loads((ROOT / "haandskrift/skabelon.json").read_text())
OUT = ROOT / "src/glyffer.json"
WORK = ROOT / "haandskrift/arbejde"
DEBUG = "--debug" in sys.argv
PAGE_W, PAGE_H = 1654, 2339  # the template rendered at 200 dpi; the photos are rectified onto this
GLYPH = 256                  # px the cut-out box is scaled to before tracing


def corner_squares(gray):
    """The four solid black squares, as (x, y) in image pixels, ordered tl, tr, br, bl."""
    h, w = gray.shape
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    th = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 101, 20)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(th, 8)
    side = 0.018 * max(w, h)
    cands = [(cent[i][0], cent[i][1], stats[i][4]) for i in range(1, n)
             if 0.4 * side < stats[i][2] < 2.6 * side and 0.4 * side < stats[i][3] < 2.6 * side
             and stats[i][4] > 0.55 * stats[i][2] * stats[i][3]
             and abs(stats[i][2] - stats[i][3]) < 0.4 * max(stats[i][2], stats[i][3])]
    if len(cands) < 4:
        raise SystemExit(f"  fandt kun {len(cands)} hjoernefirkanter – fotografer arket igen med alle fire hjoerner med")
    pts = []
    for cx, cy in [(0, 0), (w, 0), (w, h), (0, h)]:
        x, y, _ = min(cands, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        pts.append((x, y))
    if len({(round(x), round(y)) for x, y in pts}) < 4:
        raise SystemExit("  de fire hjoerner faldt sammen – er et hjoerne skaaret af?")
    return np.float32(pts)


def rectify(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    src = corner_squares(gray)
    c = SKAB["pages"][0]["corners"]
    dst = np.float32([[c[k][0] * PAGE_W, c[k][1] * PAGE_H] for k in ("tl", "tr", "br", "bl")])
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (PAGE_W, PAGE_H))


def which_page(flat):
    """Match the heading band against the three rendered template pages."""
    band = cv2.cvtColor(flat[int(0.04 * PAGE_H):int(0.11 * PAGE_H)], cv2.COLOR_BGR2GRAY)
    band = cv2.resize(band, (400, 60)).astype(np.float32)
    band = (band - band.mean()) / (band.std() + 1e-6)
    best, score = None, -9
    for p in (1, 2, 3):
        stem = f"/tmp/glyf_ref_{p}"
        if not list(Path("/tmp").glob(f"glyf_ref_{p}-*.png")):
            subprocess.run(["pdftoppm", "-r", "200", "-png", "-f", str(p), "-l", str(p),
                            str(ROOT / "haandskrift/haandskrift-skabelon.pdf"), stem],
                           check=True, env={"PATH": "/opt/homebrew/bin:/usr/bin:/bin"})
        ref = cv2.imread(str(next(Path("/tmp").glob(f"glyf_ref_{p}-*.png"))), cv2.IMREAD_GRAYSCALE)
        rb = cv2.resize(ref[int(0.04 * ref.shape[0]):int(0.11 * ref.shape[0])], (400, 60)).astype(np.float32)
        rb = (rb - rb.mean()) / (rb.std() + 1e-6)
        s = float((band * rb).mean())
        if s > score: best, score = p, s
    return best, score


def snap(flat, y0, y1, x0, x1, win=9):
    """The template's box may sit a few px off after rectifying. Find the printed frame itself – the darkest
       line within `win` px of each expected edge – and return the box just inside it."""
    pad = win + 6
    sub = flat[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
    oy, ox = y0 - max(0, y0 - pad), x0 - max(0, x0 - pad)
    dark = 255 - cv2.cvtColor(sub, cv2.COLOR_BGR2GRAY).astype(int)
    rows, cols = dark.mean(1), dark.mean(0)
    def edge(prof, at):
        lo, hi = max(0, at - win), min(len(prof), at + win + 1)
        return lo + int(np.argmax(prof[lo:hi])) if hi > lo else at
    ty, by = edge(rows, oy), edge(rows, oy + (y1 - y0))
    lx, rx = edge(cols, ox), edge(cols, ox + (x1 - x0))
    m = 3  # just inside the printed line
    return sub[ty + m:by - m, lx + m:rx - m]


def ink(cell, baseline):
    """Binary mask of the pen inside one box: everything darker than the paper, with the template's own
       light blue printing removed by its colour."""
    b, g, r = (cell[..., i].astype(int) for i in range(3))
    blue_print = (b - r > 12) & (b > g - 6) & (r < 245)   # the box edges and the dotted baseline
    lab = cv2.cvtColor(cv2.GaussianBlur(cell, (3, 3), 0), cv2.COLOR_BGR2LAB)[..., 0]
    # the paper is the bright bulk of the box; the pen is well below it
    paper = np.percentile(lab, 80)
    mask = ((lab < paper - 30) & ~blue_print).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    # keep the strokes that make up the character, drop specks and anything touching the frame
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    h, w = mask.shape
    keep = np.zeros_like(mask)
    for i in range(1, n):
        x, y, cw, ch, area = stats[i]
        if area < 0.0025 * h * w: continue                                          # speck
        # a surviving dash of the dotted baseline: flat, wide, and sitting on that line. A full stop is round,
        # so it is not caught; a hyphen sits well above the line.
        if ch < 0.05 * h and cw > 1.8 * ch and abs((y + ch / 2) / h - baseline) < 0.04: continue
        # a leftover printed box edge: a long thin line lying along the rim. A letter that touches the rim is
        # never both long and thin, and a dot on an i is short, so neither is caught by this.
        if (x <= 1 or x + cw >= w - 1) and ch > 0.5 * h and cw < 0.12 * w: continue
        if (y <= 1 or y + ch >= h - 1) and cw > 0.5 * w and ch < 0.12 * h: continue
        keep[labels == i] = 1
    return keep


def trace(mask, baseline):
    """potrace the mask into one glyph.

    Everything is stored in units of the box's HEIGHT, measured from the baseline, so drawing code only needs
    one scale factor (px per box height):
      w  glyph width          t  how far its top sits above the baseline      k  path units -> box heights
      tx,ty,sx,sy             potrace's own transform, applied before k
    """
    if mask.sum() < 20: return None
    ys, xs = np.nonzero(mask)
    H, W = mask.shape
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    # a scribbled-out box: ink covering most of a large area (the crossed-out AE came out at 0.54, the most
    # solid real letter, a B, at 0.37). A full stop is just as solid but far too small to be caught.
    if mask.sum() > 0.45 * bw * bh and bw > 0.25 * W and bh > 0.25 * H: return None
    pad = 2
    sub = mask[max(0, ys.min() - pad):ys.max() + 1 + pad, max(0, xs.min() - pad):xs.max() + 1 + pad]
    tmp = Path("/tmp/glyf.pbm")
    cv2.imwrite(str(tmp), (1 - sub) * 255)
    svg = subprocess.run(["potrace", "-s", "-o", "-", "--flat", "-a", "1.2", "-t", "2", "-O", "0.6", str(tmp)],
                         capture_output=True, check=True,
                         env={"PATH": "/opt/homebrew/bin:/usr/bin:/bin"}).stdout.decode()
    import re
    paths = re.findall(r'\sd="([^"]+)"', svg)
    vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg)
    tr = re.search(r'translate\(([-\d.]+),([-\d.]+)\)[^"]*scale\(([-\d.]+),([-\d.]+)\)', svg)
    if not paths or not vb or not tr: return None
    vw, vh = float(vb.group(1)), float(vb.group(2))
    # the traced image includes `pad` px of margin on each side; scale by the padded height
    box_h = (sub.shape[0]) / H
    r = lambda v: round(float(v), 5)
    return {"d": " ".join(paths),
            "k": r(box_h / vh),
            "w": r(sub.shape[1] / H),
            "t": r(baseline - (ys.min() - pad) / H),
            "tr": [r(float(x)) for x in tr.groups()]}


def main():
    if DEBUG: WORK.mkdir(exist_ok=True)
    for h in list((ROOT / "haandskrift/fotos").glob("*.heic")) + list((ROOT / "haandskrift/fotos").glob("*.HEIC")):
        jpg = h.with_suffix(".jpg")
        if not jpg.exists():
            subprocess.run(["sips", "-s", "format", "jpeg", str(h), "--out", str(jpg)],
                           check=True, capture_output=True)
            print(f"{h.name} -> {jpg.name}", file=sys.stderr)
    glyphs, report = {}, []
    for f in sorted((ROOT / "haandskrift/fotos").glob("*.jpg")):
        img = cv2.imread(str(f))
        flat = rectify(img)
        page, score = which_page(flat)
        print(f"{f.name}: side {page} (match {score:.2f})", file=sys.stderr)
        if DEBUG: cv2.imwrite(str(WORK / f"opret-side{page}.jpg"), flat)
        cells = SKAB["pages"][page - 1]["cells"]
        base = SKAB["pages"][page - 1]["baseline"]
        empty = []
        for c in cells:
            y0, y1 = int(c["y"][0] * PAGE_H), int(c["y"][1] * PAGE_H)
            variants = []
            for k, (x0f, x1f) in enumerate(c["x"]):
                x0, x1 = int(x0f * PAGE_W), int(x1f * PAGE_W)
                cell = snap(flat, y0, y1, x0, x1)
                g = trace(ink(cell, base), base)
                if g: variants.append(g)
                elif DEBUG: cv2.imwrite(str(WORK / f"tom-{page}-{ord(c['char'])}-{k}.png"), cell)
            if variants: glyphs[c["char"]] = variants
            else: empty.append(c["char"])
            if len(variants) < 5: report.append((c["char"], len(variants)))
        if empty: print(f"  tomme: {' '.join(empty)}", file=sys.stderr)
    OUT.write_text(json.dumps(glyphs, ensure_ascii=False, separators=(",", ":")))
    thin = [f"{c}({n})" for c, n in report]
    print(f"-> {OUT}  {len(glyphs)} tegn, {sum(len(v) for v in glyphs.values())} varianter", file=sys.stderr)
    if thin: print(f"   faerre end 5 varianter: {' '.join(thin)}", file=sys.stderr)


main()
