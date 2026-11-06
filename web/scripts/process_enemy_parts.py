"""
Slice AI kits + limb strips into BonePuppet-compatible part PNGs.
Outputs: web/public/remake/assets/enemies/<id>/parts/{head,torso,arm_*,leg_*}.png
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
GEN = Path(r"C:\Users\uncle\.cursor\projects\d-Games-Kosari-v3-0\assets")
OUT = ROOT / "web" / "public" / "remake" / "assets" / "enemies"

# Match player part canvas sizes (approx) so shared layout works
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


def key_black(im: Image.Image, thr: int = 26) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if max(r, g, b) <= thr:
                px[x, y] = (0, 0, 0, 0)
    return im


def components(im: Image.Image, min_area: int = 600):
    arr = np.array(im)
    mask = arr[:, :, 3] > 20
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q = deque([(x, y)])
            seen[y, x] = True
            xs, ys = [], []
            while q:
                cx, cy = q.popleft()
                xs.append(cx)
                ys.append(cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            if len(xs) < min_area:
                continue
            x0, x1 = min(xs), max(xs)
            y0, y1 = min(ys), max(ys)
            crop = im.crop((x0, y0, x1 + 1, y1 + 1))
            # keep only this component alpha
            cmask = np.zeros((y1 - y0 + 1, x1 - x0 + 1), dtype=bool)
            for xx, yy in zip(xs, ys):
                cmask[yy - y0, xx - x0] = True
            carr = np.array(crop)
            carr[~cmask, 3] = 0
            crop = Image.fromarray(carr, "RGBA")
            comps.append(
                {
                    "area": len(xs),
                    "bbox": (x0, y0, x1 + 1, y1 + 1),
                    "cx": (x0 + x1) / 2,
                    "cy": (y0 + y1) / 2,
                    "w": x1 - x0 + 1,
                    "h": y1 - y0 + 1,
                    "img": crop,
                }
            )
    comps.sort(key=lambda c: -c["area"])
    return comps


def fit(im: Image.Image, tw: int, th: int, pad: int = 2) -> Image.Image:
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    cw, ch = im.size
    scale = min((tw - pad * 2) / max(1, cw), (th - pad * 2) / max(1, ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def pick_head_torso(comps):
    """Top-row: leftmost large blob = head, other large top blob = torso."""
    top = [c for c in comps if c["cy"] < 360 and c["area"] > 8000]
    if len(top) < 2:
        top = sorted(comps, key=lambda c: c["cy"])[:4]
    top_sorted = sorted(top, key=lambda c: c["cx"])
    head = top_sorted[0]
    # torso = largest remaining in upper half
    rest = [c for c in comps if c is not head]
    upper = [c for c in rest if c["cy"] < 420]
    torso = max(upper or rest, key=lambda c: c["area"])
    return head, torso


def limbs_left_to_right(path: Path):
    im = key_black(Image.open(path), thr=24)
    comps = components(im, min_area=500)
    comps = sorted(comps, key=lambda c: c["cx"])
    if len(comps) < 4:
        raise SystemExit(f"Expected >=4 limbs in {path}, got {len(comps)}")
    # take 4 largest among left-to-right sorted by choosing biggest then re-sort by x
    big = sorted(comps, key=lambda c: -c["area"])[:4]
    big = sorted(big, key=lambda c: c["cx"])
    return [c["img"] for c in big]


def save_char(char_id: str, kit_path: Path, limbs_path: Path):
    dest = OUT / char_id / "parts"
    dest.mkdir(parents=True, exist_ok=True)

    kit = key_black(Image.open(kit_path), thr=24)
    comps = components(kit, min_area=700)
    head, torso = pick_head_torso(comps)
    arms = limbs_left_to_right(limbs_path)
    # arms: [upper, lower, thigh, shin]
    arm_u, arm_l, thigh, shin = arms

    parts = {
        "head": fit(head["img"], *TARGET["head"]),
        "torso": fit(torso["img"], *TARGET["torso"]),
        "arm_r_u": fit(arm_u, *TARGET["arm_r_u"]),
        "arm_r_l": fit(arm_l, *TARGET["arm_r_l"]),
        # left side = mirrored right (same wardrobe, bone layout expects L variants)
        "arm_l_u": fit(ImageOps.mirror(arm_u), *TARGET["arm_l_u"]),
        "arm_l_l": fit(ImageOps.mirror(arm_l), *TARGET["arm_l_l"]),
        "leg_r_u": fit(thigh, *TARGET["leg_r_u"]),
        "leg_r_l": fit(shin, *TARGET["leg_r_l"]),
        "leg_l_u": fit(ImageOps.mirror(thigh), *TARGET["leg_l_u"]),
        "leg_l_l": fit(ImageOps.mirror(shin), *TARGET["leg_l_l"]),
    }

    for name, im in parts.items():
        im.save(dest / f"{name}.png")
        print(f"  {char_id}/{name}.png {im.size}")

    # preview assemble (rough, feet at bottom)
    preview = Image.new("RGBA", (220, 340), (0, 0, 0, 0))
    preview.alpha_composite(parts["torso"], (58, 40))
    preview.alpha_composite(parts["head"], (60, 0))
    preview.alpha_composite(parts["arm_r_u"], (20, 55))
    preview.alpha_composite(parts["arm_r_l"], (25, 125))
    preview.alpha_composite(parts["arm_l_u"], (145, 55))
    preview.alpha_composite(parts["arm_l_l"], (155, 130))
    preview.alpha_composite(parts["leg_r_u"], (70, 175))
    preview.alpha_composite(parts["leg_r_l"], (75, 230))
    preview.alpha_composite(parts["leg_l_u"], (110, 175))
    preview.alpha_composite(parts["leg_l_l"], (100, 230))
    preview.save(OUT / char_id / "preview.png")
    print(f"  preview → {OUT / char_id / 'preview.png'}")


def main():
    jobs = [
        ("nikita", GEN / "kit_nikita.jpg", GEN / "nikita_limbs.jpg"),
        ("buiniy", GEN / "kit_buiniy.jpg", GEN / "buiniy_limbs.jpg"),
        ("boss1", GEN / "kit_boss1.jpg", GEN / "boss1_limbs.jpg"),
    ]
    for char_id, kit, limbs in jobs:
        print(f"\n=== {char_id} ===")
        if not kit.exists() or not limbs.exists():
            raise SystemExit(f"Missing {kit} or {limbs}")
        save_char(char_id, kit, limbs)
    print("\nDone.")


if __name__ == "__main__":
    main()
