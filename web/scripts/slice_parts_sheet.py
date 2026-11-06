"""
Slice a 5×2 "parts sheet" (same layout as
public/remake/assets/enemies/_templates/nikita_parts_separate.png) into
BonePuppet part PNGs for an enemy.

    python web/scripts/slice_parts_sheet.py <sheet.png> <enemy_id> [--preview]

Sheet layout (any resolution, ~16:9, black background, one part per cell):
    row 1: head | torso | arm_r_u | arm_r_l | arm_l_u
    row 2: arm_l_l | leg_r_u | leg_r_l | leg_l_u | leg_l_l
Upper limbs: shoulder / hip end at the TOP of the cell. Lower limbs: elbow /
knee end at the top, hand / foot at the bottom. Torso: neck at top, waist at
the bottom. Head: chin at the bottom.

Each part is keyed off the black background (flood fill from the cell border,
so dark clothes inside the silhouette survive), cropped, and fitted into the
same canvas size as the player's part so the player's bone layout fits it.
Output: public/remake/assets/enemies/<id>/parts/<part>.png (+ preview.png).
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "remake" / "assets" / "enemies"

ORDER = [
    ["head", "torso", "arm_r_u", "arm_r_l", "arm_l_u"],
    ["arm_l_l", "leg_r_u", "leg_r_l", "leg_l_u", "leg_l_l"],
]

# Player part canvas sizes (BonePuppet layout is tuned for these)
TARGET = {
    "head": (100, 116),
    "torso": (103, 172),
    "arm_r_u": (55, 87),
    "arm_r_l": (45, 85),
    "arm_l_u": (59, 98),
    "arm_l_l": (41, 84),
    "leg_r_u": (82, 100),
    "leg_r_l": (66, 141),
    "leg_l_u": (52, 137),
    "leg_l_l": (88, 141),
}

# Template cell boxes at 1280×720 (x0, x1) per column and (y0, y1) per row
COLS = [(5, 257), (262, 512), (518, 767), (773, 1020), (1027, 1275)]
ROWS = [(52, 364), (370, 694)]
LABEL_H = 30  # skip the text label at the top of each cell


def key_background(cell: Image.Image, thr: int = 32) -> Image.Image:
    """Make the near-black area connected to the cell border transparent."""
    a = np.array(cell.convert("RGBA"))
    h, w = a.shape[:2]
    dark = a[:, :, :3].max(axis=2) <= thr
    bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dark[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and dark[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((nx, ny))
    a[bg, 3] = 0
    # Soften the cut edge a little
    out = Image.fromarray(a, "RGBA")
    bb = out.getchannel("A").getbbox()
    return out.crop(bb) if bb else out


def fit(im: Image.Image, tw: int, th: int, pad: int = 2) -> Image.Image:
    w, h = im.size
    k = min((tw - pad * 2) / max(1, w), (th - pad * 2) / max(1, h))
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.alpha_composite(im.resize((nw, nh), Image.Resampling.LANCZOS), ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def preview(parts: dict, path: Path):
    """Rough T-pose glue (for a quick look, not the in-game rig)."""
    sheet = Image.new("RGBA", (260, 420), (0, 0, 0, 0))
    cx = 130
    place = {
        "leg_l_u": (cx - 30, 230), "leg_l_l": (cx - 34, 320),
        "leg_r_u": (cx + 4, 230), "leg_r_l": (cx + 2, 320),
        "torso": (cx - 52, 70), "head": (cx - 50, 0),
        "arm_l_u": (cx - 100, 90), "arm_l_l": (cx - 104, 170),
        "arm_r_u": (cx + 50, 90), "arm_r_l": (cx + 52, 170),
    }
    for name in ["leg_l_u", "leg_l_l", "leg_r_u", "leg_r_l", "arm_l_u", "arm_l_l", "torso", "head", "arm_r_u", "arm_r_l"]:
        sheet.alpha_composite(parts[name], place[name])
    sheet.save(path)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    sheet_path = Path(sys.argv[1])
    enemy_id = sys.argv[2]
    sheet = Image.open(sheet_path).convert("RGBA")
    sx = sheet.width / 1280
    sy = sheet.height / 720
    out_dir = OUT / enemy_id / "parts"
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = {}
    for r, row in enumerate(ORDER):
        for c, name in enumerate(row):
            x0, x1 = COLS[c]
            y0, y1 = ROWS[r]
            box = (round((x0 + 4) * sx), round((y0 + LABEL_H) * sy), round((x1 - 4) * sx), round((y1 - 4) * sy))
            part = key_background(sheet.crop(box))
            parts[name] = fit(part, *TARGET[name])
            parts[name].save(out_dir / f"{name}.png")
            print(f"{name:8s} {part.size} -> {TARGET[name]}")
    if "--preview" in sys.argv:
        preview(parts, OUT / enemy_id / "preview.png")
        print("preview:", OUT / enemy_id / "preview.png")
    print("done:", out_dir)


if __name__ == "__main__":
    main()
