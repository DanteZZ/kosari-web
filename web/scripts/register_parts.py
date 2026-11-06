"""
Register hand-cut part layers for an enemy rig — AS IS.

    python web/scripts/register_parts.py <src_dir> <enemy_id>

  * Images are copied unchanged: no rotation, no resizing, no mirroring.
  * Bones come from the file names, exactly like the pocik cut:
      head, body → torso,
      hand_left_top / hand_left_bottom   → arm_l_u / arm_l_l,
      hand_right_top / hand_right_bottom → arm_r_u / arm_r_l,
      leg_left_* → leg_l_*, leg_right_* → leg_r_*  (typos "rught"/"tight" ok).
    A duplicated name goes to the slot that is still empty.
  * Parenting / paint order as the player: left arm on the hips (behind the
    torso), right arm on the torso, legs on the hips, lower limbs on upper ones.
  * Rough placement only: if the folder has the full stance picture (a png
    without "__"), each part is placed where it best matches on it; pivots are
    simple defaults. Fine-tune positions and pivots in the bone editor
    («Кости · враги» → «Сохранить в проект»).
Outputs: public/remake/assets/enemies/<id>/parts/<bone>.png and
src/remake/game/enemies/layouts/<id>.json (positions in the images' own pixels;
on-screen size is the skin's `scale` in enemies/parts.js).
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.signal import fftconvolve

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "remake" / "assets" / "enemies"
LAYOUTS = ROOT / "src" / "remake" / "game" / "enemies" / "layouts"

BONES = ["head", "torso", "arm_r_u", "arm_r_l", "arm_l_u", "arm_l_l", "leg_r_u", "leg_r_l", "leg_l_u", "leg_l_l"]

# Default pivots (fraction of the image): joint end of each part
PIVOT = {
    "head": (0.5, 0.9),
    "torso": (0.5, 0.95),
    "arm_r_u": (0.5, 0.12), "arm_l_u": (0.5, 0.12),
    "arm_r_l": (0.5, 0.1), "arm_l_l": (0.5, 0.1),
    "leg_r_u": (0.5, 0.1), "leg_l_u": (0.5, 0.1),
    "leg_r_l": (0.5, 0.06), "leg_l_l": (0.5, 0.06),
}
PARENT = {
    "torso": "hips", "head": "torso",
    "arm_l_u": "hips", "arm_l_l": "arm_l_u",
    "arm_r_u": "torso", "arm_r_l": "arm_r_u",
    "leg_r_u": "hips", "leg_r_l": "leg_r_u",
    "leg_l_u": "hips", "leg_l_l": "leg_l_u",
}


def bone_of(stem: str) -> str | None:
    n = stem.lower()
    if "head" in n:
        return "head"
    if "body" in n or "torso" in n:
        return "torso"
    side = "l" if "left" in n else "r" if re.search(r"r[iu]ght|tight", n) else None
    seg = "u" if "top" in n else "l" if "bottom" in n else None
    if not side or not seg:
        return None
    if "hand" in n or "arm" in n:
        return f"arm_{side}_{seg}"
    if "leg" in n:
        return f"leg_{side}_{seg}"
    return None


def locate(ref: np.ndarray, part: np.ndarray, avoid: np.ndarray | None, scale: float = 0.5):
    """Rough top-left of `part` on `ref` (alpha-weighted colour match)."""
    def small(im, s):
        return np.array(Image.fromarray(im.astype(np.uint8)).resize((max(1, int(im.shape[1] * s)), max(1, int(im.shape[0] * s))), Image.Resampling.BILINEAR)).astype(float)

    R, P = small(ref, scale), small(part, scale)
    a = P[..., 3] / 255
    Ra = R[..., 3:4] / 255
    Rc = R[..., :3] / 255 * Ra + (1 - Ra) * 3
    m = np.zeros((R.shape[0] - P.shape[0] + 1, R.shape[1] - P.shape[1] + 1))
    if m.size <= 0:
        return 0, 0
    for c in range(3):
        p = P[..., c] / 255
        r = Rc[..., c]
        m += fftconvolve(r * r, a[::-1, ::-1], mode="valid") - 2 * fftconvolve(r, (a * p)[::-1, ::-1], mode="valid")
    if avoid is not None:
        A = np.array(Image.fromarray((avoid * 255).astype(np.uint8)).resize((R.shape[1], R.shape[0]))).astype(float) / 255
        m += 4.0 * fftconvolve(A, a[::-1, ::-1], mode="valid")
    y, x = np.unravel_index(np.argmin(m), m.shape)
    return int(x / scale), int(y / scale)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, eid = Path(sys.argv[1]), sys.argv[2]
    files = sorted(src.glob("*.png"))
    refs = [f for f in files if "__" not in f.name]

    slots: dict[str, Path] = {}
    extra = []
    for f in files:
        if "__" not in f.name:
            continue
        b = bone_of(f.stem.split("__", 1)[-1])
        if not b:
            print("skip (name not recognised):", f.name)
        elif b in slots:
            extra.append(f)
        else:
            slots[b] = f
    for f in extra:
        empty = [b for b in BONES if b not in slots]
        if empty:
            print(f"NOTE: {f.name} duplicates a name — used as {empty[0]}")
            slots[empty[0]] = f
    missing = [b for b in BONES if b not in slots]
    if missing:
        print("MISSING:", missing)
        sys.exit(2)

    out = OUT / eid / "parts"
    out.mkdir(parents=True, exist_ok=True)
    imgs = {}
    for b, f in slots.items():
        shutil.copyfile(f, out / f"{b}.png")  # unchanged pixels
        imgs[b] = Image.open(f).convert("RGBA")
        print(f"{b:8s} <- {f.name} {imgs[b].size}")

    # ---- Rough placement (top-left of each part in a common frame)
    tl = {}
    if refs:
        ref = np.array(Image.open(refs[0]).convert("RGBA")).astype(float)
        hx, hy = locate(ref, np.array(imgs["head"]).astype(float), None)
        tl["head"] = (hx, hy)
        avoid = np.zeros(ref.shape[:2])
        hm = np.array(imgs["head"].getchannel("A")) > 100
        hm[int(hm.shape[0] * 0.8):] = False
        avoid[hy:hy + hm.shape[0], hx:hx + hm.shape[1]] = hm[: ref.shape[0] - hy, : ref.shape[1] - hx]
        for b in BONES:
            if b != "head":
                tl[b] = locate(ref, np.array(imgs[b]).astype(float), avoid)
        alpha = ref[..., 3] > 100
        feet = int(np.nonzero(alpha)[0].max())
    else:
        # No picture: stack the parts in a plain standing column
        t, h = imgs["torso"].size, imgs["head"].size
        lu, ll = imgs["leg_r_u"].size, imgs["leg_r_l"].size
        feet = lu[1] + ll[1] + t[1] + h[1]
        tl["head"] = (-h[0] // 2, 0)
        tl["torso"] = (-t[0] // 2, h[1] - 10)
        hip_y = h[1] + t[1] - 20
        for s, dx in (("r", -t[0] // 5), ("l", t[0] // 5)):
            u, l = imgs[f"leg_{s}_u"].size, imgs[f"leg_{s}_l"].size
            tl[f"leg_{s}_u"] = (dx - u[0] // 2, hip_y)
            tl[f"leg_{s}_l"] = (dx - l[0] // 2, hip_y + u[1] - 15)
            au, al = imgs[f"arm_{s}_u"].size, imgs[f"arm_{s}_l"].size
            ax = (-1 if s == "r" else 1) * t[0] // 2
            tl[f"arm_{s}_u"] = (ax - au[0] // 2, h[1])
            tl[f"arm_{s}_l"] = (ax - al[0] // 2, h[1] + au[1] - 15)

    def pivot_pt(b):
        ox, oy = PIVOT[b]
        w, h = imgs[b].size
        return tl[b][0] + ox * w, tl[b][1] + oy * h

    hip = ((pivot_pt("leg_r_u")[0] + pivot_pt("leg_l_u")[0]) / 2, (pivot_pt("leg_r_u")[1] + pivot_pt("leg_l_u")[1]) / 2)
    world = {"hips": hip}
    lay = {"hips": {"x": 0, "y": round(hip[1] - feet, 1)}}
    for b in ["torso", "head", "arm_l_u", "arm_l_l", "arm_r_u", "arm_r_l", "leg_r_u", "leg_r_l", "leg_l_u", "leg_l_l"]:
        p = pivot_pt(b)
        world[b] = p
        q = world[PARENT[b]]
        lay[b] = {
            "parent": PARENT[b], "tex": b,
            "originX": PIVOT[b][0], "originY": PIVOT[b][1],
            "x": round(p[0] - q[0], 1), "y": round(p[1] - q[1], 1), "angle": 0,
        }
    # Hand points (fists) for weapons / hit sparks: far end of each forearm
    for s in "lr":
        w, h = imgs[f"arm_{s}_l"].size
        lay[f"hand_{s}"] = {"parent": f"arm_{s}_l", "tex": None, "originX": 0.5, "originY": 0.5, "x": 0, "y": round(h * 0.8, 1), "angle": 0}

    LAYOUTS.mkdir(parents=True, exist_ok=True)
    (LAYOUTS / f"{eid}.json").write_text(json.dumps(lay, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("layout ->", LAYOUTS / f"{eid}.json", f"(figure height {feet - min(y for _, y in tl.values())}px)")


if __name__ == "__main__":
    main()
