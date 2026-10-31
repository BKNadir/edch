#!/usr/bin/env python3
"""Builds public/locales/<lang>.json from tools/translations_*.txt.

Format: one entry per line, "fr ¦ en ¦ de ¦ es ¦ pt ¦ ru"; lines starting with # are comments.
Checks that every translation keeps the same {n} placeholders as the French text.

Run: python3 tools/gen_locales.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["en", "de", "es", "pt", "ru"]


def main() -> int:
    out = {lang: {} for lang in LANGS}
    errors = 0
    for path in sorted((ROOT / "tools").glob("translations_*.txt")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            cols = [c.strip() for c in line.split("¦")]
            if len(cols) != 1 + len(LANGS):
                print(f"{path.name}:{n}: expected {1 + len(LANGS)} columns, got {len(cols)}")
                errors += 1
                continue
            fr, *rest = cols
            want = sorted(re.findall(r"\{\d+\}", fr))
            for lang, text in zip(LANGS, rest):
                if sorted(re.findall(r"\{\d+\}", text)) != want:
                    print(f"{path.name}:{n}: {lang} placeholders differ: {text!r}")
                    errors += 1
                if fr in out[lang] and out[lang][fr] != text:
                    print(f"{path.name}:{n}: duplicate key {fr!r} with a different {lang} text")
                out[lang][fr] = text
    target = ROOT / "public" / "locales"
    target.mkdir(parents=True, exist_ok=True)
    for lang, entries in out.items():
        (target / f"{lang}.json").write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(out['en'])} entries x {len(LANGS)} languages, {errors} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
