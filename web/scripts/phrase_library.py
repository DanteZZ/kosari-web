"""
Phrase library: cut every source recording of a character into separate
phrases with their text, through the models gate (pyannote + gigaam).

    MODELSGATE_KEY=... python scripts/phrase_library.py <sources dir> <out dir> [char ...] [--all-speakers]

Sources: <sources>/<char id>/<any audio or video file>  (one folder per
character: pocik, svidetel, pistoletov, kama, ded, pahom, mongol, ...).
For each file: audio → 16 kHz mono, diarization (who speaks when), word-level
transcription, words assigned to speakers; phrases end on . ! ? … a pause
over 1 s or a speaker change, and are 0.6–12 s long. By default only the
main speaker of a file (most speech) is kept — that is the character; others
(interviewer, crowd) are skipped unless --all-speakers.

Out: <out>/<char>/<file>_<nnn>.mp3 and <out>/index.json + index.csv
(char, file, text, start, end, speaker, path). Re-running skips files
already in the index.
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

GATE = os.environ.get("MODELSGATE_URL", "https://modelsgate.eap.zebrains.team/v1")
KEY = os.environ.get("MODELSGATE_KEY", "")
MEDIA = {".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".mp4", ".mkv", ".webm", ".mov", ".avi"}
PAUSE = 1.0
MIN_LEN, MAX_LEN = 0.6, 12.0
PAD = 0.12


def post_file(path, fields, wav: Path):
    b = "----kosari"
    body = b""
    for k, v in fields:
        body += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\n"
             f"Content-Type: audio/wav\r\n\r\n").encode() + wav.read_bytes() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(f"{GATE}{path}", data=body,
                                 headers={"Authorization": f"Bearer {KEY}", "content-type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=1800) as r:
        return json.loads(r.read())


def ffmpeg(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def speaker_at(segs, t0, t1):
    """Speaker with the largest overlap with [t0, t1]."""
    best, ov = None, 0.0
    for s in segs:
        o = min(t1, s["end"]) - max(t0, s["start"])
        if o > ov:
            best, ov = s["speaker"], o
    return best


def phrases(words, segs):
    out, cur = [], []

    def flush():
        if cur:
            out.append(cur[:])
            cur.clear()

    for w in words:
        w["speaker"] = speaker_at(segs, w["start"], w["end"]) or "SPEAKER_00"
        if cur and (w["start"] - cur[-1]["end"] > PAUSE or w["speaker"] != cur[-1]["speaker"]
                    or w["end"] - cur[0]["start"] > MAX_LEN):
            flush()
        cur.append(w)
        if re.search(r"[.!?…]$", w["word"]):
            flush()
    flush()
    res = []
    for ph in out:
        t0, t1 = ph[0]["start"], ph[-1]["end"]
        if t1 - t0 < MIN_LEN:
            continue
        res.append({"text": " ".join(x["word"] for x in ph), "start": round(t0, 2), "end": round(t1, 2), "speaker": ph[0]["speaker"]})
    return res


def slug(text, n=40):
    s = re.sub(r"[^\wа-яё]+", "_", text.lower(), flags=re.I).strip("_")
    return s[:n].rstrip("_") or "phrase"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources")
    ap.add_argument("out")
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--all-speakers", action="store_true")
    a = ap.parse_args()
    if not KEY:
        sys.exit("set MODELSGATE_KEY")
    src, out = Path(a.sources), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    idx_path = out / "index.json"
    index = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else []
    done = {(r["char"], r["file"]) for r in index}

    for cdir in sorted(p for p in src.iterdir() if p.is_dir()):
        char = cdir.name
        if a.chars and char not in a.chars:
            continue
        for f in sorted(p for p in cdir.rglob("*") if p.suffix.lower() in MEDIA):
            if (char, f.name) in done:
                continue
            print(char, f.name)
            tmp = Path(tempfile.mkdtemp())
            wav = tmp / "a.wav"
            ffmpeg("-i", str(f), "-vn", "-ac", "1", "-ar", "16000", str(wav))
            dia = post_file("/audio/diarizations", [("model", "pyannote")], wav)
            tr = post_file("/audio/transcriptions", [("model", "gigaam"), ("response_format", "verbose_json"),
                                                      ("timestamp_granularities[]", "word")], wav)
            segs = dia.get("segments", [])
            talk = {}
            for s in segs:
                talk[s["speaker"]] = talk.get(s["speaker"], 0) + s["end"] - s["start"]
            main_spk = max(talk, key=talk.get) if talk else None
            phs = phrases(tr.get("words", []), segs)
            cdst = out / char
            cdst.mkdir(exist_ok=True)
            n = 0
            for ph in phs:
                if not a.all_speakers and main_spk and ph["speaker"] != main_spk:
                    continue
                n += 1
                name = f"{f.stem}_{n:03d}_{slug(ph['text'])}.mp3"
                ffmpeg("-ss", str(max(0, ph["start"] - PAD)), "-to", str(ph["end"] + PAD), "-i", str(f), "-vn",
                       "-ac", "1", "-ar", "44100", "-af", "afade=t=in:d=0.03,areverse,afade=t=in:d=0.05,areverse",
                       "-b:a", "160k", str(cdst / name))
                index.append({"char": char, "file": f.name, **ph, "main": ph["speaker"] == main_spk,
                              "path": f"{char}/{name}"})
            print(f"  {n} phrases ({len(talk)} speakers, main {main_spk})")
            idx_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    with open(out / "index.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["char", "file", "text", "start", "end", "speaker", "main", "path"], delimiter=";")
        w.writeheader()
        w.writerows(index)
    print("index:", len(index), "phrases")


if __name__ == "__main__":
    main()
