#!/usr/bin/env python3
"""Prints the GitHub release body for a version: its CHANGELOG.md section plus the install line.

Run: python3 tools/release_notes.py 0.7.2
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    version = sys.argv[1].lstrip("v")
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    m = re.search(rf"^## {re.escape(version)}\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    notes = m.group(1).strip() if m else "Bug fixes and improvements."
    print(notes)
    print()
    print("---")
    print("Install the `-setup.exe` (or the `.msi`). Installed copies of EDCH offer this update by themselves.")
    print()
    print("No installation wanted? Download the `-portable.exe` and run it from any folder. The portable version tells you when a new version is out and opens this page.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
