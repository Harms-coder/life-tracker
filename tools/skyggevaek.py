#!/usr/bin/env python3
"""Take one shadow band off the table, in the photo and in the top-down table top.

Lukas: the left band is the shadow of the window's centre post and belongs there; the right one has nothing
to cast it. Rather than generating the pictures again and losing the composition he already approved, the band
is lifted back to the brightness of the wood beside it.

A shadow is multiplicative - less light falling on the same wood - so dividing it out restores the grain
underneath instead of washing it flat. For each row: read the light level just outside the band on both sides,
interpolate straight across, and scale the pixels up to meet it. A soft edge keeps the repair invisible.

Run: python3 tools/skyggevaek.py        (writes the files in public/baggrund in place)
"""
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent

# The band to remove, as fractions of the image: its centre x at the top and bottom of the span, its width,
# and the rows it runs through. Measured off the brightness profile of each picture.
JOBS = [
    dict(path="public/baggrund/aften.jpg", x_top=0.730, y_top=0.48, x_bot=0.865, y_bot=0.68,
         width=0.095, y_from=0.36, y_to=0.80),
    dict(path="public/baggrund/bord.webp", x_top=0.807, y_top=0.02, x_bot=0.987, y_bot=0.45,
         width=0.115, y_from=0.0, y_to=0.70),
]


def remove(img: np.ndarray, j: dict) -> np.ndarray:
    H, W = img.shape[:2]
    out = img.astype(np.float32).copy()
    # the light falling on the table, without the grain: blur hard enough that only the lighting is left
    light = cv2.cvtColor(cv2.GaussianBlur(img, (0, 0), max(6.0, W / 90)), cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
    half = j["width"] * W / 2
    y0, y1 = int(j["y_from"] * H), int(j["y_to"] * H)
    gain = np.ones((H, W), np.float32)

    for y in range(y0, y1):
        t = (y / H - j["y_top"]) / (j["y_bot"] - j["y_top"])
        cx = (j["x_top"] + (j["x_bot"] - j["x_top"]) * t) * W
        a, b = cx - half, cx + half
        # sample the lit wood a little way outside each side of the band; fall back to the other side at the edge
        la = light[y, max(0, int(a - half * 0.7)):max(1, int(a - half * 0.15))]
        lb = light[y, min(W - 1, int(b + half * 0.15)):min(W, int(b + half * 0.7))]
        left = float(np.median(la)) if la.size else None
        right = float(np.median(lb)) if lb.size else None
        if left is None and right is None:
            continue
        if left is None: left = right
        if right is None: right = left

        xs = np.arange(max(0, int(a - half)), min(W, int(b + half)))
        if xs.size == 0:
            continue
        # what the light would be without the band: straight across from one side to the other
        want = left + (right - left) * np.clip((xs - a) / max(b - a, 1.0), 0, 1)
        have = np.maximum(light[y, xs], 1.0)
        g = np.clip(want / have, 1.0, 1.8)
        # only inside the band, and fading out over its edges so the repair has no seam
        d = np.abs(xs - cx) / half
        fade = np.clip(1.0 - (d - 0.85) / 0.55, 0.0, 1.0)   # full across the band, easing off past its edge
        gain[y, xs] = 1.0 + (g - 1.0) * fade

    gain = cv2.GaussianBlur(gain, (0, 0), max(4.0, W / 260))
    return np.clip(out * gain[..., None], 0, 255).astype(np.uint8)


def main():
    for j in JOBS:
        p = ROOT / j["path"]
        raw = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
        if raw is None:
            raise SystemExit(f"kan ikke laese {p}")
        alpha = raw[..., 3:] if raw.ndim == 3 and raw.shape[2] == 4 else None
        bgr = raw[..., :3]
        fixed = remove(bgr, j)
        if alpha is not None:
            fixed = np.dstack([fixed, alpha])
        if p.suffix == ".webp":
            cv2.imwrite(str(p), fixed, [cv2.IMWRITE_WEBP_QUALITY, 72])
        else:
            cv2.imwrite(str(p), fixed, [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"{j['path']}: hoejre skyggebaand fjernet")


main()
