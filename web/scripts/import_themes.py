"""
Import AI-painted location art into themed worlds for the remake.

    python web/scripts/import_themes.py [SRC]

SRC defaults to ~/Desktop/Kosari_locations_art. For every theme below it cuts
the backdrop into a WALL strip (slow parallax, above the road) and a FLOOR strip
(stretched under the walk lane), and cleans props (background keyed out by
flood-filling from the borders, trimmed, scaled) into

    web/public/remake/assets/world/themes/<theme>/{wall.jpg, floor.jpg, props/*.png}

and writes web/src/remake/brawl/world/themes.gen.json (sizes + prop heights).
Crop rows are fractions of the source image height.
"""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "Kosari_locations_art"
# Re-generated pieces (Cursor, magenta backgrounds): referenced as "@name"
REGEN = Path.home() / "Desktop" / "Kosari_regen"
OUT = ROOT / "web" / "public" / "remake" / "assets" / "world" / "themes"
META = ROOT / "web" / "src" / "remake" / "brawl" / "world" / "themes.gen.json"

# theme: wall (file, top, bottom), floor (file, top, bottom), props [(file, height_px_in_world, place)]
# place: back = behind the lane, fg = big dark silhouettes passing in front.
THEMES = {
    "highway": {
        "wall": ("@highway_roadside", 0.0, 0.64),
        "floor": ("@highway_roadside", 0.64, 0.99),
        "props": [("highway/props/cone", 70, "back"), ("highway/props/pole", 330, "back"), ("highway/props/road_sign", 190, "back"),
                  ("highway/props/tire_stack", 110, "back"), ("highway/props/car_wreck", 140, "back"), ("highway/props/barrier", 90, "back"),
                  ("highway/props/bus_stop", 260, "back")],
    },
    "shawarma": {
        "wall": ("@shawarma_lot", 0.0, 0.66),
        # The kiosk sign must not be mirrored
        "mirror": False,
        "floor": ("@shawarma_lot", 0.66, 0.99),
        "props": [("shawarma/props/plastic_table", 90, "back"), ("shawarma/props/plastic_chair", 95, "back"),
                  ("shawarma/props/shawarma_spit", 150, "back"), ("shawarma/props/drinks_fridge", 200, "back")],
    },
    "village": {
        "wall": ("village/far", 0.0, 0.62),
        "floor": ("village/stadium_far", 0.76, 0.98),
        "props": [("village/props/wooden_fence", 130, "back"), ("village/props/well", 170, "back"), ("village/props/water_pump", 140, "back"),
                  ("village/props/bicycle", 120, "back"), ("village/breakable/hay_bale_0", 100, "back"), ("village/breakable/bucket_0", 60, "back")],
    },
    "stadium": {
        "wall": ("village/stadium_far", 0.0, 0.72),
        "floor": ("village/stadium_far", 0.72, 0.98),
        "props": [("village/props/goal", 200, "back"), ("village/props/ball_pile", 100, "back"), ("village/props/bench", 100, "back"),
                  ("village/breakable/ball_crate_0", 90, "back")],
    },
    "dacha": {
        "wall": ("dacha/mid", 0.0, 0.74),
        "floor": ("dacha/mid", 0.74, 0.87),
        "props": [("dacha/props/scarecrow", 220, "back"), ("dacha/props/garden_bed", 90, "back"), ("dacha/breakable/watering_can_0", 60, "back"),
                  ("dacha/breakable/wood_box_0", 90, "back")],
    },
    "cellar": {
        "wall": ("dacha/cellar_bg", 0.14, 0.64),
        "floor": ("dacha/cellar_bg", 0.64, 0.84),
        "props": [("dacha/props/jar_shelf", 210, "back"), ("dacha/props/old_sofa", 120, "back"), ("dacha/props/pipes", 160, "back")],
    },
    "panelki": {
        "wall": ("panelki/far", 0.0, 0.80),
        "floor": ("gym/gym_street_world", 0.60, 0.82),
        "props": [("panelki/props/garage", 230, "back"), ("panelki/props/swing", 200, "back"), ("panelki/props/bench_entrance", 100, "back"),
                  ("panelki/props/trash_container", 140, "back"), ("panelki/props/zhiguli", 130, "back"), ("panelki/props/horizontal_bar", 220, "back"),
                  ("panelki/props/carpet_rack", 170, "back")],
    },
    "pc_club": {
        "wall": ("pc_club/world", 0.0, 0.42),
        "floor": ("pc_club/world", 0.42, 0.86),
        "props": [("pc_club/props/arcade", 230, "back"), ("pc_club/props/gaming_chair", 150, "back"), ("pc_club/props/water_cooler", 170, "back"),
                  ("pc_club/breakable/energy_drink_box_0", 70, "back"), ("pc_club/breakable/crt_monitor_0", 90, "back")],
    },
    "gym_street": {
        "wall": ("gym/gym_street_world", 0.0, 0.56),
        "floor": ("gym/gym_street_world", 0.56, 0.84),
        "props": [("panelki/props/trash_container", 140, "back"), ("panelki/breakable/cardboard_boxes_0", 110, "back")],
    },
    "gym": {
        "wall": ("gym/mid", 0.0, 0.50),
        "floor": ("gym/world", 0.40, 0.62),
        "props": [("gym/props/barbell_rack", 210, "back"), ("gym/props/bench_press", 140, "back"), ("gym/props/punching_bag", 220, "back"),
                  ("gym/props/dumbbell_rack", 170, "back"), ("gym/props/protein_shelf", 200, "back"), ("gym/props/cardio_machine", 170, "back")],
    },
    "museum": {
        "wall": ("museum/mid", 0.0, 0.70),
        "floor": ("museum/mid", 0.70, 1.0),
        "props": [("museum/props/column", 300, "back"), ("museum/props/bust", 190, "back"), ("museum/props/armor", 220, "back"),
                  ("museum/props/painting_small", 200, "back"), ("museum/breakable/vase_0", 120, "back"), ("@grand_piano", 150, "back")],
    },
    "river": {
        "wall": ("river/mid", 0.0, 0.62),
        "floor": ("river/far", 0.67, 0.80),
        "props": [("river/props/bench_river", 100, "back"), ("river/props/fishing_rod", 170, "back"), ("river/breakable/fish_bucket_0", 60, "back"),
                  ("river/breakable/buoy_0", 110, "back")],
    },
    "sigma_gym": {
        "wall": ("sigma_gym/mid", 0.0, 0.62),
        "floor": ("sigma_gym/boxing_ring", 0.665, 0.78),
        "props": [("sigma_gym/props/greek_column", 290, "back"), ("sigma_gym/props/athlete_statue", 250, "back"),
                  ("sigma_gym/props/marble_bench", 90, "back"), ("sigma_gym/props/spotlight", 190, "back")],
    },
    "ring": {
        "wall": ("sigma_gym/boxing_ring", 0.0, 0.64),
        "floor": ("sigma_gym/boxing_ring", 0.64, 0.86),
        "props": [("sigma_gym/props/spotlight", 190, "back")],
    },
    "stream_house": {
        "wall": ("stream_house/mid", 0.0, 0.67),
        "floor": ("stream_house/world", 0.44, 0.92),
        "props": [("stream_house/props/big_sofa", 110, "back"), ("stream_house/props/ring_light", 200, "back"), ("stream_house/props/neon_sign", 150, "back"),
                  ("stream_house/props/camera_tripod", 180, "back"), ("stream_house/props/delivery_boxes", 110, "back"), ("stream_house/props/fridge", 210, "back")],
    },
    "office": {
        "wall": ("office/office_world", 0.0, 0.47),
        "floor": ("office/office_world", 0.47, 0.70),
        "props": [("office/props/office_plant", 150, "back"), ("office/props/coffee_machine", 120, "back"), ("office/props/water_cooler_office", 170, "back"),
                  ("office/props/office_desk", 110, "back"), ("@reception", 130, "back")],
    },
    "trading": {
        "wall": ("office/mid", 0.0, 0.64),
        "floor": ("office/mid", 0.64, 0.86),
        "props": [("office/props/office_plant", 150, "back"), ("@glass_partition", 220, "back"), ("@trading_screens", 190, "back")],
    },
    "night_street": {
        "wall": ("concert/far", 0.0, 0.60),
        "floor": ("concert/far", 0.60, 0.96),
        "props": [("concert/props/velvet_rope", 110, "back"), ("concert/breakable/crowd_barrier_0", 110, "back"), ("@luxury_car", 120, "back"),
                  ("@club_entrance", 250, "back")],
    },
    "club": {
        "wall": ("concert/mid", 0.0, 0.58),
        "floor": ("concert/far", 0.60, 0.96),
        "props": [("concert/props/velvet_rope", 110, "back"), ("concert/props/pyro", 190, "back"), ("@luxury_car", 120, "back"),
                  ("@club_entrance", 250, "back"), ("@dj_booth", 120, "back")],
    },
    "stage": {
        "wall": ("@concert_stage", 0.0, 0.70),
        "floor": ("@concert_stage", 0.70, 0.99),
        "props": [("@speaker_stack", 260, "back"), ("@truss", 70, "back"), ("@stage_light", 210, "back"), ("concert/props/pyro", 190, "back")],
    },
}

WALL_MAX_W = 3000
PROP_MAX_H = 440


def src_path(rel: str) -> Path:
    return REGEN / f"{rel[1:]}.png" if rel.startswith("@") else SRC / "world" / f"{rel}.png"


def load(rel: str) -> Image.Image:
    return Image.open(src_path(rel)).convert("RGBA")


def crop_rows(im: Image.Image, top: float, bottom: float) -> Image.Image:
    h = im.height
    return im.crop((0, round(h * top), im.width, round(h * bottom)))


def flatten(im: Image.Image, bg=(0, 0, 0)) -> Image.Image:
    base = Image.new("RGBA", im.size, bg + (255,))
    base.alpha_composite(im)
    return base.convert("RGB")


def key_background(im: Image.Image, tol: int = 38) -> Image.Image:
    """Make the flat background transparent: flood-fill from every border pixel
    whose colour is close to the dominant corner colour (black / white / magenta /
    checkerboard greys). Interior areas of the same colour are kept."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(c[3] < 10 for c in corners):
        return im  # already cut out
    refs = {c[:3] for c in corners}
    # checkerboard: also accept the light greys around it
    refs |= {(255, 255, 255), (204, 204, 204), (230, 230, 230)} if any(min(c[:3]) > 180 for c in corners) else set()

    magenta = all(c[0] > 120 and c[2] > 50 and c[0] - c[1] > 70 for c in corners)

    def close(c):
        if c[3] < 10:
            return True
        if magenta:
            # Pink/magenta gradient backdrops: key by hue, not by one colour
            return c[0] > 110 and c[0] - c[1] > 60 and c[2] - c[1] > 25
        return any(abs(c[0] - r[0]) + abs(c[1] - r[1]) + abs(c[2] - r[2]) <= tol * 3 // 2 for r in refs)

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if not close(c):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        if x > 0:
            q.append((x - 1, y))
        if x < w - 1:
            q.append((x + 1, y))
        if y > 0:
            q.append((x, y - 1))
        if y < h - 1:
            q.append((x, y + 1))
    if magenta:
        # Enclosed pockets (inside trusses, between legs): strongly saturated magenta
        for y in range(h):
            for x in range(w):
                c = px[x, y]
                if c[3] and c[0] > 150 and c[1] < 80 and c[2] > 70 and c[0] - c[1] > 100 and c[2] - c[1] > 50:
                    px[x, y] = (c[0], c[1], c[2], 0)
        # Despill the pink fringe on what is left
        for y in range(h):
            for x in range(w):
                c = px[x, y]
                if c[3] and c[0] > c[1] + 40 and c[2] > c[1] + 25:
                    g = c[1]
                    px[x, y] = (min(c[0], g + 40), g, min(c[2], g + 30), c[3])
    # soften the 1px fringe
    a = im.getchannel("A")
    from PIL import ImageFilter

    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(a)
    return im


def dechecker(im: Image.Image, top, bottom) -> Image.Image:
    """Some paintings came with the transparency checkerboard baked in: repaint
    its grey/white squares with a vertical sky gradient."""
    im = im.convert("RGB")
    px = im.load()
    w, h = im.size
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) < 14 and min(r, g, b) > 185:
                px[x, y] = c
    return im


def main():
    meta = {}
    for theme, cfg in THEMES.items():
        dst = OUT / theme
        (dst / "props").mkdir(parents=True, exist_ok=True)
        wall = flatten(crop_rows(load(cfg["wall"][0]), *cfg["wall"][1:]))
        if cfg.get("dechecker"):
            wall = dechecker(wall, *cfg["dechecker"])
        floor = flatten(crop_rows(load(cfg["floor"][0]), *cfg["floor"][1:]), bg=(40, 40, 40))
        for name, im in (("wall", wall), ("floor", floor)):
            if im.width > WALL_MAX_W:
                k = WALL_MAX_W / im.width
                im = im.resize((WALL_MAX_W, max(1, round(im.height * k))), Image.LANCZOS)
            im.save(dst / f"{name}.jpg", quality=84)
            if name == "wall":
                wall = im
            else:
                floor = im
        # Sky colour above the wall strip: average of its top rows
        top = wall.crop((0, 0, wall.width, 6)).resize((1, 1), Image.BOX).getpixel((0, 0))
        props = []
        for rel, hpx, place in cfg["props"]:
            p = src_path(rel)
            if not p.exists():
                print("  missing", rel)
                continue
            im = key_background(Image.open(p))
            bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
            if not bb:
                continue
            im = im.crop(bb)
            if im.height > PROP_MAX_H:
                im = im.resize((round(im.width * PROP_MAX_H / im.height), PROP_MAX_H), Image.LANCZOS)
            name = Path(rel.lstrip("@")).name.replace("_0", "")
            im.save(dst / "props" / f"{name}.png")
            props.append({"key": name, "h": hpx, "place": place})
        meta[theme] = {
            "wall": [wall.width, wall.height],
            "floor": [floor.width, floor.height],
            "sky": "#%02x%02x%02x" % top[:3],
            "mirror": cfg.get("mirror", True),
            "props": props,
        }
        print(theme, meta[theme]["wall"], meta[theme]["floor"], len(props), "props")
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
