#!/usr/bin/env python3
"""Builds public/locales/game.<lang>.json: the game's own names (materials, modules, blueprints,
effects, trader lines…) as they appear in the localized game.

Sources, in order of priority:
  1. tools/game_terms_*.txt — "en ¦ fr ¦ de ¦ es ¦ pt ¦ ru", an empty cell defers to the next source
  2. tools/sources/edengineer/localization.json — EDEngineer's translations (MIT, see NOTICE)

Pass --refresh <path to EDEngineer's Resources/Data/localization.json> to re-import that file;
it is not strict JSON, so it is read line by line and only the terms EDCH uses are kept.

Run: python3 tools/gen_game_locales.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["fr", "de", "es", "pt", "ru"]
EDE = ROOT / "tools" / "sources" / "edengineer" / "localization.json"


def game_terms() -> set[str]:
    g = json.loads((ROOT / "public" / "data" / "game.json").read_text(encoding="utf-8"))
    engineers = {e["name"] for e in g["engineers"]}
    names: set[str] = set()
    for m in g["materials"]:
        names.add(m["name"])
        names.add(m["category"])
        names.update(m.get("origins") or [])
    for b in g["blueprints"]:
        names.add(b["module"])
        if b["name"] not in engineers:
            names.add(b["name"])
        for e in b.get("effects") or []:
            names.add(e["label"])
    names.update(g["lines"].values())
    for e in g["engineers"]:
        names.update(s["name"] for s in e["specialities"])
    return {n for n in names if n and n not in engineers}


def read_edengineer_raw(path: Path) -> dict[str, dict[str, str]]:
    lines = path.read_text(encoding="utf-8-sig").split("\n")
    start = next(i for i, l in enumerate(lines) if '"Translations"' in l)
    out: dict[str, dict[str, str]] = {}
    cur = None
    for l in lines[start + 1 :]:
        m = re.match(r'^    "(.*)": \{\s*$', l)
        if m:
            cur = m.group(1)
            out[cur] = {}
            continue
        m = re.match(r'^      "([a-z]{2})": (null|"(.*?)")\s*:?\s*,?\s*$', l)
        if m and cur is not None and m.group(3):
            try:
                out[cur][m.group(1)] = json.loads(f'"{m.group(3)}"')
            except json.JSONDecodeError:
                out[cur][m.group(1)] = m.group(3)
    return out


def main() -> int:
    terms = game_terms()
    if len(sys.argv) == 3 and sys.argv[1] == "--refresh":
        raw = read_edengineer_raw(Path(sys.argv[2]))
        lower = {t.lower() for t in terms}
        kept = {k: {l: v for l, v in e.items() if l in LANGS and v} for k, e in raw.items() if k.lower() in lower}
        EDE.write_text(json.dumps(kept, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"kept {len(kept)} EDEngineer entries")

    ede = {k.lower(): v for k, v in json.loads(EDE.read_text(encoding="utf-8")).items()}
    ours: dict[str, dict[str, str]] = {}
    errors = 0
    for path in sorted((ROOT / "tools").glob("game_terms_*.txt")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            cols = [c.strip() for c in line.split("¦")]
            if len(cols) != 1 + len(LANGS):
                print(f"{path.name}:{n}: expected {1 + len(LANGS)} columns, got {len(cols)}")
                errors += 1
                continue
            entry = ours.setdefault(cols[0].lower(), {})
            entry.update({l: t for l, t in zip(LANGS, cols[1:]) if t})

    target = ROOT / "public" / "locales"
    missing = {l: [] for l in LANGS}
    for lang in LANGS:
        out = {}
        for term in sorted(terms):
            k = term.lower()
            text = ours.get(k, {}).get(lang) or ede.get(k, {}).get(lang)
            if text:
                text = re.sub(r"\s+", " ", text).strip()
                if text != term:
                    out[term] = text
            else:
                missing[lang].append(term)
        (target / f"game.{lang}.json").write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True) + "\n", encoding="utf-8")
        print(f"game.{lang}.json: {len(out)} names, {len(missing[lang])} left in English")
    if "-v" in sys.argv:
        for lang, ms in missing.items():
            print(lang, ms)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
