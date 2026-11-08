"""
Pieces for the separate "sets" (lift cabin, river under the raft) and a few
standalone objects from the kits folder, stored as item art.

    python web/scripts/import_sets.py

~/Desktop/Kosari_kits/<folder>/<name>.png → public/remake/assets/items/<out>.webp
Tiles/walls are kept opaque; objects and strips are magenta keyed and trimmed.
"""
from pathlib import Path
import importlib.util
import sys

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
KITS = Path.home() / "Desktop" / "Kosari_kits"
ITEMS = ROOT / "web" / "public" / "remake" / "assets" / "items"

_spec = importlib.util.spec_from_file_location("ils", Path(__file__).with_name("import_loading_scenes.py"))
_m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m)
key_magenta = _m.key_magenta

# (source, output name, keyed?, max width)
PIECES = [
    ("lift/far_wall.png", "set_lift_wall", False, 1600),
    ("lift/road.png", "set_lift_floor", False, 1200),
    ("office/lift_doors.png", "lift_doors", True, 640),
    ("raft_river/road.png", "set_river_water", False, 1600),
    ("raft_river/far_banks.png", "set_river_banks", True, 2400),
    ("raft_river/pier.png", "set_river_pier", True, 900),
    ("museum/statue_1.png", "statue_1", True, 512),
    ("museum/statue_2.png", "statue_2", True, 512),
    ("museum/statue_3.png", "statue_3", True, 512),
    ("panelki/block_near.png", "panel_block", True, 900),
]


def key_hue(im: Image.Image) -> Image.Image:
    """Second pass for enclosed backgrounds that came out crimson rather than pure
    magenta (gaps between a statue's spear and body): saturated purple-red hues go."""
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    rgb = a[..., :3] / 255
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # purple-red: red high, green clearly the lowest, blue above green
    mask = (sat > 0.45) & (g < r * 0.6) & (b > g * 1.15) & (r > 0.35)
    a[..., 3] = np.where(mask, 0, a[..., 3])
    out = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
    return out.crop(out.getchannel("A").getbbox())


def main():
    only = set(sys.argv[1:])
    for src, out, keyed, maxw in PIECES:
        if only and out not in only:
            continue
        p = KITS / src
        if not p.exists():
            print("missing", src)
            continue
        im = Image.open(p)
        im = key_magenta(im) if keyed else im.convert("RGB")
        if keyed and out.startswith("statue"):
            im = key_hue(im)
        if im.width > maxw:
            im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
        im.save(ITEMS / f"{out}.webp", "WEBP", quality=88)
        print(out, im.size)


if __name__ == "__main__":
    main()
