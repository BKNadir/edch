#!/usr/bin/env python3
"""Builds public/data/exobio.json: exobiology species, values, colony distances and the planet
conditions they grow on, plus the journal symbols that name them.

Sources (see NOTICE):
  tools/sources/d47/Exobiology.tsv — species, genus, Vista Genomics value, colony distance and
    condition ranges (dseelinger/d47, MIT; values and ranges from Spansh's surveyed landmarks)
  tools/sources/edr/biology.json — journal symbols of species and genera (lekeno/edr, Apache-2.0)

Run: python3 tools/gen_exobio.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "sources"

# Journal genus symbol (lower case) -> genus as Exobiology.tsv spells it.
GENUS_SYMBOLS = {
    "$codex_ent_aleoids_genus_name;": "Aleoida",
    "$codex_ent_sphere_genus_name;": "Anemone",
    "$codex_ent_bacterial_genus_name;": "Bacterium",
    "$codex_ent_cone_genus_name;": "Bark Mounds",
    "$codex_ent_seed_genus_name;": "Brain Tree",
    "$codex_ent_cactoid_genus_name;": "Cactoida",
    "$codex_ent_clypeus_genus_name;": "Clypeus",
    "$codex_ent_conchas_genus_name;": "Concha",
    "$codex_ent_electricae_genus_name;": "Electricae",
    "$codex_ent_fonticulus_genus_name;": "Fonticulua",
    "$codex_ent_shrubs_genus_name;": "Frutexa",
    "$codex_ent_fumerolas_genus_name;": "Fumerola",
    "$codex_ent_fungoids_genus_name;": "Fungoida",
    "$codex_ent_osseus_genus_name;": "Osseus",
    "$codex_ent_recepta_genus_name;": "Recepta",
    "$codex_ent_tube_genus_name;": "Tubers",
    "$codex_ent_stratum_genus_name;": "Stratum",
    "$codex_ent_tubus_genus_name;": "Tubus",
    "$codex_ent_tussocks_genus_name;": "Tussock",
    "$codex_ent_ground_struct_ice_name;": "Shards",
    "$codex_ent_ingensradices_genus_name;": "Radicoida",
    "$codex_ent_vents_name;": "Amphora Plant",
}

# EDR spellings that differ from Exobiology.tsv.
SPELLING = {"Bacterium Tela ": "Bacterium Tela", "Radicoida Unicus": "Radicoida Unica"}


def main() -> int:
    rows = [l.rstrip("\n").split("\t") for l in (SRC / "d47" / "Exobiology.tsv").read_text(encoding="utf-8").splitlines() if l and not l.startswith("#")]
    head, body = rows[0], rows[1:]
    col = {name: i for i, name in enumerate(head)}
    species = []
    genera: dict[str, int] = {}
    for r in body:
        split = lambda c: [x for x in r[col[c]].split(";") if x]
        num = lambda c: round(float(r[col[c]]), 6)
        genera[r[col["genus"]]] = int(r[col["colony_distance"]])
        species.append({
            "n": r[col["species"]], "g": r[col["genus"]], "v": int(r[col["value"]]),
            "pt": split("planet_types"), "at": split("atmospheres"), "vo": split("volcanism"),
            "gl": num("gravity_low"), "gh": num("gravity_high"),
            "tl": num("temperature_low"), "th": num("temperature_high"),
            "pl": num("pressure_low"), "ph": num("pressure_high"),
        })
    names = {s["n"] for s in species}
    edr = json.loads((SRC / "edr" / "biology.json").read_text(encoding="utf-8"))
    symbols = {}
    for sym, info in edr["species"].items():
        name = SPELLING.get(info["name"], info["name"]).strip()
        if name in names:
            symbols[sym.lower()] = name
    out = {"genera": genera, "genusSymbols": GENUS_SYMBOLS, "symbols": symbols, "species": sorted(species, key=lambda s: s["n"])}
    target = ROOT / "public" / "data" / "exobio.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(species)} species, {len(genera)} genera, {len(symbols)} journal symbols -> {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")
    missing = sorted(set(GENUS_SYMBOLS.values()) - set(genera))
    if missing:
        print("genera without species:", missing)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
