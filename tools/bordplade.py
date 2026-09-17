#!/usr/bin/env python3
"""baggrund-kilder/bordplade.png -> public/baggrund/bord.webp

The sharp top-down table top that fades in as the camera goes overhead. Two fix-ups:
  colour   – the generated plank is more saturated than the table in the photo; matched to the photo's mean.
  edges    – a soft alpha fade all round, so where it meets the photo there is no visible seam.
"""
import numpy as np
from PIL import Image

src = Image.open("baggrund-kilder/bordplade.png").convert("RGB")
photo = Image.open("public/baggrund/aften.jpg").convert("RGB")
w, h = photo.size
target = np.asarray(photo.crop((0, int(0.42 * h), w, int(0.66 * h)))).reshape(-1, 3).mean(0)

a = np.asarray(src).astype(np.float32)
gain = target / a.reshape(-1, 3).mean(0)
a = np.clip(a * gain, 0, 255)

W, H = src.size
fade = 0.13  # share of each side that fades out
ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (fade * n), 0, 1)
alpha = (np.outer(ramp(H), ramp(W)) * 255).astype(np.uint8)

out = np.dstack([a.astype(np.uint8), alpha])
Image.fromarray(out, "RGBA").save("public/baggrund/bord.webp", quality=72, method=6)
print("public/baggrund/bord.webp", src.size, "mean rgb", a.reshape(-1, 3).mean(0).round().astype(int))
