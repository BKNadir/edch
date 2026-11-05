// The current ship: display names of ship types and the loadout (modules, drive, masses, tanks)
// read from the Loadout event.

import type { CommanderState, Json, ShipLoadout } from "./state.js";

/** Display names of the ships, by journal symbol (the Loadout event has no localised name). */
const SHIP_NAMES: Record<string, string> = {
  adder: "Adder",
  anaconda: "Anaconda",
  asp: "Asp Explorer",
  asp_scout: "Asp Scout",
  belugaliner: "Beluga Liner",
  cobramkiii: "Cobra Mk III",
  cobramkiv: "Cobra Mk IV",
  cobramkv: "Cobra Mk V",
  corsair: "Corsair",
  cutter: "Imperial Cutter",
  diamondback: "Diamondback Scout",
  diamondbackxl: "Diamondback Explorer",
  dolphin: "Dolphin",
  eagle: "Eagle",
  empire_courier: "Imperial Courier",
  empire_eagle: "Imperial Eagle",
  empire_trader: "Imperial Clipper",
  federation_corvette: "Federal Corvette",
  federation_dropship: "Federal Dropship",
  federation_dropship_mkii: "Federal Assault Ship",
  federation_gunship: "Federal Gunship",
  ferdelance: "Fer-de-Lance",
  hauler: "Hauler",
  independant_trader: "Keelback",
  krait_light: "Krait Phantom",
  krait_mkii: "Krait Mk II",
  mamba: "Mamba",
  mandalay: "Mandalay",
  orca: "Orca",
  panthermkii: "Panther Clipper Mk II",
  python: "Python",
  python_nx: "Python Mk II",
  sidewinder: "Sidewinder",
  type6: "Type-6 Transporter",
  type7: "Type-7 Transporter",
  type8: "Type-8 Transporter",
  type9: "Type-9 Heavy",
  type9_military: "Type-10 Defender",
  typex: "Alliance Chieftain",
  typex_2: "Alliance Crusader",
  typex_3: "Alliance Challenger",
  viper: "Viper Mk III",
  viper_mkiv: "Viper Mk IV",
  vulture: "Vulture",
  explorer_nx: "Caspian Explorer",
  lakonminer: "Type-11 Prospector",
};

export function shipName(symbol: string): string {
  const k = String(symbol ?? "").toLowerCase();
  return SHIP_NAMES[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function setShip(
  state: CommanderState,
  symbol: string,
  localised?: string,
  id?: number,
  name?: string,
  ident?: string,
) {
  const sym = String(symbol ?? "").toLowerCase();
  const same = state.ship?.symbol === sym;
  state.ship = {
    symbol: sym,
    // A localised name is only reused for the same ship type, never carried over to the next ship.
    type: localised ?? (same ? state.ship?.type : undefined) ?? shipName(sym),
    id: id ?? (same ? state.ship?.id : undefined),
    name,
    ident,
  };
}

export function readLoadout(ev: Json): ShipLoadout {
  const modules: Json[] = Array.isArray(ev.Modules) ? ev.Modules : [];
  const fsd = modules.find((m) => m.Slot === "FrameShiftDrive");
  const mod = (label: string) => fsd?.Engineering?.Modifiers?.find((x: Json) => x.Label === label)?.Value;
  return {
    ship: ev.Ship,
    shipId: ev.ShipID,
    unladenMass: ev.UnladenMass,
    fuelMain: ev.FuelCapacity?.Main,
    fuelReserve: ev.FuelCapacity?.Reserve,
    cargoCapacity: ev.CargoCapacity,
    maxJumpRange: ev.MaxJumpRange,
    fsd: fsd?.Item ? String(fsd.Item).toLowerCase() : undefined,
    fsdOptimalMass: mod("FSDOptimalMass"),
    fsdMaxFuelPerJump: mod("MaxFuelPerJump"),
    booster: modules.map((m) => String(m.Item ?? "").toLowerCase()).find((i) => i.startsWith("int_guardianfsdbooster")),
    modules: modules.map((m) => ({
      slot: m.Slot,
      item: String(m.Item ?? "").toLowerCase(),
      engineering: m.Engineering
        ? {
            blueprint: m.Engineering.BlueprintName,
            level: m.Engineering.Level,
            experimental: m.Engineering.ExperimentalEffect,
          }
        : undefined,
    })),
  };
}
