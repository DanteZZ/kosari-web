"""
Process AI-generated falling props into game sprite sheets/folders.
- Chroma-key near-black → alpha
- Fit onto original canvas sizes
- Build dirig_bomb spin frames + kosar_die shatter + mild dirig bob
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
GEN = Path(r"C:\Users\uncle\.cursor\projects\d-Games-Kosari-v3-0\assets")
OUT = ROOT / "web" / "public" / "remake" / "assets" / "sprites"
SRC_DIR = ROOT / "web" / "public" / "remake" / "assets" / "fall" / "raw"
BACKUP = ROOT / "web" / "public" / "remake" / "assets" / "fall" / "_backup_old"


def load_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def key_black(im: Image.Image, thr: int = 28, soft: int = 18) -> Image.Image:
    """Near-black background → transparent, soft edge."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            m = min(r, g, b)
            mx = max(r, g, b)
            # flat black / very dark bg
            if mx <= thr:
                px[x, y] = (r, g, b, 0)
            elif mx <= thr + soft and (mx - m) < 12:
                # fringe fade
                t = (mx - thr) / soft
                px[x, y] = (r, g, b, int(a * t))
    return im


def crop_content(im: Image.Image, pad: int = 2) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit_canvas(im: Image.Image, tw: int, th: int, scale: float | None = None) -> Image.Image:
    """Scale to fit inside canvas, centered."""
    cw, ch = im.size
    if scale is None:
        scale = min((tw - 4) / max(1, cw), (th - 4) / max(1, ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ox = (tw - nw) // 2
    oy = (th - nh) // 2
    canvas.alpha_composite(resized, (ox, oy))
    return canvas


def save_sprite(im: Image.Image, folder: str, index: int = 0) -> Path:
    dest = OUT / folder
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{index}.png"
    im.save(path, "PNG")
    return path


def backup_folder(name: str) -> None:
    src = OUT / name
    if not src.exists():
        return
    dst = BACKUP / name
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst)


def prep(src: Path, thr: int = 28) -> Image.Image:
    im = key_black(load_rgb(src), thr=thr)
    im = crop_content(im, pad=4)
    # slight cleanup of leftover dark halo
    return im


def make_bill(src: Path, folder: str, tw: int, th: int, thr: int = 22) -> None:
    backup_folder(folder)
    im = prep(src, thr=thr)
    out = fit_canvas(im, tw, th)
    save_sprite(out, folder, 0)
    print(f"OK {folder}: {out.size} opaque={sum(1 for p in out.getdata() if p[3] > 20)}")


def make_anvil(src: Path) -> None:
    backup_folder("nakovalna")
    im = prep(src, thr=24)
    out = fit_canvas(im, 100, 73)
    save_sprite(out, "nakovalna", 0)
    print("OK nakovalna", out.size)


def make_ammo(src: Path) -> None:
    backup_folder("oboima")
    im = prep(src, thr=24)
    out = fit_canvas(im, 100, 75)
    save_sprite(out, "oboima", 0)
    print("OK oboima", out.size)


def make_bomb_spin(src: Path, frames: int = 52) -> None:
    backup_folder("dirig_bomb")
    im = prep(src, thr=22)
    # Normalize to roughly original bomb content size (~46px)
    im = fit_canvas(im, 64, 64)
    content = crop_content(im, pad=1)
    for i in range(frames):
        ang = -i * (360 / frames)
        rotated = content.rotate(ang, resample=Image.Resampling.BICUBIC, expand=True)
        frame = fit_canvas(rotated, 100, 100)
        save_sprite(frame, "dirig_bomb", i)
    print(f"OK dirig_bomb: {frames} frames")


def make_dirig_bob(src: Path, frames: int = 50) -> None:
    backup_folder("dirig")
    im = prep(src, thr=20)
    base = fit_canvas(im, 320, 200)
    content = crop_content(base, pad=2)
    for i in range(frames):
        # gentle vertical bob + tiny yaw scale
        bob = int(round(math.sin(i / frames * math.pi * 2) * 4))
        squash = 1.0 + 0.012 * math.sin(i / frames * math.pi * 2 + 0.6)
        w = max(1, int(content.width * squash))
        h = max(1, int(content.height / squash))
        frame_img = content.resize((w, h), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (349, 223), (0, 0, 0, 0))
        ox = (349 - w) // 2
        oy = (223 - h) // 2 + bob
        canvas.alpha_composite(frame_img, (ox, oy))
        save_sprite(canvas, "dirig", i)
    print(f"OK dirig: {frames} frames")


def make_kosar_die(bill_path: Path, frames: int = 25) -> None:
    """Shred the 1000 bill into flying scraps (kosar smash VFX)."""
    backup_folder("kosar_die")
    bill = prep(bill_path, thr=22)
    bill = fit_canvas(bill, 48, 20)
    bill = crop_content(bill, pad=0)
    bw, bh = bill.size

    # Pre-slice into vertical strips
    strips = 6
    pieces: list[Image.Image] = []
    for s in range(strips):
        x0 = int(s * bw / strips)
        x1 = int((s + 1) * bw / strips)
        piece = bill.crop((x0, 0, x1, bh))
        pieces.append(piece)

    for i in range(frames):
        t = i / max(1, frames - 1)
        canvas = Image.new("RGBA", (70, 70), (0, 0, 0, 0))
        cx, cy = 35, 35
        for s, piece in enumerate(pieces):
            # fly outward + rotate + fade
            ang0 = (s - (strips - 1) / 2) * 18
            dist = t * t * (18 + s * 5)
            ang = ang0 + t * (40 + s * 25) * (1 if s % 2 == 0 else -1)
            px = cx + math.cos(math.radians(ang0 - 90)) * dist - piece.width / 2
            py = cy + math.sin(math.radians(ang0 - 90)) * dist - piece.height / 2 + t * 10
            rot = piece.rotate(ang, resample=Image.Resampling.BICUBIC, expand=True)
            # fade alpha
            fade = max(0, 1.0 - t * 1.15)
            if fade <= 0.02:
                continue
            faded = rot.copy()
            a = faded.split()[3].point(lambda v, f=fade: int(v * f))
            faded.putalpha(a)
            canvas.alpha_composite(faded, (int(px), int(py)))
        # early frames: also show intact-ish bill
        if t < 0.25:
            intact = bill.copy()
            a = intact.split()[3].point(lambda v, f=1 - t * 4: int(v * max(0, f)))
            intact.putalpha(a)
            canvas.alpha_composite(intact, (35 - bw // 2, 35 - bh // 2))
        save_sprite(canvas, "kosar_die", i)
    print(f"OK kosar_die: {frames} frames")


def copy_raw() -> dict[str, Path]:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    mapping = {
        "kosar": GEN / "fall_kosar_1000.jpg",
        "5 kosarei": GEN / "fall_kosar_5000.jpg",
        "10 kosarei": GEN / "fall_kosar_10.jpg",
        "nakovalna": GEN / "fall_anvil.jpg",
        "dirig_bomb": GEN / "fall_bomb.jpg",
        "oboima": GEN / "fall_ammo.jpg",
        "dirig": GEN / "fall_dirig.jpg",
    }
    out = {}
    for name, src in mapping.items():
        if not src.exists():
            raise SystemExit(f"Missing generated asset: {src}")
        dest = SRC_DIR / f"{name.replace(' ', '_')}.png"
        Image.open(src).convert("RGBA").save(dest)
        out[name] = dest
    return out


def main() -> None:
    raw = copy_raw()
    make_bill(raw["kosar"], "kosar", 70, 29, thr=20)
    make_bill(raw["5 kosarei"], "5 kosarei", 100, 44, thr=20)
    make_bill(raw["10 kosarei"], "10 kosarei", 60, 26, thr=20)
    make_anvil(raw["nakovalna"])
    make_ammo(raw["oboima"])
    make_bomb_spin(raw["dirig_bomb"], 52)
    make_dirig_bob(raw["dirig"], 50)
    make_kosar_die(raw["kosar"], 25)
    print("Done. Backups in", BACKUP)


if __name__ == "__main__":
    main()
