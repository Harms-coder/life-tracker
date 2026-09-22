# Compare two directories of screenshots pixel for pixel: python3 tools/pngdiff.py <a> <b>
import sys, os
from PIL import Image
import numpy as np

a, b = sys.argv[1], sys.argv[2]
worst = 0
for name in sorted(os.listdir(a)):
    if not name.endswith(".png") or not os.path.exists(os.path.join(b, name)):
        continue
    ia = np.asarray(Image.open(os.path.join(a, name)).convert("RGB")).astype(int)
    ib = np.asarray(Image.open(os.path.join(b, name)).convert("RGB")).astype(int)
    if ia.shape != ib.shape:
        print(f"{name:<14} STOERRELSE ULIG {ia.shape} vs {ib.shape}")
        worst = max(worst, 1)
        continue
    d = np.abs(ia - ib).max(axis=2)
    n = int((d > 2).sum())
    worst = max(worst, n)
    print(f"{name:<14} {n:>9} px afviger ({100*n/d.size:.4f} %), vaerste kanal {int(d.max())}")
print("\nIDENTISK" if worst == 0 else f"\nAFVIGER paa op til {worst} px")
