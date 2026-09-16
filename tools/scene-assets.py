#!/usr/bin/env python3
"""Web versions of the scene's depth layers. Reads src/scene.json and the raw PNG layers in baggrund-kilder/lag/, and
writes public/baggrund/<id>.webp:
  1. wherever a layer is opaque and nothing nearer covers it, its pixels are taken from the original photo, so the
     stacked layers reproduce the photo exactly; the AI-generated pixels are only used where parallax uncovers them;
  2. layers cut by the photo's edge get mirrored margins (`pad`), so panning never shows the cut;
  3. everything is shrunk to WEB of the raw size (1440 px wide).
The table plane is also unwarped into the book's plane – the inverse of the CSS tilt (perspective + rotateX about the
book's centre) at tiltFar – as two tiles (near sharp, far coarser) so it can tilt with the book; their world rects are
written back into scene.json as `flat`. Run again after changing layers, pads, the anchor or the camera:
  npm run scene
"""
import json, math, os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENE = os.path.join(ROOT, "src/scene.json")
SRC = os.path.join(ROOT, "baggrund-kilder/lag")
WEB, QUALITY = 2 / 3, 85
BOOK_W, BOOK_H = 1456, 1048  # world px, as in src/layout.ts
SPLIT, RHO_NEAR, RHO_FAR = -1500, 0.65, 0.25  # table plane tiles: seam (world y) and output px per world px

scene = json.load(open(SCENE))
OUT = os.path.join(ROOT, "public", scene["path"])
W, H, layers = scene["width"], scene["height"], scene["layers"]
book, cam = scene["book"], scene["camera"]
bg_w = BOOK_W / book["widthFraction"]; bg_h = bg_w * H / W
bg_x = BOOK_W / 2 - book["anchor"]["x"] * bg_w; bg_y = BOOK_H / 2 - book["anchor"]["y"] * bg_h
K = bg_w / W  # world px per photo px

def load(name):
    im = cv2.imread(os.path.join(SRC, name), cv2.IMREAD_UNCHANGED)
    return cv2.cvtColor(im, cv2.COLOR_BGR2BGRA) if im.shape[2] == 3 else im
def pads(l):
    t, r, b, le = l.get("pad", [0, 0, 0, 0]); return round(t * l["h"]), round(r * l["w"]), round(b * l["h"]), round(le * l["w"])
def premul(img):
    f = img.astype(np.float32); f[..., :3] *= f[..., 3:4] / 255; return f
def unpremul(f):
    a = f[..., 3:4]; rgb = np.where(a > 0, f[..., :3] / np.maximum(a / 255, 1e-6), 0)
    return np.clip(np.concatenate([rgb, a], axis=2), 0, 255).astype(np.uint8)
def save(img, name):
    path = os.path.join(OUT, name)
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)).save(path, "WEBP", quality=QUALITY, method=4)
    print(f"  {name}: {img.shape[1]}x{img.shape[0]}, {os.path.getsize(path) // 1024} KB")

# 1. original pixels wherever a layer shows in the photo. Front to back: what is not hidden by a nearer layer; back to
#    front: opaque pixels take the photo's colour, soft edges the colour that – at their alpha over what is behind them in
#    the stack – blends to the photo's colour (the faintest rim just the photo's colour). So the stacked layers reproduce the photo, and the generated pixels only
#    show where parallax uncovers them.
comp = load(scene["original"])
imgs = {l["id"]: load(l["file"]) for l in layers}
for l in layers:  # the generated table has holes where things stood on its far edge: fill them (seen only under parallax)
    if not l.get("isTablePlane"): continue
    im = imgs[l["id"]]; solid = (im[..., 3] >= 250).astype(np.uint8)
    holes = (cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((121, 121), np.uint8)) > 0) & (im[..., 3] < 250)
    im[..., :3] = cv2.inpaint(np.ascontiguousarray(im[..., :3]), holes.astype(np.uint8), 7, cv2.INPAINT_TELEA)
    im[..., 3][holes] = 255
    print(f"{l['id']}: {holes.sum()} px of holes filled")
boxes = {l["id"]: (slice(l["y"], l["y"] + l["h"]), slice(l["x"], l["x"] + l["w"])) for l in layers}
free, covered = {}, np.zeros((H, W), np.uint8)
for l in reversed(layers):
    free[l["id"]] = covered[boxes[l["id"]]] == 0
    covered[boxes[l["id"]]] |= (imgs[l["id"]][..., 3] > 8).astype(np.uint8)
behind = np.zeros((H, W, 3), np.float32)  # colour of the stack so far
alpha = {l["id"]: imgs[l["id"]][..., 3] for l in layers}
for l in layers:
    im, box, f = imgs[l["id"]], boxes[l["id"]], free[l["id"]]
    a = im[..., 3:4].astype(np.float32) / 255
    C, B = comp[box][..., :3].astype(np.float32), behind[box]
    opaque = (im[..., 3] >= 250) & f  # "opaque" is 250..255 in these layers
    edge = (a[..., 0] >= 0.5) & (im[..., 3] < 250) & f
    rgb = im[..., :3]
    rgb[opaque] = C[opaque]
    rgb[edge] = np.clip((C - (1 - a) * B) / np.maximum(a, 0.5), 0, 255)[edge]  # amplifies at most 2x
    behind[box] = rgb * a + B * (1 - a)
    print(f"{l['id']}: {opaque.mean() * 100:.0f}% of the layer from the original, {edge.mean() * 100:.1f}% soft edge fitted to it")
# The faint side of a soft edge (alpha < 0.5) is mostly the layer behind showing through, and the generated background
# there tends to be lighter than the photo's (no contact shadow) – a light halo. So there the nearest opaque layer
# behind gets the colour that, under this layer's own rim, blends to the photo's colour (amplifies at most 2x).
for i, l in enumerate(layers):
    box, a_l = boxes[l["id"]], alpha[l["id"]]
    band = (a_l > 0) & (a_l < 128) & free[l["id"]]
    if not band.any(): continue
    a = a_l.astype(np.float32)[..., None] / 255
    need = np.zeros((H, W, 3), np.float32)
    need[box] = np.clip((comp[box][..., :3].astype(np.float32) - a * imgs[l["id"]][..., :3]) / np.maximum(1 - a, 0.5), 0, 255)
    pending = np.zeros((H, W), bool); pending[box] = band
    for m in reversed(layers[:i]):  # nearest first
        mb, a_m = boxes[m["id"]], alpha[m["id"]]
        hit = pending[mb] & (a_m >= 250)
        imgs[m["id"]][..., :3][hit] = need[mb][hit]
        pending[mb] &= ~(a_m > 8)  # taken, or blocked by a soft pixel of a layer in between
    print(f"{l['id']}: {band.mean() * 100:.1f}% faint rim, the background behind it fitted")

# 2.+3. mirrored margins, shrink, save
for l in layers:
    pt, pr, pb, pl = pads(l)
    im = cv2.copyMakeBorder(imgs[l["id"]], pt, pb, pl, pr, cv2.BORDER_REFLECT_101)
    imgs[l["id"]] = im
    small = unpremul(cv2.resize(premul(im), (round(im.shape[1] * WEB), round(im.shape[0] * WEB)), interpolation=cv2.INTER_AREA))
    save(small, l["id"] + ".webp")

# 4. the table plane, unwarped into the book's plane
tl = [l for l in layers if l.get("isTablePlane")][0]
pt, pr, pb, pl = pads(tl)
th, P, ax, ay = math.radians(cam["tiltFar"]), cam["perspective"], BOOK_W / 2, BOOK_H / 2
sn, cs = math.sin(th), math.cos(th)
# plane point (world) -> tilted+projected (flat world, what the photo shows) -> photo px -> padded layer px
T1 = np.array([[1, 0, -ax], [0, 1, -ay], [0, 0, 1.0]])
R = np.array([[1, 0, 0], [0, cs, 0], [0, -sn / P, 1.0]])
T2 = np.array([[1, 0, ax], [0, 1, ay], [0, 0, 1.0]])
S = np.array([[1 / K, 0, -bg_x / K], [0, 1 / K, -bg_y / K], [0, 0, 1.0]])
L = np.array([[1, 0, -(tl["x"] - pl)], [0, 1, -(tl["y"] - pt)], [0, 0, 1.0]])
M = L @ S @ T2 @ R @ T1
def plane_y(photo_y):  # a photo row -> the plane row that projects there
    v = bg_y + photo_y * K - ay; return ay + v / (cs + v * sn / P)
def widen(py):  # how much wider the plane is than the photo at that plane row
    return 1 - (py - ay) * sn / P
qx0, qx1 = bg_x + (tl["x"] - pl) * K, bg_x + (tl["x"] + tl["w"] + pr) * K
y_far, y_near = plane_y(tl["y"] - pt), plane_y(tl["y"] + tl["h"] + pb)
src = premul(imgs[tl["id"]])
tiles = []
for name, y0, y1, rho in [("table-far", y_far, SPLIT, RHO_FAR), ("table-near", SPLIT, y_near, RHO_NEAR)]:
    w = widen(y0)
    x0, x1 = ax + (qx0 - ax) * w, ax + (qx1 - ax) * w
    wo, ho = math.ceil((x1 - x0) * rho), math.ceil((y1 - y0) * rho)
    D = np.array([[1 / rho, 0, x0], [0, 1 / rho, y0], [0, 0, 1.0]])
    warped = cv2.warpPerspective(src, M @ D, (wo, ho), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    save(unpremul(warped), name + ".webp")
    tiles.append({"file": name + ".webp", "x": round(x0, 1), "y": round(y0, 1), "w": round(wo / rho, 1), "h": round(ho / rho, 1)})
tl["flat"] = tiles
print("table plane tiles (world px):", tiles)
json.dump(scene, open(SCENE, "w"), indent=2, ensure_ascii=False); open(SCENE, "a").write("\n")
