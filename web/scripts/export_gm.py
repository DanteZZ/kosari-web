"""
Export the decompiled GameMaker 8 project (kosari_src/) to a JSON bundle +
assets that the web GM runtime (src/classic/gm/) executes.

    python web/scripts/export_gm.py

Writes web/public/classic/gm/game.json and copies sprites (spr/<name>/<i>.png),
backgrounds (bg/<name>.png) and sounds (snd/<name>.<ext>) next to it.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "kosari_src"
OUT = ROOT / "web" / "public" / "classic" / "gm"


def order(kind: str) -> list[str]:
    lst = ET.parse(SRC / kind / "_resources.list.xml").getroot()
    return [r.get("name") for r in lst.iter("resource") if r.get("type") == "RESOURCE"]


def safe_name(name: str) -> str:
    """URL/file-safe asset folder name (the runtime uses the same rule)."""
    return re.sub(r"[^A-Za-z0-9_+\-]", "_", name.strip())


def res_path(kind: str, name: str, suffix: str) -> Path:
    """Resource file on disk: GmkSplitter trims names and replaces illegal chars."""
    for n in (name, name.strip(), re.sub(r'[\/:*?"<>|]', "_", name).strip()):
        p = SRC / kind / f"{n}{suffix}"
        if p.exists():
            return p
    return SRC / kind / f"{name.strip()}{suffix}"


def txt(node, path, default=None):
    v = node.findtext(path)
    return default if v is None else v


def glob_escape(s: str) -> str:
    return re.sub(r"([\[\]*?])", r"[\1]", s)


def export_sprites():
    sprites = {}
    for name in order("Sprites"):
        x = ET.parse(res_path("Sprites", name, ".xml")).getroot()
        imgs_dir = res_path("Sprites", name, ".images")
        frames = sorted(imgs_dir.glob("*.png"), key=lambda p: int(re.search(r"(\d+)\.png$", p.name).group(1))) if imgs_dir.exists() else []
        dst = OUT / "spr" / safe_name(name)
        dst.mkdir(parents=True, exist_ok=True)
        w = h = 0
        for i, f in enumerate(frames):
            shutil.copyfile(f, dst / f"{i}.png")
            if i == 0:
                w, h = Image.open(f).size
        o = x.find("origin")
        b = x.find("mask/bounds")
        mode = b.get("mode") if b is not None else "AUTOMATIC"
        bbox = None
        if b is not None and mode == "MANUAL":
            bbox = [int(txt(b, "left", 0)), int(txt(b, "top", 0)), int(txt(b, "right", w - 1)), int(txt(b, "bottom", h - 1))]
        elif frames:
            # AUTOMATIC / FULL: bounding box of opaque pixels over all frames
            if mode == "FULL":
                bbox = [0, 0, w - 1, h - 1]
            else:
                l, t, r, bt = w, h, -1, -1
                for f in frames:
                    im = Image.open(f).convert("RGBA")
                    bb = im.getchannel("A").getbbox()
                    if bb:
                        l, t, r, bt = min(l, bb[0]), min(t, bb[1]), max(r, bb[2] - 1), max(bt, bb[3] - 1)
                bbox = [l, t, r, bt] if r >= 0 else [0, 0, w - 1, h - 1]
        sprites[name] = {
            "n": len(frames),
            "w": w,
            "h": h,
            "ox": int(o.get("x")) if o is not None else 0,
            "oy": int(o.get("y")) if o is not None else 0,
            "bbox": bbox or [0, 0, max(0, w - 1), max(0, h - 1)],
        }
    return sprites


def export_backgrounds():
    bgs = {}
    for name in order("Backgrounds"):
        f = res_path("Backgrounds", name, ".png")
        (OUT / "bg").mkdir(parents=True, exist_ok=True)
        if f.exists():
            shutil.copyfile(f, OUT / "bg" / f"{safe_name(name)}.png")
            w, h = Image.open(f).size
        else:
            w = h = 0
        bgs[name] = {"w": w, "h": h}
    return bgs


def export_sounds():
    snds = {}
    (OUT / "snd").mkdir(parents=True, exist_ok=True)
    for name in order("Sounds"):
        x = ET.parse(res_path("Sounds", name, ".xml")).getroot()
        ext = (txt(x, "filetype", ".wav") or ".wav").lower()
        stem = res_path("Sounds", name, ".xml").stem
        cands = [p for p in (SRC / "Sounds").glob(f"{glob_escape(stem)}.*") if p.suffix.lower() != ".xml"]
        if not cands:
            continue
        safe = safe_name(name)
        dst = f"{safe}{cands[0].suffix.lower()}"
        shutil.copyfile(cands[0], OUT / "snd" / dst)
        snds[name] = {"file": dst, "music": txt(x, "kind") == "MULTIMEDIA", "vol": float(txt(x, "volume", "1"))}
    return snds


def export_paths():
    paths = {}
    for name in order("Paths"):
        x = ET.parse(res_path("Paths", name, ".xml")).getroot()
        pts = [[float(p.get("x")), float(p.get("y")), float(p.get("speed"))] for p in x.iter("point")]
        paths[name] = {"pts": pts, "closed": txt(x, "closed") == "true", "smooth": txt(x, "smooth") == "true"}
    return paths


def export_fonts():
    fonts = {}
    for name in order("Fonts"):
        x = ET.parse(res_path("Fonts", name, ".xml")).getroot()
        fonts[name] = {"name": txt(x, "fontName"), "size": int(txt(x, "size", "12")), "bold": txt(x, "bold") == "true", "italic": txt(x, "italic") == "true"}
    return fonts


def parse_action(a):
    args = [{"k": g.get("kind"), "v": g.text or ""} for g in a.findall("./arguments/argument")]
    return {
        "id": int(a.get("id")),
        "fn": txt(a, "functionName", "") or "",
        "kind": txt(a, "kind"),
        "q": txt(a, "question") == "true",
        "rel": txt(a, "relative") == "true",
        "not": txt(a, "not") == "true",
        "to": txt(a, "appliesTo", ".self"),
        "a": args,
    }


def export_objects():
    objs = {}
    for name in order("Objects"):
        x = ET.parse(res_path("Objects", name, ".xml")).getroot()
        events = {}
        d = res_path("Objects", name, ".events")
        if d.exists():
            for f in sorted(d.glob("*.xml")):
                ev = ET.parse(f).getroot()
                cat = ev.get("category")
                key = f"{cat}:{ev.get('with') or ev.get('id')}"
                events[key] = [parse_action(a) for a in ev.iter("action")]
        objs[name] = {
            "sprite": txt(x, "sprite") or None,
            "solid": txt(x, "solid") == "true",
            "visible": txt(x, "visible") == "true",
            "depth": int(txt(x, "depth", "0")),
            "persistent": txt(x, "persistent") == "true",
            "parent": txt(x, "parent") or None,
            "mask": txt(x, "mask") or None,
            "ev": events,
        }
    return objs


def export_rooms():
    rooms = []
    for name in order("Rooms"):
        x = ET.parse(res_path("Rooms", name, ".xml")).getroot()
        size = x.find("size")
        bgs = []
        for b in x.iter("backgroundDef"):
            img = txt(b, "backgroundImage") or None
            if not img:
                continue
            off, spd = b.find("offset"), b.find("speed")
            bgs.append({
                "img": img,
                "visible": txt(b, "visibleOnRoomStart") == "true",
                "fg": txt(b, "isForeground") == "true",
                "x": float(off.get("x")), "y": float(off.get("y")),
                "hs": float(spd.get("x")), "vs": float(spd.get("y")),
                "tx": txt(b, "tileHorizontally") == "true", "ty": txt(b, "tileVertically") == "true",
                "stretch": txt(b, "stretch") == "true",
            })
        insts = []
        for i in x.iter("instance"):
            p = i.find("position")
            insts.append({"obj": txt(i, "object"), "x": float(p.get("x")), "y": float(p.get("y")), "code": txt(i, "creationCode", "") or ""})
        rooms.append({
            "name": name,
            "w": int(size.get("width")), "h": int(size.get("height")),
            "speed": int(txt(x, "speed", "30")),
            "color": txt(x, "backgroundColor", "000000"),
            "drawColor": txt(x, "drawBackgroundColor") == "true",
            "code": txt(x, "creationCode", "") or "",
            "bgs": bgs,
            "inst": insts,
        })
    return rooms


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    game = {
        "sprites": export_sprites(),
        "backgrounds": export_backgrounds(),
        "sounds": export_sounds(),
        "paths": export_paths(),
        "fonts": export_fonts(),
        "objects": export_objects(),
        "rooms": export_rooms(),
    }
    (OUT / "game.json").write_text(json.dumps(game, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print({k: len(v) for k, v in game.items()})


if __name__ == "__main__":
    main()
