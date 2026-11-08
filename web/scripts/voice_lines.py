"""
Character voice lines for the game, picked from the phrase library.

    python scripts/voice_lines.py [phrases dir]

PICKS: per character, per event — phrase numbers in phrases/<char>/<char>_NNN_*.mp3.
Events: spawn (enters the fight), intro (boss card), attack, hurt, down
(knocked down), death, pickup (hero grabs косари), special (hero's rage move).
A number listed twice is picked twice as often. Each clip is loudness-
normalised and written to public/remake/assets/voice/chars/<char>/<event>_<i>.mp3;
three short syllables per character go to blip_<i>.mp3 (the typed dialogue
sound). The list of what exists goes to src/remake/brawl/voices.gen.json.
"""
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "remake" / "assets" / "voice" / "chars"
INDEX = ROOT / "src" / "remake" / "brawl" / "voices.gen.json"

PICKS = {
    # ---- heroes
    "pocik": {"spawn": [4], "attack": [6, 7, 3], "hurt": [8], "down": [2], "death": [5], "pickup": [1], "special": [3]},
    # Кама's «Ш-ш-ш!» — his signature: on the rage move always, often on hits
    "kama": {"spawn": [9, 1, 3, 25], "attack": [9, 9, 17, 27, 19], "hurt": [20, 21], "down": [9], "death": [26], "pickup": [14], "special": [9]},
    "pistoletov": {"spawn": [2], "attack": [13, 17, 30], "hurt": [15], "down": [22], "death": [4], "pickup": [12], "special": [2]},
    # ---- original cast
    "nikita": {"spawn": [8], "attack": [4, 5], "hurt": [2], "death": [6]},
    "buiniy": {"spawn": [18], "attack": [1, 8, 16], "hurt": [3], "down": [15], "death": [9]},
    "borsch": {"intro": [1], "attack": [7, 11, 5], "hurt": [8], "death": [15, 16]},
    "povar": {"intro": [5], "attack": [8, 6, 11], "hurt": [10], "death": [4]},
    # ---- meme enemies
    "ded": {"spawn": [34, 14], "attack": [4, 18, 20, 21, 37, 22], "hurt": [9, 52, 47], "down": [35, 6], "death": [1, 75]},
    "mongol": {"spawn": [2], "attack": [1], "death": [9]},
    "ruki": {"spawn": [150], "attack": [1, 159], "hurt": [55], "death": [227]},
    "reka": {"spawn": [38, 5], "attack": [27, 48, 1], "hurt": [26], "down": [24], "death": [51]},
    "zubarev": {"spawn": [79, 78], "attack": [37, 30, 141, 148], "hurt": [34, 35, 140], "down": [177], "death": [54]},
    "gitelman": {"spawn": [1, 10], "attack": [25, 47, 53], "hurt": [46, 48], "down": [54, 52], "death": [76]},
    # ---- bosses
    "pahom": {"intro": [2], "attack": [17, 21, 29], "hurt": [22], "down": [1], "death": [32]},
    "papich": {"intro": [4, 3], "attack": [49, 31, 17], "hurt": [18, 71], "down": [20], "death": [58]},
    "ponasenkov": {"intro": [5], "attack": [6], "death": [1]},
    "klas": {"intro": [16], "attack": [42, 41, 60, 14], "hurt": [21], "down": [15], "death": [83]},
}
# Blips come from these phrases (clear, loud single words)
BLIP_FROM = {
    "pocik": 6, "kama": 1, "pistoletov": 13, "nikita": 8, "buiniy": 3, "borsch": 5, "povar": 11,
    "ded": 20, "mongol": 2, "ruki": 1, "reka": 5, "zubarev": 37, "gitelman": 25, "pahom": 2,
    "papich": 19, "ponasenkov": 6, "klas": 22,
}


def ff(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def find(src: Path, char: str, n: int) -> Path:
    hits = sorted((src / char).glob(f"{char}_{n:03d}_*.mp3"))
    if not hits:
        raise SystemExit(f"no phrase {char} #{n}")
    return hits[0]


def blips(clip: Path, dst_dir: Path, count=3, ms=110):
    """Loudest voiced windows of a word: short syllables for typed dialogue."""
    tmp = Path(tempfile.mkdtemp()) / "a.wav"
    ff("-i", str(clip), "-ac", "1", "-ar", "22050", str(tmp))
    w = wave.open(str(tmp))
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)
    sr = w.getframerate()
    win = int(sr * ms / 1000)
    hop = win // 4
    e = np.array([np.sqrt((x[i:i + win] ** 2).mean()) for i in range(0, max(1, len(x) - win), hop)])
    picked = []
    for i in np.argsort(-e):
        if all(abs(i - j) * hop > win for j in picked):
            picked.append(i)
        if len(picked) == count:
            break
    out = []
    for k, i in enumerate(sorted(picked)):
        t = i * hop / sr
        f = dst_dir / f"blip_{k}.mp3"
        ff("-ss", f"{t:.3f}", "-t", f"{ms / 1000:.3f}", "-i", str(tmp),
           "-af", "afade=t=in:d=0.012,afade=t=out:st=%.3f:d=0.03,loudnorm=I=-14:TP=-1.5" % (ms / 1000 - 0.03),
           "-ac", "1", "-ar", "22050", "-b:a", "64k", str(f))
        out.append(f.name)
    return out


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "phrases"
    OUT.mkdir(parents=True, exist_ok=True)
    index = {}
    for char, events in PICKS.items():
        d = OUT / char
        d.mkdir(exist_ok=True)
        for old in d.glob("*.mp3"):
            old.unlink()
        index[char] = {}
        for ev, nums in events.items():
            for i, n in enumerate(nums):
                ff("-i", str(find(src, char, n)), "-af", "loudnorm=I=-16:TP=-1.5,silenceremove=start_periods=1:start_threshold=-45dB",
                   "-ac", "1", "-ar", "44100", "-b:a", "96k", str(d / f"{ev}_{i}.mp3"))
            index[char][ev] = len(nums)
        if char in BLIP_FROM:
            index[char]["blip"] = len(blips(find(src, char, BLIP_FROM[char]), d))
        print(char, index[char])
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
