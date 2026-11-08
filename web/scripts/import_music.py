"""
Music for the remake: picks from music_preview/ (Kevin MacLeod, CC BY 4.0) and
DNTZ's boss mashups from ~/Downloads, loudness-normalised and re-encoded.

    python web/scripts/import_music.py [slot ...]

Output: web/public/remake/assets/music/<slot>.mp3 (128 kbps, EBU R128 -16 LUFS)
and web/src/remake/music.credits.json (attribution lines for the credits roll).
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "music_preview"
DL = Path.home() / "Downloads"
OUT = ROOT / "web" / "public" / "remake" / "assets" / "music"
CREDITS = ROOT / "web" / "src" / "remake" / "music.credits.json"

# slot -> (source file, credit or None). Preview files are matched by their number prefix.
CC = "Kevin MacLeod (incompetech.com) — CC BY 4.0"
SLOTS = {
    # Chapters
    "ch_forest": ("01", CC),
    "ch_opushka": ("02", CC),
    "ch_shawarma": ("03", CC),
    "ch_village": ("04", CC),
    "ch_dacha": ("05", CC),
    "ch_cellar": ("06", CC),
    "ch_panelki": ("07", CC),
    "ch_pc_club": ("08", CC),
    "ch_gym": ("09", CC),
    "ch_museum": ("10", CC),
    "ch_river": ("11", CC),
    "ch_sigma_gym": ("12", CC),
    "ch_stream_house": ("13", CC),
    "ch_office": ("14", CC),
    "ch_concert": ("15", CC),
    # Meeting a new meme enemy (Дед and Глад got DNTZ's mashups)
    "en_ded": (DL / "YURIST - ФУТБОЛЬНЫЙ МЯЧИК (feat. ТАМБОВСКИЙ ДЕД).mp3", None),
    "en_mongol": ("21", CC),
    "en_glad": (DL / "dastovsd ft. GLAD VALAKAS - PAROL DEATH (PHONK MASHUP).mp3", None),
    "en_ruki": ("23", CC),
    "en_vertuha": ("24", CC),
    "en_reka": ("25", CC),
    "en_zubarev": ("26", CC),
    "en_gitelman": ("27", CC),
    # Minigames
    "mi_race": ("30", CC),
    "mi_survive": ("31", CC),
    "mi_penalty": ("32", CC),
    "mi_village_finale": (DL / "Геннадий Горин - Футбол (grindcore mashup).mp3", None),
    "mi_chase": ("33", CC),
    "mi_td": ("34", CC),
    "mi_bench": ("35", CC),
    "mi_stealth": ("36", CC),
    "mi_raft": ("37", CC),
    "mi_lift1": ("38", CC),
    "mi_lift2": ("39", CC),
    "mi_lift3": ("40", CC),
    "mi_trading": ("41", CC),
    "mi_qte": ("42", CC),
    "mi_rap": ("43", CC),
    # Screens
    "ui_menu": ("50", CC),
    "ui_loading": ("51", CC),
    "ui_results": ("52", CC),
    "ui_ending": ("53", CC),
    "ui_credits": ("54", CC),
    # Bosses: DNTZ's mashups
    "bo_borsch": (DL / "MASHUP BY MEMEZGANG - РАШН ФЕСТИВАЛЬ НА ГРОУВ-СТРИТ.mp3", None),
    "bo_povar": (DL / "ZeeMan - Ебашилово в саду.mp3", None),
    "bo_pahom": (DL / "[MASHUP] Робо-карнавал – музыка из «Ну погоди» & Пахом.mp3", None),
    "bo_papich": (DL / "даня - без фонка.mp3", None),
    "bo_papich2": (DL / "ymo - КОГДА ВЫПАЛ АВТОМАТ!!!.mp3", None),
    "bo_chad": (DL / "- - JACKPHONK.mp3", None),
    "bo_chad2": (DL / "tranzipone - включите мужику с завода фонк из альта.mp3", None),
    "bo_klas": (DL / "1.Kla$ - DOOMины дети.mp3", None),
    "bo_klas4": (DL / "VØJ x ATSMXN x 1.Kla$ - 1.Kla$ ушел в разнос (Mashup by.xanax).mp3", None),
}


def source(spec):
    if isinstance(spec, Path):
        return spec
    hits = sorted(PREVIEW.glob(f"{spec} *.mp3"))
    return hits[0] if hits else None


def main():
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    credits = []
    for slot, (spec, credit) in SLOTS.items():
        src = source(spec)
        if not src or not src.exists() or src.stat().st_size < 10000:
            print("MISSING", slot, spec)
            continue
        if credit:
            title = src.stem.split(" - ", 1)[1] if " - " in src.stem else src.stem
            credits.append({"slot": slot, "title": title, "credit": credit})
        if only and slot not in only:
            continue
        dst = OUT / f"{slot}.mp3"
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-ar", "44100", "-ac", "2", "-b:a", "128k", str(dst)],
            check=True,
        )
        print(slot, f"{dst.stat().st_size // 1024} KB")
    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=1), encoding="utf-8")
    print("credits", len(credits))


if __name__ == "__main__":
    main()
