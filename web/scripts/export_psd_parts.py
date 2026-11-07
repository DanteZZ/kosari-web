"""Export every layer of bodies/*.psd as a trimmed PNG into bodies/parts/<id>/.

Names follow Photoshop's "Export layers to files": <id>__NNNN_<layer>.png,
NNNN counted from the top layer. Faint stray pixels (soft-eraser leftovers)
are dropped: only solid blobs (alpha > 24, > 150 px) and a 4 px halo around
them are kept, then the image is cropped to that. The full stance picture
<id>.png is copied next to the parts (register_parts.py uses it for placement).
A bottom layer with a default name ("Слой 1" / "Layer 1") is taken as the body.

    python scripts/export_psd_parts.py <bodies dir> [id ...]
"""
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage
from scipy import ndimage

SRC = Path(sys.argv[1])
OUT = SRC / "parts"
FIX = {"hend": "hand", "rught": "right", "tight": "right"}


def clean(im: Image.Image):
    a = np.asarray(im.convert("RGBA")).copy()
    lab, n = ndimage.label(a[:, :, 3] > 24)
    if not n:
        return None
    sz = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s > 150])
    if not keep.any():
        return None
    keep = ndimage.binary_dilation(keep, iterations=4)
    a[~keep] = 0
    ys, xs = np.nonzero(a[:, :, 3])
    return Image.fromarray(a[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]), (int(xs.min()), int(ys.min()))


ONLY = set(sys.argv[2:])

for psd in sorted(SRC.glob("*.psd")):
    cid = psd.stem
    if ONLY and cid not in ONLY:
        continue
    p = PSDImage.open(psd)
    d = OUT / cid
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob("*.png"):
        f.unlink()
    offsets = {}
    layers = list(p)[::-1]  # top first, like Photoshop's export numbering
    for k, l in enumerate(layers):
        name = l.name.strip().lower().replace(" ", "_")
        for a, b in FIX.items():
            name = re.sub(a, b, name)
        if k == len(layers) - 1 and not re.search(r"(head|body|hand|leg)", name):
            name = "body"
        r = clean(l.topil())
        if r is None:
            print(f"  {cid}: {l.name} is empty, skipped")
            continue
        im, (dx, dy) = r
        fn = f"{cid}__{k:04d}_{name}.png"
        im.save(d / fn, optimize=True)
        # Top-left on the PSD canvas (register_parts.py places the parts by it)
        offsets[fn] = [l.offset[0] + dx, l.offset[1] + dy]
        print(f"{cid}: {name} {im.size}{'' if l.visible else ' (hidden layer)'}")
    (d / "offsets.json").write_text(json.dumps(offsets, indent=1), encoding="utf-8")
    if (SRC / f"{cid}.png").exists():
        shutil.copy2(SRC / f"{cid}.png", d / f"{cid}.png")
