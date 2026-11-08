"""
Import the Witcher-style loading paintings and the boss sprites drawn with Cursor.

    python scripts/import_loading_scenes.py

Desktop/Kosari_locations_art/loading_v2/<map>.png → public/remake/assets/loading/scenes/<map>.jpg
(16:9, 1600 px wide). Desktop/Kosari_locations_art/sprites/<name>.png (flat magenta
background) → public/remake/assets/items/<name>.webp, keyed and trimmed.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = Path.home() / "Desktop" / "Kosari_locations_art"
SCENES = ROOT / "public" / "remake" / "assets" / "loading" / "scenes"
ITEMS = ROOT / "public" / "remake" / "assets" / "items"


def cover_16x9(im: Image.Image, w=1600) -> Image.Image:
    im = im.convert("RGB")
    W, H = im.size
    t = 16 / 9
    if W / H > t:
        nw = int(H * t)
        im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = int(W / t)
        im = im.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    return im.resize((w, round(w * 9 / 16)), Image.LANCZOS)


def key_magenta(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 40) / 60, 0, 1)
    mag = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    spill = np.clip((mag - 10) / 120, 0, 1) * (1 - alpha * 0.6)
    g = a[..., 1]
    a[..., 0] -= (a[..., 0] - g) * spill * 0.85
    a[..., 2] -= (a[..., 2] - g) * spill * 0.85
    out = Image.fromarray(np.dstack([a.clip(0, 255), alpha * 255]).astype(np.uint8), "RGBA")
    return out.crop(out.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox())


def main():
    SCENES.mkdir(parents=True, exist_ok=True)
    for p in sorted((ART / "loading_v2").glob("*.png")):
        cover_16x9(Image.open(p)).save(SCENES / f"{p.stem}.jpg", quality=86, optimize=True)
        print("scene", p.stem)
    for p in sorted((ART / "sprites").glob("*.png")):
        im = key_magenta(Image.open(p))
        if im.width > 512:
            im = im.resize((512, round(im.height * 512 / im.width)), Image.LANCZOS)
        im.save(ITEMS / f"{p.stem}.webp", "WEBP", quality=90)
        print("sprite", p.stem, im.size)


if __name__ == "__main__":
    main()
