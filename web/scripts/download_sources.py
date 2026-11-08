"""
Download the source recordings for the phrase library (audio only).

    pip install -U yt-dlp
    python scripts/download_sources.py [scripts/sources.txt] [sources dir] [char ...]

Reads sources.txt («char | URL or search query | N»), saves audio as
<sources>/<char>/<title> [<id>].m4a. A download archive (<sources>/.archive)
skips what is already there, so it can be re-run after editing the list.
Videos longer than MAX_MIN minutes are skipped (whole streams are too long
to diarize usefully — cut a clip and drop it into the folder by hand).
Then:  python scripts/phrase_library.py <sources dir> <phrases dir>
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_MIN = 40


def parse(path):
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        char, what = parts[0], parts[1]
        n = int(parts[2]) if len(parts) > 2 and parts[2] else 3
        yield char, what, n


def main():
    args = sys.argv[1:]
    lst = Path(args[0]) if args and args[0].endswith(".txt") else HERE / "sources.txt"
    rest = args[1:] if args and args[0].endswith(".txt") else args
    out = Path(rest[0]) if rest else HERE.parent / "sources"
    only = set(rest[1:])
    out.mkdir(parents=True, exist_ok=True)
    for char, what, n in parse(lst):
        if only and char not in only:
            continue
        target = what if what.startswith("http") else f"ytsearch{n}:{what}"
        print(f"== {char}: {what}")
        subprocess.run([
            sys.executable, "-m", "yt_dlp", target,
            "-f", "bestaudio[ext=m4a]/bestaudio",
            "--match-filter", f"duration < {MAX_MIN * 60} & !is_live",
            "--download-archive", str(out / ".archive"),
            "--no-playlist", "--ignore-errors", "--windows-filenames",
            "-o", str(out / char / "%(title).80s [%(id)s].%(ext)s"),
        ])


if __name__ == "__main__":
    main()
