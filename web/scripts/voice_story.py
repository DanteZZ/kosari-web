"""
Voice the loading-screen narration (src/remake/story.js) with OmniVoice.

    MODELSGATE_KEY=... python scripts/voice_story.py --sample narrator.wav --sample-text "..." [map ...] [--force]

For every map: <map>_<hero>.mp3 for each hero paragraph and <map>_scene.mp3,
written to public/remake/assets/voice/story/. A paragraph is spoken sentence
group by sentence group (long inputs make the model drop words); every take is
transcribed back (gigaam) and redone if it has fillers («э-э»), missing words or
a cut-off last word. Existing files are kept unless --force.
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "remake" / "assets" / "voice" / "story"
GATE = os.environ.get("MODELSGATE_URL", "https://modelsgate.eap.zebrains.team/v1")
KEY = os.environ.get("MODELSGATE_KEY", "")
SPEED = 1.15
TRIES = 6
SR = 24000
# Spoken form of names the model cannot read
SAY = {"1Kla$": "Ван Клас"}


def _req(path, body, ctype):
    req = urllib.request.Request(f"{GATE}{path}", data=body, headers={"Authorization": f"Bearer {KEY}", "content-type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", ""), e.read()


def speak(text, sample_b64, sample_text):
    body = {"model": "omnivoice", "input": text, "voice_sample": sample_b64, "voice_sample_text": sample_text,
            "response_format": "wav", "speed": SPEED}
    code, ct, data = _req("/audio/speech", json.dumps(body, ensure_ascii=False).encode(), "application/json; charset=utf-8")
    if code != 200 or "json" in ct:
        raise RuntimeError(f"speech {code}: {data[:300]!r}")
    return data


def transcribe(wav: bytes):
    b = "----kosari"
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\ngigaam\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + wav + f"\r\n--{b}--\r\n".encode()
    code, _, data = _req("/audio/transcriptions", body, f"multipart/form-data; boundary={b}")
    return json.loads(data)["text"] if code == 200 else ""


def words(t):
    return re.sub(r"[^а-яё ]", " ", t.lower().replace("ё", "е")).split()


def good(wav, text):
    w, want = words(transcribe(wav)), words(text)
    if not want:
        return True
    filler = sum(1 for x in w if re.fullmatch(r"э+|эм+|мм+|аа+", x))
    tail = bool(w) and w[-1][:5] == want[-1][:5] and len(w[-1]) >= len(want[-1]) - 2
    # The recogniser writes numbers as digits: allow a couple of words of slack
    return filler == 0 and len(want) - 2 <= len(w) <= len(want) + 1 and tail


def chunks(text, limit=170):
    """Sentence groups of up to `limit` characters."""
    sents = re.findall(r"[^.!?…]+[.!?…»]*\s*", text)
    out, cur = [], ""
    for s in sents:
        if cur and len(cur) + len(s) > limit:
            out.append(cur.strip())
            cur = ""
        cur += s
    if cur.strip():
        out.append(cur.strip())
    return out


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def voice_paragraph(text, out, sample_b64, sample_text):
    for k, v in SAY.items():
        text = text.replace(k, v)
    tmp = Path(tempfile.mkdtemp())
    parts = []
    for i, c in enumerate(chunks(text)):
        wav = None
        for t in range(TRIES):
            wav = speak(c, sample_b64, sample_text)
            if good(wav, c):
                break
            print(f"    retry {i}.{t + 1}")
        f = tmp / f"c{i}.wav"
        f.write_bytes(wav)
        parts.append(f)
    sil = tmp / "sil.wav"
    ffmpeg("-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", "0.25", "-c:a", "pcm_s16le", str(sil))
    seq = []
    for i, f in enumerate(parts):
        if i:
            seq.append(sil)
        seq.append(f)
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{f.as_posix()}'\n" for f in seq), encoding="utf-8")
    ffmpeg("-f", "concat", "-safe", "0", "-i", str(lst), "-ar", str(SR), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "160k", str(out))


def load_story():
    js = (ROOT / "src" / "remake" / "story.js").as_uri()
    code = f"import('{js}').then(m => process.stdout.write(JSON.stringify(m.STORY)))"
    return json.loads(subprocess.run(["node", "-e", code], capture_output=True, check=True, encoding="utf-8").stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("maps", nargs="*")
    ap.add_argument("--sample", required=True)
    ap.add_argument("--sample-text", required=True)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if not KEY:
        sys.exit("set MODELSGATE_KEY")
    sample_b64 = base64.b64encode(Path(a.sample).read_bytes()).decode()
    OUT.mkdir(parents=True, exist_ok=True)
    story = load_story()
    for mid, paras in story.items():
        if a.maps and mid not in a.maps:
            continue
        for who, text in paras.items():
            out = OUT / f"{mid}_{who}.mp3"
            if out.exists() and not a.force:
                continue
            print(mid, who)
            voice_paragraph(text, out, sample_b64, a.sample_text)


if __name__ == "__main__":
    main()
