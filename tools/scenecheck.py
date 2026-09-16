"""Diffs screenshots/s0-z1-scene.png (the scene alone at the identity view, 390x844 @3x) against the original photo
scaled to cover that screen, and writes screenshots/s0-overlay.png (50/50 blend), s0-diff.png (difference x3) and
s0-side.png (photo | scene | diff). Usage: python3 tools/scenecheck.py"""
import json, os
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene = json.load(open(os.path.join(ROOT, "src/scene.json")))
shot = Image.open(os.path.join(ROOT, "screenshots/s0-z1-scene.png")).convert("RGB")
W, H = shot.size
photo = Image.open(os.path.join(ROOT, "baggrund-kilder/lag", scene["original"])).convert("RGB")
k = max(W / photo.width, H / photo.height)
photo = photo.resize((round(photo.width * k), round(photo.height * k)), Image.LANCZOS)
ox, oy = (photo.width - W) // 2, (photo.height - H) // 2
photo = photo.crop((ox, oy, ox + W, oy + H))
a, b = np.asarray(photo).astype(int), np.asarray(shot).astype(int)
d = np.abs(a - b).mean(axis=2)
print(f"scene vs photo at z=1: mean diff {d.mean():.2f} (0-255), {(d > 30).mean() * 100:.1f}% of pixels differ by >30, {(d > 60).mean() * 100:.2f}% by >60")
Image.blend(photo, shot, 0.5).save(os.path.join(ROOT, "screenshots/s0-overlay.png"))
heat = Image.fromarray(np.clip(d * 3, 0, 255).astype(np.uint8)).convert("RGB")
heat.save(os.path.join(ROOT, "screenshots/s0-diff.png"))
side = Image.new("RGB", (W * 3 + 20, H), (30, 30, 30))
for i, im in enumerate([photo, shot, heat]): side.paste(im, (i * (W + 10), 0))
side.save(os.path.join(ROOT, "screenshots/s0-side.png"))
