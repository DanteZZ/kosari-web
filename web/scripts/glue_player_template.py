"""
Assemble player BonePuppet parts into a single clean template PNG
(rest/guard pose from PART_LAYOUT). Also writes an exploded labeled sheet.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PARTS = ROOT / "web" / "public" / "remake" / "assets" / "player" / "parts"
OUT = ROOT / "web" / "public" / "remake" / "assets" / "enemies" / "_templates"
GEN = Path(r"C:\Users\uncle\.cursor\projects\d-Games-Kosari-v3-0\assets")

PART_FILES = {
    "head": "pocik_0002_head.png",
    "torso": "pocik_0003_body.png",
    "arm_r_u": "pocik_0001_hand_r_top.png",
    "arm_r_l": "pocik_0000_hand_r_bottom.png",
    "arm_l_u": "pocik_0005_hand_l_top.png",
    "arm_l_l": "pocik_0004_hand_l_bottom.png",
    "leg_l_u": "pocik_0007_leg_l_top.png",
    "leg_l_l": "pocik_0006_leg_l_bottom.png",
    "leg_r_u": "pocik_0009_leg_r_top.png",
    "leg_r_l": "pocik_0008_leg_r_bottom.png",
}

# Same as parts.js PART_LAYOUT (feet origin)
LAYOUT = {
    "hips": {"x": 0, "y": -221.8, "parent": None, "angle": 0},
    "torso": {
        "parent": "hips",
        "tex": "torso",
        "originX": 0.5,
        "originY": 0.94,
        "x": -1,
        "y": 0,
        "angle": 0,
    },
    "head": {
        "parent": "torso",
        "tex": "head",
        "originX": 0.5,
        "originY": 0.92,
        "x": 2,
        "y": -144,
        "angle": 0,
    },
    "arm_l_u": {
        "parent": "hips",
        "tex": "arm_l_u",
        "originX": 0.29,
        "originY": 0.12,
        "x": 32,
        "y": -115,
        "angle": 2,
    },
    "arm_l_l": {
        "parent": "arm_l_u",
        "tex": "arm_l_l",
        "originX": 0.55,
        "originY": 0.01,
        "x": 20,
        "y": 50,
        "angle": -48,
    },
    "arm_r_u": {
        "parent": "torso",
        "tex": "arm_r_u",
        "originX": 0.55,
        "originY": 0.12,
        "x": -47,
        "y": -116,
        "angle": -6,
    },
    "arm_r_l": {
        "parent": "arm_r_u",
        "tex": "arm_r_l",
        "originX": 0.37,
        "originY": 0,
        "x": -8,
        "y": 63,
        "angle": -62,
    },
    "leg_r_u": {
        "parent": "hips",
        "tex": "leg_r_u",
        "originX": 0.69,
        "originY": 0.16,
        "x": -5,
        "y": 15,
        "angle": 6,
    },
    "leg_r_l": {
        "parent": "leg_r_u",
        "tex": "leg_r_l",
        "originX": 0.72,
        "originY": 0.07,
        "x": -24,
        "y": 78,
        "angle": -4,
    },
    "leg_l_u": {
        "parent": "hips",
        "tex": "leg_l_u",
        "originX": 0.41,
        "originY": 0.13,
        "x": 25,
        "y": 11,
        "angle": -4,
    },
    "leg_l_l": {
        "parent": "leg_l_u",
        "tex": "leg_l_l",
        "originX": 0.4,
        "originY": 0.06,
        "x": 18,
        "y": 69,
        "angle": 2,
    },
}

# Paint order (back → front), matches BonePuppet restack idea
DRAW_ORDER = [
    "arm_l_u",
    "arm_l_l",
    "leg_l_u",
    "leg_l_l",
    "leg_r_u",
    "leg_r_l",
    "torso",
    "head",
    "arm_r_u",
    "arm_r_l",
]


def load_parts():
    imgs = {}
    for name, file in PART_FILES.items():
        imgs[name] = Image.open(PARTS / file).convert("RGBA")
    return imgs


def compute_worlds():
    """Hierarchical world transforms from hips (feet space: +y down toward feet in layout)."""
    worlds = {}

    def visit(name, px, py, pang):
        cfg = LAYOUT[name]
        rad = math.radians(pang)
        lx, ly = cfg["x"], cfg["y"]
        wx = px + lx * math.cos(rad) - ly * math.sin(rad)
        wy = py + lx * math.sin(rad) + ly * math.cos(rad)
        wang = pang + cfg["angle"]
        worlds[name] = (wx, wy, wang)
        for child, ccfg in LAYOUT.items():
            if ccfg.get("parent") == name:
                visit(child, wx, wy, wang)

    visit("hips", 0.0, 0.0, 0.0)
    return worlds


def paste_rotated(canvas, spr, wx, wy, angle_deg, ox, oy):
    """Paste sprite so its origin (ox,oy fraction) sits at world (wx,wy), rotated."""
    w, h = spr.size
    # Expand and rotate around origin point
    # Convert origin to pixel
    px = ox * w
    py = oy * h
    # Pad so origin is center of a larger canvas for rotate
    pad = int(max(w, h) * 1.5) + 4
    big = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    big.paste(spr, (pad, pad), spr)
    # Origin in big coords
    oxb = pad + px
    oyb = pad + py
    # Rotate around origin
    rotated = big.rotate(-angle_deg, resample=Image.Resampling.BICUBIC, center=(oxb, oyb))
    # After rotate, origin still at (oxb, oyb); paste so that maps to (wx, wy) on canvas
    # Canvas feet at bottom-center
    cx = int(round(wx - oxb))
    cy = int(round(wy - oyb))
    canvas.alpha_composite(rotated, (cx, cy))


def assemble(bg=(0, 0, 0, 255), margin=40):
    imgs = load_parts()
    worlds = compute_worlds()
    # Layout y grows downward from hips toward feet (hips.y=-222, feet≈0).
    # Image space: same orientation (y down).
    points = [(0, 0)]  # feet
    for name in DRAW_ORDER:
        wx, wy, _ = worlds[name]
        spr = imgs[LAYOUT[name]["tex"]]
        points.append((wx, wy))
        points.append((wx - spr.width, wy - spr.height))
        points.append((wx + spr.width, wy + spr.height))

    minx = min(p[0] for p in points) - margin
    maxx = max(p[0] for p in points) + margin
    miny = min(p[1] for p in points) - margin
    maxy = max(p[1] for p in points) + margin
    W = int(math.ceil(maxx - minx))
    H = int(math.ceil(maxy - miny))
    canvas = Image.new("RGBA", (W, H), bg)

    for name in DRAW_ORDER:
        cfg = LAYOUT[name]
        wx, wy, ang = worlds[name]
        paste_rotated(
            canvas,
            imgs[cfg["tex"]],
            wx - minx,
            wy - miny,
            ang,
            cfg["originX"],
            cfg["originY"],
        )

    bbox = canvas.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)
        pad = 16
        out = Image.new("RGBA", (canvas.width + pad * 2, canvas.height + pad * 2), bg)
        out.alpha_composite(canvas, (pad, pad))
        canvas = out
    return canvas


def explode_sheet():
    """Labeled separate parts in rest orientation for cutting."""
    imgs = load_parts()
    order = [
        "head",
        "torso",
        "arm_r_u",
        "arm_r_l",
        "arm_l_u",
        "arm_l_l",
        "leg_r_u",
        "leg_r_l",
        "leg_l_u",
        "leg_l_l",
    ]
    cell_w, cell_h = 160, 200
    cols = 5
    rows = 2
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(order):
        r, c = divmod(i, cols)
        # wait 5 cols: i//5 row, i%5 col
        row, col = i // cols, i % cols
        cell = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
        spr = imgs[name]
        scale = min((cell_w - 20) / spr.width, (cell_h - 36) / spr.height)
        nw, nh = max(1, int(spr.width * scale)), max(1, int(spr.height * scale))
        rs = spr.resize((nw, nh), Image.Resampling.LANCZOS)
        cell.alpha_composite(rs, ((cell_w - nw) // 2, 24 + (cell_h - 36 - nh) // 2))
        draw2 = ImageDraw.Draw(cell)
        draw2.text((8, 4), name, fill=(255, 220, 80, 255))
        sheet.alpha_composite(cell, (col * cell_w, row * cell_h))
        # grid
        draw.rectangle(
            [col * cell_w, row * cell_h, (col + 1) * cell_w - 1, (row + 1) * cell_h - 1],
            outline=(60, 60, 60, 255),
        )
    return sheet


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    GEN.mkdir(parents=True, exist_ok=True)

    glued = assemble(bg=(0, 0, 0, 255))
    p1 = OUT / "player_glued_template.png"
    glued.save(p1)
    # Also copy to Cursor assets for GenerateImage + user edit
    p1b = GEN / "player_glued_template.png"
    glued.save(p1b)
    print("glued", p1, glued.size)

    sheet = explode_sheet()
    p2 = OUT / "player_parts_sheet.png"
    sheet.save(p2)
    sheet.save(GEN / "player_parts_sheet.png")
    print("sheet", p2, sheet.size)


if __name__ == "__main__":
    main()
