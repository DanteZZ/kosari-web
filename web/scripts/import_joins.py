"""
Import join pieces (tall columns standing between two map segments).

Source: Desktop/Kosari_kits/joins/<piece>.png — vertical tiles painted by the
image generator. Each one is made seamless top <-> bottom (the bottom band is
cross-faded into the top), its sides are shaded a little so it reads as round,
then it is scaled to JOIN_W px wide and saved as WebP into
public/remake/assets/world/kits/joins/. The piece list goes into kits.gen.json
under "joins" (brawl/world/kits.js: joinReady).

    python scripts/import_joins.py [piece ...]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path.home() / "Desktop" / "Kosari_kits" / "joins"
OUT = ROOT / "web" / "public" / "remake" / "assets" / "world" / "kits" / "joins"
INDEX = ROOT / "web" / "src" / "remake" / "brawl" / "world" / "kits.gen.json"
# Widest on screen: 270 px back piece, 1.35x that in front; a bit of headroom
JOIN_W = 420


def seamless_v(im: Image.Image, frac: float = 0.14) -> Image.Image:
    """Cross-fade the bottom band into the top so the tile repeats vertically."""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    h = a.shape[0]
    n = int(h * frac)
    top = a[:n].copy()
    bottom = a[h - n :]
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None, None]
    # The new top starts as the old bottom and turns into the old top
    a[:n] = bottom * (1 - t) + top * t
    a = a[: h - n]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def shade_sides(im: Image.Image, k: float = 0.38) -> Image.Image:
    """Darken toward the left/right edges (cylindrical falloff, light from the left)."""
    a = np.asarray(im, dtype=np.float32)
    w = a.shape[1]
    x = np.linspace(-1, 1, w, dtype=np.float32)
    f = 1 - k * np.clip(np.abs(x - 0.15) ** 2.2, 0, 1)
    a *= f[None, :, None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def main(only):
    OUT.mkdir(parents=True, exist_ok=True)
    done = []
    for p in sorted(SRC.glob("*.png")):
        if p.name.startswith("_") or (only and p.stem not in only):
            continue
        im = seamless_v(Image.open(p))
        im = shade_sides(im)
        h = round(im.height * JOIN_W / im.width)
        im = im.resize((JOIN_W, h), Image.LANCZOS)
        im.save(OUT / f"{p.stem}.webp", "WEBP", quality=88, method=6)
        done.append(p.stem)
        print(p.stem, im.size)
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    have = set(index.get("joins", [])) | set(done)
    have = {k for k in have if (OUT / f"{k}.webp").exists()}
    index["joins"] = sorted(have)
    INDEX.write_text(json.dumps(index, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
