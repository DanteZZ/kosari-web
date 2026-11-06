"""Compose tall beat-em-up world: multi-layer trees + visible forest road."""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(r"C:/Users/uncle/.cursor/projects/d-Games-Kosari-v3-0/assets")
OUT_SPR = Path(r"d:/Games/Kosari v3.0/web/public/remake/assets/world/sprites")
OUT_LAY = Path(r"d:/Games/Kosari v3.0/web/public/remake/assets/world/layers")
OUT_SPR.mkdir(parents=True, exist_ok=True)
random.seed(21)

# Tall world — not squeezed into one short viewport.
W, H = 3600, 1180

# Beat-em-up road band — raised on screen (lower Y = higher visually).
ROAD_TOP = 620
ROAD_BOT = 900
ROAD_H = ROAD_BOT - ROAD_TOP  # 280px deep lane
# Walk line: a bit below geometric center of the road
PATH_ROW = (ROAD_TOP + ROAD_BOT) // 2 + 32  # 792


def chroma(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    a = np.array(im, dtype=np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    kill = (
        ((r > 130) & (b > 130) & (g < 145))
        | ((b > 190) & (g > 150) & (r < 110))
        | ((r > 200) & (b > 150) & (g < 165))
    )
    a[:, :, 3] = np.where(kill, 0, a[:, :, 3]).astype(np.uint8)
    a[a[:, :, 3] < 10, :3] = 0
    a[a[:, :, 3] < 10, 3] = 0
    out = Image.fromarray(a.astype(np.uint8), "RGBA")
    bb = out.split()[-1].getbbox()
    return out.crop(bb) if bb else out


def load_asset(name: str, max_h: int | None = None) -> Image.Image:
    for ext in (".jpg", ".png", ".jpeg"):
        p = ASSETS / f"{name}{ext}"
        if p.exists():
            spr = chroma(Image.open(p))
            break
    else:
        p = OUT_SPR / f"{name}.png"
        if not p.exists():
            raise FileNotFoundError(name)
        spr = Image.open(p).convert("RGBA")
    if max_h and spr.height > max_h:
        w = max(1, int(spr.width * max_h / spr.height))
        spr = spr.resize((w, max_h), Image.Resampling.LANCZOS)
    return spr


def tint(spr: Image.Image, rf: float, gf: float, bf: float, opac: int = 255) -> Image.Image:
    a = np.array(spr).astype(np.float32)
    a[:, :, 0] *= rf
    a[:, :, 1] *= gf
    a[:, :, 2] *= bf
    a[:, :, :3] = np.clip(a[:, :, :3], 0, 255)
    if opac < 255:
        a[:, :, 3] = a[:, :, 3] * opac / 255
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def fog_soft(w: int, h: int, alpha: int = 110, color=(180, 210, 230)) -> Image.Image:
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        t = 1 - abs((y / max(h - 1, 1)) - 0.5) * 1.5
        t = max(0.0, min(1.0, t))
        a = int(alpha * (t**1.15))
        arr[y, :, 0] = color[0]
        arr[y, :, 1] = color[1]
        arr[y, :, 2] = color[2]
        arr[y, :, 3] = a
    noise = np.random.RandomState(3).rand(h, w) * 28 - 14
    arr[:, :, 3] = np.clip(arr[:, :, 3].astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA").filter(ImageFilter.GaussianBlur(radius=7))


def paste(base: Image.Image, spr: Image.Image, x: float, y_feet: float, scale: float = 1.0, opacity: int = 255) -> Image.Image:
    nw = max(1, int(spr.width * scale))
    nh = max(1, int(spr.height * scale))
    s = spr.resize((nw, nh), Image.Resampling.LANCZOS)
    if opacity < 255:
        al = s.split()[-1].point(lambda p: int(p * opacity / 255))
        s = s.copy()
        s.putalpha(al)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(s, (int(x - s.width / 2), int(y_feet - s.height)), s)
    return Image.alpha_composite(base, layer)


def road_top_y(x: float) -> int:
    """Wavy back edge of the road (where trees stand)."""
    return int(
        ROAD_TOP
        + 22 * math.sin(x / 240.0)
        + 12 * math.sin(x / 110.0 + 0.8)
        + 6 * math.sin(x / 55.0)
    )


def road_bot_y(x: float) -> int:
    """Wavy front edge of the road."""
    return int(
        ROAD_BOT
        + 16 * math.sin(x / 200.0 + 1.1)
        + 8 * math.sin(x / 90.0)
    )


def paint_road(canvas: Image.Image, road_spr: Image.Image) -> Image.Image:
    """Thick beat-em-up dirt road — no flat grass/dirt edge strips (seams covered by bushes)."""
    road = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(road)

    # Soft soil fill (wavy), no hard grass ledge sprites
    top_pts = [(x, road_top_y(x)) for x in range(0, W + 1, 6)]
    bot_pts = [(x, road_bot_y(x)) for x in range(W, -1, -6)]
    draw.polygon(top_pts + bot_pts, fill=(128, 100, 62, 255))

    mid_top = [(x, road_top_y(x) + 50) for x in range(0, W + 1, 6)]
    mid_bot = [(x, road_bot_y(x) - 35) for x in range(W, -1, -6)]
    draw.polygon(mid_top + mid_bot, fill=(150, 116, 72, 255))

    for offset in (85, 135):
        track = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        td = ImageDraw.Draw(track)
        for x in range(0, W, 5):
            y0 = road_top_y(x) + offset + int(5 * math.sin(x / 65.0))
            td.ellipse([x - 12, y0 - 6, x + 16, y0 + 8], fill=(108, 84, 50, 85))
        road = Image.alpha_composite(road, track)

    # Soft road texture (low alpha) — no sharp tile edges
    rh = ROAD_H + 30
    rw = max(1, int(road_spr.width * (rh / max(road_spr.height, 1))))
    tex = road_spr.resize((rw, rh), Image.Resampling.LANCZOS)
    tex_a = np.array(tex)
    rgb = tex_a[:, :, :3].astype(np.int16)
    keep = (rgb[:, :, 0] > rgb[:, :, 2]) & (rgb[:, :, 1] > 40)
    tex_a[:, :, 3] = np.where(keep, np.minimum(tex_a[:, :, 3], 120), 0)
    tex = Image.fromarray(tex_a, "RGBA")
    tiled = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = -40
    while x < W + 60:
        tiled.paste(tex, (x, ROAD_TOP - 5), tex)
        x += rw - 100
    road = Image.alpha_composite(road, tiled)

    return Image.alpha_composite(canvas, road)


def main() -> None:
    spr = {
        "birch_1": load_asset("spr-birch-1"),
        "birch_2": load_asset("spr-birch-2"),
        "birch_3": load_asset("spr-birch-3"),
        "birch_far": load_asset("spr-birch-far", 480),
        "pine_1": load_asset("spr-pine-1", 340),
        "pine_2": load_asset("spr-pine-2", 300),
        "rock_1": load_asset("spr-rock-1", 110),
        "bush_1": load_asset("spr-bush-sharp-1", 150),
        "bush_2": load_asset("spr-bush-sharp-2", 130),
        "flowers": load_asset("spr-flowers", 55),
        "stump": load_asset("spr-stump", 85),
        "cloud_1": load_asset("spr-cloud-1", 120),
        "cloud_2": load_asset("spr-cloud-2", 90),
        "fog": load_asset("spr-fog", 200),
        "hill": load_asset("spr-hill", 180),
        "road": load_asset("spr-road", 280),
    }
    for k, v in spr.items():
        v.save(OUT_SPR / f"{k}.png")
        print(k, v.size)

    # ----- FAR (above road) -----
    far = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, x in enumerate(range(-30, W + 50, 75)):
        pine = spr["pine_1"] if i % 2 == 0 else spr["pine_2"]
        # stand on back of road / behind
        gy = road_top_y(x) - 40 - random.randint(0, 50)
        far = paste(far, tint(pine, 0.52, 0.7, 0.95, 175), x + random.randint(-10, 10), gy, random.uniform(0.6, 1.05))
    for x in [200, 600, 1050, 1550, 2050, 2550, 3050, 3450]:
        far = paste(
            far,
            tint(spr["birch_far"], 0.68, 0.8, 0.95, 155),
            x,
            road_top_y(x) - 30,
            random.uniform(0.6, 0.85),
        )
    far = Image.alpha_composite(far, fog_soft(W, H, alpha=95, color=(168, 202, 228)))

    # ----- MID -----
    mid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, x in enumerate([280, 560, 880, 1200, 1550, 1900, 2250, 2600, 2950, 3300]):
        key = ["birch_1", "birch_2", "birch_3"][i % 3]
        gy = road_top_y(x) - 10
        max_h = gy - 40
        sc = min(0.78, max_h / spr[key].height) * random.uniform(0.88, 1.0)
        mid = paste(mid, tint(spr[key], 0.88, 0.92, 0.96, 235), x + random.randint(-12, 12), gy, sc)
    for x in range(120, W, 170):
        mid = paste(
            mid,
            tint(spr["pine_2"], 0.62, 0.76, 0.92, 165),
            x,
            road_top_y(x) - 35,
            random.uniform(0.45, 0.7),
        )
    # Hills between far/mid tree depths (behind near trees)
    for x in range(-60, W + 80, 170):
        mid = paste(
            mid,
            tint(spr["hill"], 0.88, 0.98, 0.9, 220),
            x + random.randint(-20, 20),
            road_top_y(x) - 5,
            random.uniform(1.05, 1.45),
        )
    mid = Image.alpha_composite(mid, fog_soft(W, H, alpha=50, color=(188, 214, 234)))

    # ----- NEAR: road → trees → dense bushes → props ON TOP (rocks/stumps in front) -----
    near = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    under = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ud = ImageDraw.Draw(under)
    pts_u = [(0, H)] + [(x, road_bot_y(x) - 5) for x in range(0, W + 1, 6)] + [(W, H)]
    ud.polygon(pts_u, fill=(48, 62, 36, 255))
    near = Image.alpha_composite(near, under)

    # Extra hills peeking between mid and near tree lines
    for x in range(-30, W + 50, 220):
        near = paste(
            near,
            tint(spr["hill"], 0.92, 1.0, 0.88, 200),
            x + random.randint(-15, 15),
            road_top_y(x) + 5,
            random.uniform(0.85, 1.2),
        )

    near = paint_road(near, spr["road"])

    xs = [160, 420, 700, 1000, 1300, 1620, 1940, 2260, 2580, 2900, 3220, 3480]
    for i, x in enumerate(xs):
        key = ["birch_1", "birch_2", "birch_3"][i % 3]
        gy = road_top_y(x) + 8
        max_h = gy - 50
        sc = min(1.0, max_h / spr[key].height) * random.uniform(0.88, 1.0)
        near = paste(near, spr[key], x + random.randint(-14, 14), gy, sc)

    # Dense bushes at tree bases + along road back edge (BEFORE rocks/stumps)
    for x in range(40, W, 75):
        b = spr["bush_1"] if (x // 75) % 2 == 0 else spr["bush_2"]
        near = paste(
            near,
            b,
            x + random.randint(-28, 28),
            road_top_y(x) + random.randint(28, 62),
            random.uniform(0.5, 0.9),
        )
    for x in xs:
        for dx in (-55, 0, 55):
            b = spr["bush_2"] if dx else spr["bush_1"]
            near = paste(
                near,
                b,
                x + dx + random.randint(-12, 12),
                road_top_y(x) + random.randint(40, 75),
                random.uniform(0.55, 0.85),
            )

    # Rocks + stump + flowers LAST → higher z, in front of bushes
    near = paste(near, spr["rock_1"], 580, road_top_y(580) + 110, 1.05)
    near = paste(near, spr["stump"], 1680, road_top_y(1680) + 120, 1.1)
    near = paste(near, spr["rock_1"], 2680, road_top_y(2680) + 105, 0.95)
    for x, sc in [(720, 1.0), (1500, 1.05), (2400, 0.95)]:
        near = paste(near, spr["flowers"], x, road_top_y(x) + 70, sc)

    # ----- FRONT: bushes under road (behind), sparse darker hills lower in front -----
    # Keep clear of the road so the walk lane stays in the road CENTER, not the lip.
    grass = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(fill).rectangle([0, H - 35, W, H], fill=(28, 40, 24, 255))
    grass = Image.alpha_composite(grass, fill)

    # Bushes higher/behind — well below ROAD_BOT so they don't eat the path
    for x in range(-50, W + 60, 85):
        b = spr["bush_1"] if (x // 85) % 2 == 0 else spr["bush_2"]
        gy = min(H - 100, road_bot_y(x) + 110)
        grass = paste(grass, b, x + random.randint(-18, 18), gy, random.uniform(0.9, 1.2), 255)
    for x in range(30, W, 120):
        b = spr["bush_2"] if (x // 120) % 2 == 0 else spr["bush_1"]
        grass = paste(grass, b, x, min(H - 80, road_bot_y(x) + 135), random.uniform(0.8, 1.1), 255)

    # Sparse darker hills in front (further down); tops stay under ROAD_BOT
    for x in range(-60, W + 80, 320):
        feet = H + 10
        # leave a gap under the road so hills don't cover the walk band
        max_h = max(30, feet - (road_bot_y(x) + 40))
        sc = min(1.25, max_h / max(spr["hill"].height, 1)) * random.uniform(0.9, 1.05)
        grass = paste(
            grass,
            tint(spr["hill"], 0.5, 0.6, 0.46, 235),
            x + random.randint(-30, 30),
            feet,
            sc,
        )
    for x in range(120, W, 380):
        feet = H + 18
        max_h = max(28, feet - (road_bot_y(x) + 55))
        sc = min(1.15, max_h / max(spr["hill"].height, 1)) * random.uniform(0.85, 1.0)
        grass = paste(
            grass,
            tint(spr["hill"], 0.44, 0.54, 0.4, 225),
            x + random.randint(-25, 25),
            feet,
            sc,
        )

    # ----- CLOUDS -----
    CH = 300
    clouds = Image.new("RGBA", (W, CH), (0, 0, 0, 0))
    for x, y, sc, k in [
        (200, 80, 1.15, "cloud_1"),
        (650, 40, 0.9, "cloud_2"),
        (1100, 95, 1.3, "cloud_1"),
        (1600, 45, 0.95, "cloud_2"),
        (2100, 85, 1.2, "cloud_1"),
        (2600, 35, 0.85, "cloud_2"),
        (3100, 100, 1.05, "cloud_1"),
        (850, 150, 0.7, "cloud_2"),
        (2400, 140, 0.75, "cloud_1"),
    ]:
        clouds = paste(clouds, spr[k], x, y + int(spr[k].height * sc), sc, 215)

    fog_l = fog_soft(W, H, alpha=65, color=(172, 206, 226))

    far.save(OUT_LAY / "far.png")
    mid.save(OUT_LAY / "mid.png")
    near.save(OUT_LAY / "world.png")
    grass.save(OUT_LAY / "grass.png")
    fog_l.save(OUT_LAY / "fog.png")
    (OUT_LAY / "clouds").mkdir(exist_ok=True)
    clouds.save(OUT_LAY / "clouds" / "clouds.png")

    prev = Image.new("RGBA", (W, H), (126, 200, 240, 255))
    cf = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cf.paste(clouds, (0, 30), clouds)
    for layer in (cf, far, mid, fog_l, near, grass):
        prev = Image.alpha_composite(prev, layer)
    prev.convert("RGB").save(OUT_LAY / "preview_composite.png", quality=92)
    # show road area crop for QA
    prev.crop((0, 500, 1400, H)).save(r"c:/Users/uncle/AppData/Local/Temp/cursor/screenshots/road-preview.png")

    meta = {
        "LAYER_W": W,
        "LAYER_H": H,
        "PATH_ROW": PATH_ROW,
        "ROAD_TOP": ROAD_TOP,
        "ROAD_BOT": ROAD_BOT,
        "layers": ["clouds", "far", "mid", "fog", "world", "grass"],
    }
    (OUT_LAY / "layer_meta.txt").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("META", meta)


if __name__ == "__main__":
    main()
