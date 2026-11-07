"""
Import item / projectile art (Cursor, magenta backgrounds) for the remake.

    python web/scripts/import_items.py [SRC]

SRC defaults to ~/Desktop/Kosari_kits/items. Keys out the background, trims,
scales to at most 160 px tall and writes web/public/remake/assets/items/<name>.webp.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "remake" / "assets" / "items"
_spec = importlib.util.spec_from_file_location("import_kits", Path(__file__).with_name("import_kits.py"))
_kits = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_kits)

MAX_H = 160


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "Kosari_kits" / "items"
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob("*.png")):
        from PIL import Image

        im = _kits.trim(_kits.key_background(Image.open(f).convert("RGBA"), force_magenta=True))
        # Wide effects (shockwave) are limited by width instead
        if im.width > im.height * 2.2:
            im = im.resize((min(im.width, 520), round(im.height * min(im.width, 520) / im.width)), Image.LANCZOS)
        else:
            im = _kits.fit_h(im, MAX_H)
        im.save(OUT / f"{f.stem}.webp", quality=90, method=6)
        print(f.stem, im.size)


if __name__ == "__main__":
    main()
