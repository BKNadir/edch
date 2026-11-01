#!/usr/bin/env python3
"""Lists the French UI strings in src/ (string and template literals) for the translation
dictionaries. Template literals become patterns with {0}, {1}… placeholders.

Run: python3 tools/extract_strings.py > tools/strings.txt
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ["main.ts", "context.ts", "data.ts", "sources.ts", "spansh.ts", "uploaders.ts", "bridge.ts", "binds.ts", "live.ts", "notifier.ts", "time.ts", "wing.ts", "updater.ts", "remote.ts", "theme.ts", "logger.ts", "links.ts", "alerts.ts", "nav.ts", "desktop.ts", "dialog.ts", "changelog.ts", "miningSpots.ts"] + [
    f"views/{p.name}" for p in sorted((ROOT / "src" / "views").glob("*.ts"))
]
FRENCH = re.compile(r"[a-zàâçéèêëîïôûùüÿœ]{2,}", re.I)
ACCENT = re.compile(r"[àâçéèêëîïôûùüÿœÀÂÇÉÈÊËÎÏÔÛÙÜŸŒ«»]")
FR_WORDS = re.compile(r"\b(le|la|les|de|des|du|un|une|et|ou|pour|avec|sans|dans|sur|par|ton|ta|tes|ici|plus|pas|tous|tout|toute|aucun|aucune|est|sont|al|ls)\b", re.I)
CODE = re.compile(r"^([a-z][\w-]*([.#][\w-]+)*|https?://.*|[\w./:-]+|M[\d .\-a-zA-Z]+|[\[\]\\^$*+?(){}|]+.*)$")


def literals(src: str):
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            i = src.find("\n", i)
            i = n if i < 0 else i
            continue
        if src.startswith("/*", i):
            i = src.find("*/", i + 2) + 2
            continue
        if c in "\"'`":
            j, parts, buf, depth = i + 1, [], "", 0
            while j < n:
                d = src[j]
                if d == "\\":
                    buf += src[j:j + 2]
                    j += 2
                    continue
                if c == "`" and src.startswith("${", j):
                    k, level = j + 2, 1
                    while k < n and level:
                        level += {"{": 1, "}": -1}.get(src[k], 0)
                        k += 1
                    parts.append(buf)
                    buf = ""
                    parts.append(None)
                    j = k
                    continue
                if d == c:
                    break
                buf += d
                j += 1
            parts.append(buf)
            yield c, parts
            i = j + 1
            continue
        i += 1


def main():
    seen = []
    for f in FILES:
        src = (ROOT / "src" / f).read_text(encoding="utf-8")
        for quote, parts in literals(src):
            if quote == "'":
                continue
            idx = 0
            text = ""
            for p in parts:
                if p is None:
                    text += "{%d}" % idx
                    idx += 1
                else:
                    text += p
            text = text.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
            core = re.sub(r"\{\d+\}", "", text).strip()
            if not core or CODE.match(core) and not ACCENT.search(core):
                continue
            if not FRENCH.search(core):
                continue
            if not (ACCENT.search(core) or FR_WORDS.search(core) or (" " in core and re.match(r"^[A-ZÀ-Ý]", core)) or re.match(r"^[A-ZÀ-Ý][a-zà-ÿ]+$", core)):
                continue
            if text not in seen:
                seen.append(text)
    for s in seen:
        print(s.replace("\n", "\\n"))


if __name__ == "__main__":
    main()
