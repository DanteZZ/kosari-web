"""
Loading-screen art: the full-body stance picture of a boss / debuting enemy,
cut out of its flat magenta background (like loading/borsch.png). The ink look
comes from CSS (.wl-art filter), so this only keys, trims and sizes.

    python scripts/make_loading_art.py [id ...]

Source: Desktop/Kosari_chars/bodies/<id>.png → public/remake/assets/loading/<out>.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = Path.home() / "Desktop" / "Kosari_chars" / "bodies"
OUT = Path(__file__).resolve().parents[1] / "public" / "remake" / "assets" / "loading"
H = 900
# body file → loading art name
NAMES = {
    "ded": "ded", "pahom": "pahom", "mongol": "mongol", "glad": "glad", "ruki": "ruki",
    "vertuha": "vertuha", "ponasenkov": "ponasenkov", "reka": "reka", "gigachad": "gigachad",
    "zubarev": "zubarev", "papich": "papich", "gitelman": "gitelman", "1klas": "klas",
    # heroes (menu hero select)
    "svidetel": "hero_svidetel", "pistoletov": "hero_pistoletov", "kama": "hero_kama",
}


def key_out(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    # Background colour: median of the border
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    # Magenta-ness: red and blue well above green
    mag = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    bgmag = min(bg[0], bg[2]) - bg[1]
    alpha = np.clip((d - 40) / 70, 0, 1)
    # Only pixels connected to the border count as background
    hard_bg = alpha < 0.5
    lab, _ = ndimage.label(hard_bg)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(edge))
    alpha = np.where(outside, alpha, 1.0)
    # Keep the figure only (largest solid blob)
    solid = alpha > 0.5
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, [int(np.argmax(sizes)) + 1])
        keep = ndimage.binary_dilation(keep, iterations=3)
        alpha = alpha * keep
    # Despill: pull magenta fringe toward neutral
    spill = np.clip((mag - 10) / max(bgmag, 1), 0, 1) * (1 - alpha * 0.6)
    g = a[..., 1]
    a[..., 0] = a[..., 0] - (a[..., 0] - g) * spill * 0.85
    a[..., 2] = a[..., 2] - (a[..., 2] - g) * spill * 0.85
    rgba = np.dstack([a.clip(0, 255), alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    return out.crop(out.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox())


def main(only):
    for src, name in NAMES.items():
        if only and src not in only and name not in only:
            continue
        p = SRC / f"{src}.png"
        if not p.exists():
            print("missing", p)
            continue
        im = key_out(Image.open(p))
        im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
        im.save(OUT / f"{name}.png", optimize=True)
        print(name, im.size)


if __name__ == "__main__":
    main(set(sys.argv[1:]))
