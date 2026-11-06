// Imports a ship build (EDSY / Coriolis export, SLEF or a journal Loadout) into the wishlist:
// every engineered module becomes "blueprint G1 → its grade", plus its experimental effect.

import type { Game } from "../../game/data.js";
import { bpKey, type WishItem } from "../../state/store.js";
import type { Blueprint } from "../../game/types.js";

type Json = Record<string, any>;

/** Journal item symbol → blueprint module name (most specific prefix first). */
const ITEM_MODULE: [RegExp, string][] = [
  [/_armour_/, "Armour"],
  [/^hpt_multicannon/, "Multi-cannon"],
  [/^hpt_pulselaserburst/, "Burst Laser"],
  [/^hpt_pulselaser/, "Pulse Laser"],
  [/^hpt_beamlaser/, "Beam Laser"],
  [/^hpt_cannon/, "Cannon"],
  [/^hpt_slugshot/, "Fragment Cannon"],
  [/^hpt_railgun/, "Rail Gun"],
  [/^hpt_plasmaaccelerator/, "Plasma Accelerator"],
  [/^hpt_(dumbfiremissilerack|basicmissilerack|drunkmissilerack)/, "Missile Rack"],
  [/^hpt_minelauncher/, "Mine Launcher"],
  [/^hpt_advancedtorppylon/, "Torpedo Pylon"],
  [/^hpt_shieldbooster/, "Shield Booster"],
  [/^hpt_chafflauncher/, "Chaff Launcher"],
  [/^hpt_heatsinklauncher/, "Heat Sink Launcher"],
  [/^hpt_electroniccountermeasure/, "Electronic Countermeasure"],
  [/^hpt_plasmapointdefence/, "Point Defence"],
  [/^hpt_cloudscanner/, "Wake Scanner"],
  [/^hpt_cargoscanner/, "Manifest Scanner"],
  [/^hpt_crimescanner/, "Kill Warrant Scanner"],
  [/^int_hyperdrive/, "Frame Shift Drive"],
  [/^int_engine/, "Thrusters"],
  [/^int_powerplant/, "Power Plant"],
  [/^int_powerdistributor/, "Power Distributor"],
  [/^int_lifesupport/, "Life Support"],
  [/^int_sensors/, "Sensors"],
  [/^int_shieldgenerator/, "Shield Generator"],
  [/^int_shieldcellbank/, "Shield Cell Bank"],
  [/^int_hullreinforcement/, "Hull Reinforcement Package"],
  [/^int_fuelscoop/, "Fuel Scoop"],
  [/^int_refinery/, "Refinery"],
  [/^int_repairer/, "Auto Field-Maintenance Unit"],
  [/^int_fsdinterdictor/, "Frame Shift Drive Interdictor"],
  [/^int_detailedsurfacescanner/, "Surface Scanner"],
  [/^int_dronecontrol_collection/, "Collector Limpet Controller"],
  [/^int_dronecontrol_fueltransfer/, "Fuel Transfer Limpet Controller"],
  [/^int_dronecontrol_prospector/, "Prospector Limpet Controller"],
  [/^int_dronecontrol_resourcesiphon/, "Hatch Breaker Limpet Controller"],
];

/** The blueprint module name of a journal item ("hpt_beamlaser_fixed_medium" → "Beam Laser"). */
export const moduleOf = (item: string) => ITEM_MODULE.find(([re]) => re.test(item.toLowerCase()))?.[1];

/** Finds the loadout in any of the formats people paste. */
export function extractLoadout(text: string): Json | null {
  let data: any;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return null;
  }
  const candidates: any[] = Array.isArray(data) ? data : [data];
  for (const c of candidates) {
    const l = c?.data ?? c; // SLEF wraps the Loadout in { header, data }
    if (l && Array.isArray(l.Modules)) return l;
  }
  return null;
}

export interface ImportResult {
  items: WishItem[];
  ship: string;
  skipped: string[];
}

function pick(game: Game, kind: "modification" | "experimental", symbol: string, module?: string): Blueprint[] {
  const all = game.data.blueprints.filter((b) => b.kind === kind && b.symbols?.includes(symbol));
  const own = module ? all.filter((b) => b.module.toLowerCase() === module.toLowerCase()) : [];
  return own.length ? own : all;
}

export function importLoadout(game: Game, loadout: Json): ImportResult {
  const counts = new Map<string, { bp: Blueprint; from: number; to: number; count: number }>();
  const skipped: string[] = [];
  const add = (bp: Blueprint, from: number, to: number) => {
    const key = `${bpKey(bp)}|${from}|${to}`;
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { bp, from, to, count: 1 });
  };

  for (const m of loadout.Modules as Json[]) {
    const eng = m.Engineering;
    if (!eng) continue;
    const item = String(m.Item ?? "").toLowerCase();
    const module = moduleOf(item);
    const symbol = String(eng.BlueprintName ?? "").toLowerCase();
    const level = Math.max(1, Math.min(5, Number(eng.Level ?? 1)));
    const grades = pick(game, "modification", symbol, module);
    if (grades.length) {
      const top =
        grades.filter((g) => (g.grade ?? 0) <= level).sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0))[0] ?? grades[0];
      add(top, 1, Math.min(level, top.grade ?? level));
    } else {
      skipped.push(`${m.Slot}: ${eng.BlueprintName}`);
    }
    if (eng.ExperimentalEffect) {
      const exp = pick(game, "experimental", String(eng.ExperimentalEffect).toLowerCase(), module)[0];
      if (exp) add(exp, 0, 0);
      else skipped.push(`${m.Slot}: ${eng.ExperimentalEffect}`);
    }
  }

  const stamp = Date.now().toString(36);
  const items: WishItem[] = [...counts.values()].map((c, i) => ({
    id: `${stamp}${i}`,
    bp: bpKey(c.bp),
    gradeFrom: c.from,
    gradeTo: c.to,
    rolls: {},
    count: c.count,
    note: loadout.ShipName || loadout.Ship,
  }));
  return {
    items,
    ship: [loadout.Ship, loadout.ShipName].filter(Boolean).join(" « ") + (loadout.ShipName ? " »" : ""),
    skipped,
  };
}
