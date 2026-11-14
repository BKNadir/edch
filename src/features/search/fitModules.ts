// Search → Modules: several modules at once, to find a station that sells a whole fit. A fit can
// be imported (EDSY / Coriolis export, SLEF, a journal Loadout): its modules become the list, with
// their class and rating when the game's symbol says them.

import { extractLoadout, moduleOf } from "../materials/buildImporter.js";

/** A module wanted: its outfitting name (Spansh's), and its class and rating ("" for any). */
export interface WantedModule {
  name: string;
  cls: string;
  rating: string;
}

/** Symbols the blueprint table doesn't name (modules without engineering), most specific first. */
const OTHER_MODULES: [RegExp, string][] = [
  [/^int_shieldgenerator_.*_strong/, "Prismatic Shield Generator"],
  [/^int_shieldgenerator_.*_fast/, "Bi-Weave Shield Generator"],
  [/^int_corrosionproofcargorack/, "Corrosion Resistant Cargo Rack"],
  [/^int_cargorack/, "Cargo Rack"],
  [/^int_fueltank/, "Fuel Tank"],
  [/^int_fuelscoop/, "Fuel Scoop"],
  [/^int_dronecontrol_collection/, "Collector Limpet Controller"],
  [/^int_dronecontrol_prospector/, "Prospector Limpet Controller"],
  [/^int_dronecontrol_fueltransfer/, "Fuel Transfer Limpet Controller"],
  [/^int_dronecontrol_repair/, "Repair Limpet Controller"],
  [/^int_dronecontrol_resourcesiphon/, "Hatch Breaker Limpet Controller"],
  [/^int_dockingcomputer_advanced/, "Advanced Docking Computer"],
  [/^int_dockingcomputer/, "Standard Docking Computer"],
  [/^int_supercruiseassist/, "Supercruise Assist"],
  [/^int_repairer/, "Auto Field-Maintenance Unit"],
  [/^int_detailedsurfacescanner/, "Detailed Surface Scanner"],
  [/^int_shieldcellbank/, "Shield Cell Bank"],
  [/^int_hullreinforcement/, "Hull Reinforcement Package"],
  [/^int_modulereinforcement/, "Module Reinforcement Package"],
  [/^int_refinery/, "Refinery"],
  [/^int_buggybay/, "Planetary Vehicle Hangar"],
  [/^int_fighterbay/, "Fighter Hangar"],
  [/^int_fsdinterdictor/, "Frame Shift Drive Interdictor"],
  [/^int_guardianfsdbooster/, "Guardian FSD Booster"],
];

/** Standard slots that come with every hull and aren't bought on their own. */
const SKIPPED =
  /_armour_|cockpit|cargobaydoor|planetapproachsuite|paintjob|decal|nameplate|voicepack|bobble|weaponcustomisation|enginecustomisation|shipkit/;

/** The game's class letter for a symbol's "classN" (class 1 is E, class 5 is A). */
const RATINGS = ["E", "D", "C", "B", "A"];
/** Hardpoint sizes in a symbol's name, as outfitting classes. */
const HARDPOINT_SIZES: Record<string, string> = { small: "1", medium: "2", large: "3", huge: "4" };

/** The module of a journal symbol, or undefined when it isn't sold on its own or is unknown. */
export function wantedOf(item: string, known: readonly string[]): WantedModule | undefined {
  const symbol = item.toLowerCase();
  if (SKIPPED.test(symbol)) return undefined;
  const raw = OTHER_MODULES.find(([re]) => re.test(symbol))?.[1] ?? moduleOf(symbol);
  const name = raw && known.find((k) => k.toLowerCase() === raw.toLowerCase());
  if (!name) return undefined;
  const sized = /size(\d+)_class(\d)/.exec(symbol);
  if (sized) return { name, cls: sized[1], rating: RATINGS[Number(sized[2]) - 1] ?? "" };
  const hardpoint = /_(small|medium|large|huge)(?:_|$)/.exec(symbol);
  return { name, cls: hardpoint ? HARDPOINT_SIZES[hardpoint[1]] : "", rating: "" };
}

/** The modules of a fit pasted in any format, without twins, and how many weren't recognised. */
export function fitModules(
  text: string,
  known: readonly string[],
): { modules: WantedModule[]; unknown: number } | null {
  const loadout = extractLoadout(text);
  if (!loadout) return null;
  const modules: WantedModule[] = [];
  let unknown = 0;
  for (const m of loadout.Modules as { Item?: string }[]) {
    if (typeof m?.Item !== "string") continue;
    if (SKIPPED.test(m.Item.toLowerCase())) continue;
    const wanted = wantedOf(m.Item, known);
    if (!wanted) {
      unknown += 1;
      continue;
    }
    if (!modules.some((x) => sameModule(x, wanted))) modules.push(wanted);
  }
  return { modules, unknown };
}

export const sameModule = (a: WantedModule, b: WantedModule) =>
  a.name === b.name && a.cls === b.cls && a.rating === b.rating;

/** Whether a station's outfitting (Spansh's list) has `wanted`, under its name or an alias. */
export function stationSells(
  outfitting: { name?: unknown; class?: unknown; rating?: unknown }[],
  wanted: WantedModule,
  aliases: Record<string, string[]>,
): boolean {
  const names = [wanted.name, ...(aliases[wanted.name] ?? [])].map((n) => n.toLowerCase());
  return outfitting.some(
    (m) =>
      names.includes(String(m.name ?? "").toLowerCase()) &&
      (!wanted.cls || String(m.class ?? "") === wanted.cls) &&
      (!wanted.rating || String(m.rating ?? "").toUpperCase() === wanted.rating),
  );
}
