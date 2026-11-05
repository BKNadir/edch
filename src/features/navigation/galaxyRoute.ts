// Exact ship route with fuel (Spansh Galaxy Plotter, /api/generic/route): unlike the neutron
// plotter, it knows the ship (drive constants, masses, tanks), so it checks every jump against the
// fuel left, scoops at scoopable stars and says where you must refuel.

import { spanshJob } from "../../platform/bridge.js";
import { FSD_DATA } from "./fsdData.js";
import type { ShipLoadout } from "../../game/journal.js";
import { boosterBonus, superchargeMultiplier } from "./jumpRange.js";
import { t } from "../../platform/i18n.js";

type Json = Record<string, any>;

export type GalaxyAlgorithm = "optimistic" | "pessimistic" | "guided" | "fuel" | "fuel_jumps";

export interface GalaxyOptions {
  from: string;
  to: string;
  /** Cargo carried, tonnes. */
  cargo: number;
  algorithm: GalaxyAlgorithm;
  /** Use neutron stars to supercharge the drive. */
  useSupercharge: boolean;
  /** Already supercharged when leaving. */
  isSupercharged: boolean;
  /** FSD injections (synthesis) allowed. */
  useInjections: boolean;
  /** Avoid secondary stars (no jumps needing a supercruise to a companion star). */
  excludeSecondary: boolean;
  /** Refuel at every scoopable star, not only when needed. */
  refuelEveryScoopable: boolean;
  /** 4, or 6 for the Caspian Explorer's Mk II drive. */
  supercharge: 4 | 6;
}

/** What the plotter needs to know about the ship. */
export interface ShipParams {
  optimal_mass: number;
  max_fuel_per_jump: number;
  fuel_multiplier: number;
  fuel_power: number;
  tank_size: number;
  internal_tank_size: number;
  base_mass: number;
  range_boost: number;
}

export interface GalaxyJump {
  system: string;
  /** Distance of this jump, ly. */
  distance: number;
  toGo: number;
  fuelInTank: number;
  fuelUsed: number;
  scoopable: boolean;
  mustRefuel: boolean;
  neutron: boolean;
}

export interface GalaxyRoute {
  jumps: GalaxyJump[];
  /** Total distance flown, ly. */
  distance: number;
  refuels: number;
  neutrons: number;
}

/** The ship's drive and masses from the journal, or what is missing. */
export function shipParams(l: ShipLoadout | undefined): { params?: ShipParams; missing: string[]; hasScoop: boolean } {
  const missing: string[] = [];
  if (!l) return { missing: [t("galaxyRoute.shipStartGame")], hasScoop: false };
  const base = l.fsd ? FSD_DATA[l.fsd.toLowerCase()] : undefined;
  if (!base) missing.push(t("galaxyRoute.fsdUnknownModel"));
  if (!l.unladenMass) missing.push(t("galaxyRoute.unladenMass"));
  if (!l.fuelMain) missing.push(t("galaxyRoute.fuelTank"));
  const hasScoop = l.modules.some((m) => m.item.startsWith("int_fuelscoop"));
  if (missing.length || !base) return { missing, hasScoop };
  const [optMass, maxFuel, fuelMul, fuelPower] = base;
  return {
    missing,
    hasScoop,
    params: {
      // Engineering (and experimental effects) change these two: the journal gives the real values.
      optimal_mass: l.fsdOptimalMass ?? optMass,
      max_fuel_per_jump: l.fsdMaxFuelPerJump ?? maxFuel,
      fuel_multiplier: fuelMul,
      fuel_power: fuelPower,
      tank_size: l.fuelMain!,
      internal_tank_size: l.fuelReserve ?? 0,
      // Mass with full tanks, as Spansh expects (it removes the fuel used along the way).
      base_mass: l.unladenMass! + l.fuelMain! + (l.fuelReserve ?? 0),
      range_boost: boosterBonus(l.booster),
    },
  };
}

export const defaultSupercharge = (l?: ShipLoadout) => superchargeMultiplier(l?.fsd);

const flag = (b: boolean) => (b ? "1" : "0");

/** Asks Spansh for the exact route. */
export async function plotGalaxy(ship: ShipParams, o: GalaxyOptions, onWait?: (n: number) => void): Promise<GalaxyRoute> {
  const form: [string, string][] = [
    ["source", o.from],
    ["destination", o.to],
    ["is_supercharged", flag(o.isSupercharged)],
    ["use_supercharge", flag(o.useSupercharge)],
    ["use_injections", flag(o.useInjections)],
    ["exclude_secondary", flag(o.excludeSecondary)],
    ["refuel_every_scoopable", flag(o.refuelEveryScoopable)],
    ["max_time", "60"],
    ["cargo", String(Math.max(0, Math.round(o.cargo)))],
    ["algorithm", o.algorithm],
    ["supercharge_multiplier", String(o.supercharge)],
    ...Object.entries(ship).map(([k, v]) => [k, String(v)] as [string, string]),
  ];
  const res: Json = await spanshJob("generic/route", form, onWait);
  return readGalaxy(res);
}

/** Spansh's answer → the jumps (exported for the tests). */
export function readGalaxy(res: Json): GalaxyRoute {
  const raw: Json[] = Array.isArray(res?.jumps) ? res.jumps : [];
  const jumps: GalaxyJump[] = raw.map((j) => ({
    system: String(j.name ?? j.system ?? ""),
    distance: Number(j.distance ?? 0),
    toGo: Number(j.distance_to_destination ?? 0),
    fuelInTank: Number(j.fuel_in_tank ?? 0),
    fuelUsed: Number(j.fuel_used ?? 0),
    scoopable: Boolean(j.is_scoopable),
    mustRefuel: Boolean(j.must_refuel),
    neutron: Boolean(j.has_neutron),
  }));
  return {
    jumps,
    distance: jumps.reduce((s, j) => s + j.distance, 0),
    refuels: jumps.filter((j) => j.mustRefuel).length,
    neutrons: jumps.filter((j) => j.neutron).length,
  };
}
