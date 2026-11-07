"""
Import element kits (separate painted pieces per location) for the remake.

    python web/scripts/import_kits.py [KITS_DIR] [theme ...]

KITS_DIR defaults to ~/Desktop/Kosari_kits, with one folder per theme. Piece types
come from the file name (see brawl/world/kits.js for how they are used):

    road / roadside / ground / floor*  TILE  — opaque, made seamless left↔right
    far_* / mid_* / *_strip / crowd      STRIP — magenta keyed, trimmed, made seamless
    guardrail / *_segment                SEGMENT — one repeating piece, trimmed on all sides
    anything else                        OBJECT — magenta keyed, trimmed

Output: web/public/remake/assets/world/kits/<theme>/<name>.png (PNG only — no JPEG blur).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "remake" / "assets" / "world" / "kits"
# Which pieces exist per kit folder (the game only switches a theme to its kit once complete)
INDEX = ROOT / "web" / "src" / "remake" / "brawl" / "world" / "kits.gen.json"

_spec = importlib.util.spec_from_file_location("import_themes", Path(__file__).with_name("import_themes.py"))
_it = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_it)
key_background = _it.key_background

TILE_NAMES = {"road", "roadside", "ground"}
OBJ_MAX_H = 640
STRIP_MAX_H = 420
TILE_MAX_H = 420


def kind_of(name: str) -> str:
    if name in TILE_NAMES or name.startswith("floor") or name in ("far_wall", "far_screen"):
        return "tile"
    if name in ("guardrail",) or name.endswith("_segment"):
        return "segment"  # one repeating piece: trimmed on all sides, laid edge to edge
    if name.startswith(("far_", "mid_")) or name.endswith("_strip") or name == "crowd":
        return "strip"
    return "object"


def seamless(im: Image.Image, frac: float = 0.12) -> Image.Image:
    """Cross-fade the right end into the left so the image tiles without a seam.
    Result is narrower by the overlap."""
    im = im.convert("RGBA")
    w, h = im.size
    o = max(8, int(w * frac))
    out = im.crop((0, 0, w - o, h))
    right = im.crop((w - o, 0, w, h))
    for x in range(o):
        a = 1 - x / o  # weight of the right-end column
        col_r = right.crop((x, 0, x + 1, h))
        col_l = out.crop((x, 0, x + 1, h))
        out.paste(Image.blend(col_l, col_r, a), (x, 0))
    return out


def fit_h(im: Image.Image, max_h: int) -> Image.Image:
    if im.height <= max_h:
        return im
    return im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)


def trim(im: Image.Image, keep_width: bool = False) -> Image.Image:
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bb:
        return im
    if keep_width:
        bb = (0, bb[1], im.width, bb[3])
    return im.crop(bb)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].isidentifier() else Path.home() / "Desktop" / "Kosari_kits"
    only = [a for a in sys.argv[1:] if a.isidentifier()]
    for theme_dir in sorted(p for p in src.iterdir() if p.is_dir() and not p.name.startswith("_")):
        if only and theme_dir.name not in only:
            continue
        dst = OUT / theme_dir.name
        dst.mkdir(parents=True, exist_ok=True)
        n = 0
        for f in sorted(theme_dir.glob("*.png")):
            name = f.stem
            kind = kind_of(name)
            im = Image.open(f).convert("RGBA")
            if kind == "tile":
                im = seamless(fit_h(im, TILE_MAX_H))
            elif kind == "strip":
                im = trim(key_background(im, force_magenta=True), keep_width=True)
                im = seamless(fit_h(im, STRIP_MAX_H))
            elif kind == "segment":
                im = fit_h(trim(key_background(im, force_magenta=True)), STRIP_MAX_H)
            else:
                im = fit_h(trim(key_background(im, force_magenta=True)), OBJ_MAX_H)
            im.save(dst / f"{name}.png", optimize=True)
            n += 1
            print(f"  {theme_dir.name}/{name}: {kind} {im.size}")
        print(theme_dir.name, n, "pieces")
    index = {d.name: sorted(f.stem for f in d.glob("*.png")) for d in sorted(OUT.iterdir()) if d.is_dir()}
    INDEX.write_text(json.dumps(index, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
