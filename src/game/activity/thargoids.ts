// Thargoids: the Thargoid kills (by ship type) and the AX conflict zones entered. The journal never
// names the Thargoid ship that was killed, nor those around you: the type is recognised from the
// combat bond (FactionKillBond against "$faction_Thargoid;"), each type having its own reward.

import type { EventHandlers, Thargoids } from "./state.js";
import { num } from "./state.js";

/** Thargoid ship types EDCH tells apart, from the smallest bond to the largest. */
export type ThargoidType =
  | "revenant"
  | "scout"
  | "banshee"
  | "hunter"
  | "cyclops"
  | "orthrus"
  | "basilisk"
  | "medusa"
  | "hydra"
  | "unknown";

/**
 * Combat bond of each type (credits), as paid since 2024. Scouts (Marauder, Berserker, Inciter,
 * Regenerator…) share one band (65 000 to 80 000): they can't be told apart by their bond. The
 * Glaive and the Scythe (the "Hunter" class) pay the same bond.
 */
export const THARGOID_BONDS: { type: Exclude<ThargoidType, "unknown">; reward: number }[] = [
  { type: "revenant", reward: 25_000 },
  { type: "scout", reward: 80_000 },
  { type: "banshee", reward: 1_000_000 },
  { type: "hunter", reward: 4_500_000 },
  { type: "cyclops", reward: 8_000_000 },
  { type: "orthrus", reward: 15_000_000 },
  { type: "basilisk", reward: 24_000_000 },
  { type: "medusa", reward: 40_000_000 },
  { type: "hydra", reward: 60_000_000 },
];

/** Bonds counted as a scout (older and current scout rewards). */
const SCOUT_BAND = { min: 30_000, max: 300_000 };
/** How far (as a share) a bond may be from a type's reward and still be that type. */
const TOLERANCE = 0.15;

/** The Thargoid type paid `reward` credits; "unknown" when no type pays about that much. */
export function thargoidType(reward: number): ThargoidType {
  const exact = THARGOID_BONDS.find((bond) => bond.reward === reward);
  if (exact) return exact.type;
  if (reward >= SCOUT_BAND.min && reward <= SCOUT_BAND.max) return "scout";
  const close = THARGOID_BONDS.find((bond) => Math.abs(reward - bond.reward) <= bond.reward * TOLERANCE);
  return close?.type ?? "unknown";
}

/** Is a journal faction symbol the Thargoids' ("$faction_Thargoid;")? */
const isThargoidFaction = (faction: unknown) => /thargoid/i.test(String(faction ?? ""));

/** Is a signal or drop type an AX conflict zone ("$Warzone_TG_High:#index=1;")? */
const isAxConflictZone = (type: unknown) => /^\$?warzone_tg/i.test(String(type ?? ""));

/** Intensity of an AX conflict zone from its symbol: "$Warzone_TG_High:#index=1;" → "high". */
export function axZoneIntensity(type: string): string {
  return /^\$?warzone_tg_([a-z]+)/i.exec(type)?.[1]?.toLowerCase() ?? "";
}

/** Kills and zones kept (the oldest drop out). */
const MAX_KILLS = 5000;
const MAX_ZONES = 500;

/** Kills of each type among `kills` (count and credits), only the types seen. */
export function killsByType(kills: Thargoids["kills"]): Map<ThargoidType, { count: number; credits: number }> {
  const byType = new Map<ThargoidType, { count: number; credits: number }>();
  for (const kill of kills) {
    const tally = byType.get(kill.type) ?? { count: 0, credits: 0 };
    tally.count += 1;
    tally.credits += kill.reward;
    byType.set(kill.type, tally);
  }
  return byType;
}

/** Journal events of this domain. */
export const THARGOIDS_EVENTS: EventHandlers = {
  FactionKillBond: (st, ev, at) => {
    if (!isThargoidFaction(ev.VictimFaction)) return false;
    const reward = num(ev.Reward) ?? 0;
    st.thargoids.kills.push({ at, type: thargoidType(reward), reward, system: st.system?.name });
    if (st.thargoids.kills.length > MAX_KILLS) st.thargoids.kills.splice(0, st.thargoids.kills.length - MAX_KILLS);
    return true;
  },
  SupercruiseDestinationDrop: (st, ev, at) => {
    if (!isAxConflictZone(ev.Type)) return false;
    st.thargoids.zones.push({
      at,
      intensity: axZoneIntensity(String(ev.Type)),
      label: String(ev.Type_Localised ?? ev.Type),
      system: st.system?.name,
    });
    if (st.thargoids.zones.length > MAX_ZONES) st.thargoids.zones.splice(0, st.thargoids.zones.length - MAX_ZONES);
    return true;
  },
};
