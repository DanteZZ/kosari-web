"""
Import hand-cut part PNGs (Photoshop layer export like Desktop/povar/*.png)
into a BonePuppet skin.

    python web/scripts/import_cut_parts.py <src_dir> <enemy_id> [--legs 235]

What it does per part:
  * finds the limb's long axis (PCA of the alpha mask) and rotates it vertical;
  * puts the joint end on top: upper limbs — the wider end (shoulder / hip),
    forearms — the end away from the fist (skin tones), shins — the end away
    from the shoe (parts are drawn shoe-down already, so keep orientation);
  * trims, scales the whole character uniformly so thigh+shin ≈ --legs px;
  * writes parts to public/remake/assets/enemies/<id>/parts/<bone>.png,
    copies the sources to web/art-src/<id>/ and writes a layout to
    src/remake/game/enemies/layouts/<id>.json whose
    joints are placed from the part sizes, in the player's rig conventions.

File names are matched by keywords: head, body, hand/arm + left/right +
top/bottom, leg + left/right + top/bottom (typos like "rught"/"tight" ok).
"""
from __future__ import annotations

import json
import math
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "remake" / "assets" / "enemies"
ART = ROOT / "art-src"


def classify(name: str) -> str | None:
    n = name.lower()
    if "head" in n:
        return "head"
    if "body" in n or "torso" in n:
        return "torso"
    side = "l" if "left" in n else "r" if re.search(r"r[iu]ght|tight", n) else None
    seg = "u" if "top" in n else "l" if "bottom" in n else None
    if side is None or seg is None:
        return None
    if "hand" in n or "arm" in n:
        return f"arm_{side}_{seg}"
    if "leg" in n:
        return f"leg_{side}_{seg}"
    return None


def mask_of(im: Image.Image) -> np.ndarray:
    return np.array(im.getchannel("A")) > 128


def axis_angle(m: np.ndarray) -> float:
    ys, xs = np.nonzero(m)
    xs = xs - xs.mean()
    ys = ys - ys.mean()
    cov = np.cov(np.vstack([xs, ys]))
    w, v = np.linalg.eigh(cov)
    vx, vy = v[:, np.argmax(w)]
    return math.degrees(math.atan2(vy, vx))  # angle of the long axis in image space


def to_vertical(im: Image.Image) -> Image.Image:
    ang = axis_angle(mask_of(im))
    # rotate so the long axis points down (90°); PIL rotates counter-clockwise
    rot = ang - 90
    while rot > 90:
        rot -= 180
    while rot < -90:
        rot += 180
    out = im.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
    bb = out.getchannel("A").getbbox()
    return out.crop(bb) if bb else out


def end_width(m: np.ndarray, top: bool) -> float:
    h = m.shape[0]
    band = m[: max(1, h // 5)] if top else m[h - max(1, h // 5):]
    rows = band.sum(axis=1)
    return float(rows[rows > 0].mean()) if rows.any() else 0.0


def skin_center_y(im: Image.Image) -> float | None:
    a = np.array(im.convert("RGBA")).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    skin = (al > 128) & (r > 120) & (r > g + 12) & (g > b) & (r - b > 25)
    ys, _ = np.nonzero(skin)
    if len(ys) < 50:
        return None
    return ys.mean() / a.shape[0]


def orient(bone: str, im: Image.Image) -> Image.Image:
    if bone in ("head", "torso"):
        bb = im.getchannel("A").getbbox()
        return im.crop(bb) if bb else im
    if bone.startswith("leg_") and bone.endswith("_l"):
        # Shins are drawn shoe-down: only straighten, never flip
        v = to_vertical(im)
        return v
    v = to_vertical(im)
    if bone.startswith("arm_") and bone.endswith("_l"):
        c = skin_center_y(v)
        if c is not None and c < 0.5:
            v = v.rotate(180, expand=True)
        return v
    # Upper limbs: wider end (shoulder / hip) goes on top
    m = mask_of(v)
    if end_width(m, top=False) > end_width(m, top=True):
        v = v.rotate(180, expand=True)
    return v


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    eid = sys.argv[2]
    legs_target = 235.0
    if "--legs" in sys.argv:
        legs_target = float(sys.argv[sys.argv.index("--legs") + 1])

    parts = {}
    art = ART / eid
    art.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob("*.png")):
        bone = classify(f.stem.split("__", 1)[-1])
        shutil.copy(f, art / f.name)
        if not bone:
            print("skip (unknown part):", f.name)
            continue
        if bone in parts:
            print(f"WARNING: duplicate {bone}: {f.name} (keeping first)")
            continue
        parts[bone] = orient(bone, Image.open(f).convert("RGBA"))
    missing = [b for b in ["head", "torso", "arm_r_u", "arm_r_l", "arm_l_u", "arm_l_l", "leg_r_u", "leg_r_l", "leg_l_u", "leg_l_l"] if b not in parts]
    if missing:
        print("MISSING parts:", missing)
        sys.exit(2)

    legs = (parts["leg_r_u"].height + parts["leg_l_u"].height) / 2 * 0.86 + (parts["leg_r_l"].height + parts["leg_l_l"].height) / 2 * 0.92
    k = legs_target / legs
    out = OUT / eid / "parts"
    out.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for bone, im in parts.items():
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        im = im.resize((w, h), Image.Resampling.LANCZOS)
        im.save(out / f"{bone}.png")
        sizes[bone] = (w, h)

    # ---- Layout in the player's conventions. Left / right are the character's own
    # (as in the pocik cut): facing right, his left side is the far one (+x, behind),
    # his right side the near one (−x, in front).
    tw, th = sizes["torso"]
    thigh = (sizes["leg_r_u"][1] + sizes["leg_l_u"][1]) / 2
    shin = (sizes["leg_r_l"][1] + sizes["leg_l_l"][1]) / 2
    hips_y = -(thigh * 0.86 + shin * 0.92)
    sh_y = -th * 0.78
    sh_x = tw * 0.27
    hip_x = tw * 0.17
    lay = {
        "hips": {"x": 0, "y": round(hips_y, 1)},
        "torso": {"parent": "hips", "tex": "torso", "originX": 0.5, "originY": 0.96, "x": 0, "y": round(th * 0.04, 1), "angle": 0},
        "head": {"parent": "torso", "tex": "head", "originX": 0.5, "originY": 0.9, "x": 2, "y": round(-th * 0.86, 1), "angle": 0},
        # Same parenting / paint order as the player (pocik): back (left) arm hangs
        # off the hips so it draws behind the torso; front (right) arm is a torso
        # child so it draws over the body, under the head.
        "arm_l_u": {"parent": "hips", "tex": "arm_l_u", "originX": 0.5, "originY": 0.1, "x": round(tw * 0.28), "y": round(th * 0.04 + sh_y), "angle": 2},
        "arm_l_l": {"parent": "arm_l_u", "tex": "arm_l_l", "originX": 0.5, "originY": 0.06, "x": 0, "y": round(sizes["arm_l_u"][1] * 0.84), "angle": -48},
        "hand_l": {"parent": "arm_l_l", "tex": None, "originX": 0.5, "originY": 0.5, "x": 0, "y": round(sizes["arm_l_l"][1] * 0.82), "angle": 0},
        "arm_r_u": {"parent": "torso", "tex": "arm_r_u", "originX": 0.5, "originY": 0.1, "x": round(-tw * 0.4), "y": round(sh_y), "angle": -6},
        "arm_r_l": {"parent": "arm_r_u", "tex": "arm_r_l", "originX": 0.5, "originY": 0.06, "x": 0, "y": round(sizes["arm_r_u"][1] * 0.84), "angle": -62},
        "hand_r": {"parent": "arm_r_l", "tex": None, "originX": 0.5, "originY": 0.5, "x": 0, "y": round(sizes["arm_r_l"][1] * 0.82), "angle": 0},
        "leg_r_u": {"parent": "hips", "tex": "leg_r_u", "originX": 0.5, "originY": 0.08, "x": round(-tw * 0.06), "y": 6, "angle": 0},
        "leg_r_l": {"parent": "leg_r_u", "tex": "leg_r_l", "originX": 0.5, "originY": 0.05, "x": 0, "y": round(sizes["leg_r_u"][1] * 0.86), "angle": 2},
        "leg_l_u": {"parent": "hips", "tex": "leg_l_u", "originX": 0.5, "originY": 0.08, "x": round(tw * 0.22), "y": 6, "angle": -4},
        "leg_l_l": {"parent": "leg_l_u", "tex": "leg_l_l", "originX": 0.5, "originY": 0.05, "x": 0, "y": round(sizes["leg_l_u"][1] * 0.86), "angle": 2},
    }
    lay_dir = ROOT / "src" / "remake" / "game" / "enemies" / "layouts"
    lay_dir.mkdir(parents=True, exist_ok=True)
    (lay_dir / f"{eid}.json").write_text(json.dumps(lay, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"scale {k:.3f}; sizes {sizes}")
    print("layout ->", lay_dir / f"{eid}.json")


if __name__ == "__main__":
    main()
