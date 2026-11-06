#!/usr/bin/env python3
"""Build public/data/*.json from the vendored community tables.

Sources (see tools/sources/d47/LICENSE and README "Credits"):
  - Directive 47 (dseelinger/d47, MIT) generated tables, themselves built from
    msarilar/EDEngineer (MIT), EDCD/FDevIDs and EDCD/coriolis-data.
Game data remains the property of Frontier Developments plc and is used under
the Elite Dangerous media usage rules for non-commercial community tools.

Run:  python3 tools/gen_data.py
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "sources" / "d47"
OUT = ROOT / "public" / "data"

csv.field_size_limit(sys.maxsize)


def read_tsv(name: str) -> list[dict[str, str]]:
    lines = [l for l in (SRC / name).read_text(encoding="utf-8").splitlines() if not l.startswith("#")]
    return list(csv.DictReader(lines, delimiter="\t", quoting=csv.QUOTE_NONE))


def split(value: str, sep: str = ";") -> list[str]:
    return [v.strip() for v in (value or "").split(sep) if v.strip()]


# Trader lines -> human names (the material trader grid columns).
LINE_NAMES = {
    "raw-1": "Raw 1 (Carbon…)", "raw-2": "Raw 2 (Phosphorus…)", "raw-3": "Raw 3 (Sulphur…)",
    "raw-4": "Raw 4 (Iron…)", "raw-5": "Raw 5 (Nickel…)", "raw-6": "Raw 6 (Rhenium…)", "raw-7": "Raw 7 (Lead…)",
    "manufactured-alloys": "Alloys", "manufactured-capacitors": "Capacitors",
    "manufactured-chemical": "Chemical", "manufactured-composite": "Composite",
    "manufactured-conductive": "Conductive", "manufactured-crystals": "Crystals",
    "manufactured-heat": "Heat", "manufactured-mechanical-components": "Mechanical components",
    "manufactured-shielding": "Shielding", "manufactured-thermic": "Thermic",
    "encoded-data-archives": "Data archives", "encoded-emission-data": "Emission data",
    "encoded-encryption-files": "Encryption files", "encoded-firmware": "Firmware",
    "encoded-shield-data": "Shield data", "encoded-wake-scans": "Wake scans",
}


def materials() -> list[dict]:
    out = []
    for r in read_tsv("Materials.tsv"):
        ledger = r["ledger"]
        if ledger not in ("material", "ship-locker"):
            continue
        item = {
            "id": r["symbol"].lower(),
            "name": r["name"],
            "ledger": "ship" if ledger == "material" else "locker",
            "category": r["category"],  # Raw/Manufactured/Encoded or Item/Component/Data/Consumable
            "origins": split(r["origins"]),
            "methods": split(r["methods"]),
        }
        if r["grade"]:
            item["grade"] = int(r["grade"])
        if r["line"]:
            item["line"] = r["line"]
        for key in ("settlements", "buildings", "containers"):
            if r.get(key):
                item[key] = split(r[key])
        if r.get("barter"):
            item["barter"] = r["barter"]
        out.append(item)
    out.sort(key=lambda m: (m["ledger"], m["category"], m.get("line", ""), m.get("grade", 0), m["name"]))
    return out


# Corrections to the vendored tables, checked in game: (engineer, module) -> highest grade.
# Lori Jameson: Life Support G4, not G5 (in game, and https://wiki.alioth.net/index.php/Elite_4/Engineers).
GRADE_FIXES: dict[tuple[str, str], int] = {
    ("Lori Jameson", "Life Support"): 4,
}
# Modules missing from the vendored tables: (engineer, module) -> highest grade.
# Juri Ishmaak: the three scanners up to G3 (wiki.alioth.net and elite-dangerous.fandom.com).
GRADE_ADDS: dict[tuple[str, str], int] = {
    ("Juri Ishmaak", "Manifest Scanner"): 3,
    ("Juri Ishmaak", "Wake Scanner"): 3,
    ("Juri Ishmaak", "Kill Warrant Scanner"): 3,
}


def blueprints(known: set[str]) -> list[dict]:
    out = []
    missing: set[str] = set()
    for r in read_tsv("Blueprints.tsv"):
        if r["kind"] in ("[disputed]", "[mtypes]") or not r["kind"] or r["kind"].startswith("["):
            continue
        if r["kind"] not in {"modification", "experimental", "synthesis", "tech-broker", "suit", "weapon",
                             "merchant", "unlock", "bartender"}:
            continue
        ingredients = {}
        for part in split(r["ingredients"], ","):
            sym, _, qty = part.partition("*")
            sym = sym.strip().lower()
            if sym not in known:
                missing.add(sym)
            ingredients[sym] = int(qty or 1)
        effects = []
        for e in split(r["effects"]):
            bits = e.split("|")
            if len(bits) >= 2:
                effects.append({"label": bits[0], "value": bits[1], "good": (bits[2] if len(bits) > 2 else "good") == "good"})
        bp = {
            "kind": r["kind"],
            "module": r["module"],
            "name": r["name"],
            "ingredients": ingredients,
        }
        if r["grade"]:
            bp["grade"] = int(r["grade"])
        if r["engineers"]:
            bp["engineers"] = [
                e for e in split(r["engineers"], ",")
                if not (bp.get("grade") and bp["grade"] > GRADE_FIXES.get((e, r["module"]), 99))
            ]
        if r["kind"] == "modification" and bp.get("grade"):
            for (name, module), top in GRADE_ADDS.items():
                if module == r["module"] and bp["grade"] <= top and name not in bp.setdefault("engineers", []):
                    bp["engineers"].append(name)
        if r.get("symbol"):
            bp["symbols"] = [x.lower() for x in split(r["symbol"], ",")]
        if effects:
            bp["effects"] = effects
        out.append(bp)
    if missing:
        print(f"note: {len(missing)} ingredient symbols are commodities/unknown: {sorted(missing)[:12]}…")
    return out


def engineers() -> list[dict]:
    out = []
    for r in read_tsv("Engineers.tsv"):
        specs = []
        for s in split(r["specialities"], ","):
            name, _, grade = s.rpartition(":")
            value = int(grade) if grade.isdigit() else 0
            specs.append({"name": name, "grade": min(value, GRADE_FIXES.get((r["name"], name), value))})
        for (name, module), top in GRADE_ADDS.items():
            if name == r["name"] and not any(sp["name"] == module for sp in specs):
                specs.append({"name": module, "grade": top})
        out.append({
            "id": int(r["id"]),
            "name": r["name"],
            "system": r["system"],
            "station": r["station"],
            "body": r.get("body", ""),
            "pos": [float(r["x"]), float(r["y"]), float(r["z"])] if r.get("x") else None,
            "odyssey": int(r["id"]) >= 400000,
            "specialities": specs,
            "discovery": r.get("discovery", ""),
            "meeting": r.get("meeting", ""),
            "unlock": r.get("unlock", ""),
            "referredBy": r.get("referred_by", ""),
            "referralGrade": int(r["referral_grade"]) if r.get("referral_grade", "").isdigit() else None,
            "tribute": r.get("tribute", ""),
            "meetingTest": r.get("meeting_test", ""),
            "unlockTest": r.get("unlock_test", ""),
        })
    out.sort(key=lambda e: e["name"])
    return out


# Fixed farming sites (community-known, positions from d47 FarmingSites.cs, MIT).
FIXED_SITES = [
    {"system": "HIP 12099", "pos": [-101.90625, -95.46875, -165.59375], "body": "1 B", "what": "Jameson Crash Site — relog to respawn",
     "materials": ["shieldpatternanalysis", "adaptiveencryptors", "bulkscandata", "decodedemissiondata", "shielddensityreports", "shieldfrequencydata", "encodedscandata", "classifiedscandata", "fsdtelemetry", "consumerfirmware", "industrialfirmware", "securityfirmware", "embeddedfirmware"],
     "lat": -54.36, "lon": -50.34},
    {"system": "Hyades Sector DR-V c2-23", "pos": [-104.625, -0.8125, -151.90625], "body": "A 5", "what": "Dav's Hope — relog to respawn",
     "materials": ["mechanicalscrap", "mechanicalequipment", "mechanicalcomponents", "configurablecomponents", "chemicalprocessors", "chemicaldistillery", "chemicalmanipulators", "heatconductionwiring", "heatexchangers", "hybridcapacitors", "compactcomposites", "conductivecomponents", "electrochemicalarrays", "galvanisingalloys", "focuscrystals", "heatdispersionplate", "uncutfocuscrystals"],
     "lat": 50.52, "lon": 137.48},
    {"system": "HIP 17403", "pos": [-93.6875, -158.96875, -367.625], "body": "A 4 A", "what": "Crashed Thargoid ship",
     "materials": ["unknownenergysource", "unknowncarapace", "unknowntechnologycomponents", "tg_shipflightdata", "tg_shipsystemsdata"],
     "lat": -7.3362, "lon": -6.2770},
    {"system": "HR 3230", "pos": [394.15625, 19.25, -152.375], "body": "3 A A", "what": "Brain trees",
     "materials": ["selenium", "polonium", "ruthenium", "tellurium", "technetium", "yttrium", "antimony"], "lat": 45.66, "lon": -30.49},
    {"system": "HIP 36601", "pos": [337.8125, 562.96875, -1457.84375], "body": "C 1 A", "what": "Crystalline shards (Polonium)", "materials": ["polonium"], "lat": -57.4599, "lon": 126.9543},
    {"system": "HIP 36601", "pos": [337.8125, 562.96875, -1457.84375], "body": "C 1 D", "what": "Crystalline shards (Ruthenium)", "materials": ["ruthenium"], "lat": -51.2639, "lon": 14.7291},
    {"system": "HIP 36601", "pos": [337.8125, 562.96875, -1457.84375], "body": "C 3 B", "what": "Crystalline shards (Tellurium)", "materials": ["tellurium"], "lat": -17.6769, "lon": -55.18},
    {"system": "HIP 36601", "pos": [337.8125, 562.96875, -1457.84375], "body": "C 5 A", "what": "Crystalline shards (Technetium)", "materials": ["technetium"], "lat": 3.55, "lon": 111.5415},
    {"system": "Outotz LS-K d8-3", "pos": [526.3125, 238.46875, -1613.75], "body": "B 5 A", "what": "Crystalline shards (Yttrium)", "materials": ["yttrium"], "lat": -1.9216, "lon": -145.7013},
    {"system": "Outotz LS-K d8-3", "pos": [526.3125, 238.46875, -1613.75], "body": "B 5 C", "what": "Crystalline shards (Antimony)", "materials": ["antimony"], "lat": -62.4905, "lon": 80.2426},
]


def commodities() -> list[dict]:
    out = []
    for r in read_tsv("Materials.tsv"):
        if r["ledger"] in ("cargo", "rare-cargo"):
            out.append({"id": r["symbol"].lower(), "name": r["name"], "category": r["category"], "rare": r["ledger"] == "rare-cargo"})
    out.sort(key=lambda c: c["name"])
    return out


def outfitting_lists() -> tuple[list[str], list[str], dict]:
    import re
    text = (SRC / "OutfittingCatalogue.cs").read_text(encoding="utf-8")
    def block(name: str) -> str:
        m = re.search(name + r" \{ get; \} =\s*\[(.*?)\];", text, re.S)
        return m.group(1) if m else ""
    ships = re.findall(r'"([^"]+)"', block("Ships"))
    modules = re.findall(r'"([^"]+)"', block("Modules"))
    others = {}
    m = re.search(r"OtherNames \{ get; \} =.*?\{(.*?)\};", text, re.S)
    if m:
        for key, vals in re.findall(r'\["([^"]+)"\] = \[([^\]]*)\]', m.group(1)):
            others[key] = re.findall(r'"([^"]+)"', vals)
    return ships, modules, others


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    mats = materials()
    known = {m["id"] for m in mats}
    bps = blueprints(known)
    engs = engineers()
    for site in FIXED_SITES:
        site["materials"] = [m for m in site["materials"] if m in known]
    ships, modules, other_names = outfitting_lists()
    payload = {
        "commodities": commodities(),
        "ships": ships,
        "modules": modules,
        "moduleAliases": other_names,
        "materials": mats,
        "lines": LINE_NAMES,
        "blueprints": bps,
        "engineers": engs,
        "sites": FIXED_SITES,
        "credits": "Data: EDCD/FDevIDs, msarilar/EDEngineer (MIT) via dseelinger/d47 (MIT). Game data © Frontier Developments plc.",
    }
    (OUT / "game.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"materials={len(mats)} blueprints={len(bps)} engineers={len(engs)} sites={len(FIXED_SITES)} "
          f"commodities={len(payload['commodities'])} ships={len(ships)} modules={len(modules)}")


if __name__ == "__main__":
    main()
