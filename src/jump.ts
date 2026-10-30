// Jump range maths. The game's own MaxJumpRange (Loadout event) is used as calibration, so
// engineering and SCO drives are handled without needing every FSD stat table.

import type { ShipLoadout } from "./journal.js";

/** Standard FSD max fuel per jump by class and rating (A..E), tonnes. */
const MAX_FUEL: Record<number, Record<string, number>> = {
  2: { A: 0.9, B: 0.8, C: 0.6, D: 0.6, E: 0.6 },
  3: { A: 1.8, B: 1.5, C: 1.2, D: 1.2, E: 1.2 },
  4: { A: 3.0, B: 2.5, C: 2.0, D: 2.0, E: 2.0 },
  5: { A: 5.0, B: 4.1, C: 3.3, D: 3.3, E: 3.3 },
  6: { A: 8.0, B: 6.6, C: 5.3, D: 5.3, E: 5.3 },
  7: { A: 12.8, B: 10.6, C: 8.5, D: 8.5, E: 8.5 },
  8: { A: 19.0, B: 15.8, C: 12.6, D: 12.6, E: 12.6 },
};
const RATING = ["", "E", "D", "C", "B", "A"];
/** Guardian FSD booster bonus (ly) by size. */
const BOOSTER: Record<number, number> = { 1: 4.0, 2: 6.0, 3: 7.75, 4: 9.25, 5: 10.5 };

export function fsdInfo(item?: string): { size: number; rating: string } | null {
  const m = /size(\d)_class(\d)/.exec(item ?? "");
  if (!m) return null;
  return { size: Number(m[1]), rating: RATING[Number(m[2])] ?? "?" };
}

export function boosterBonus(item?: string): number {
  const m = /size(\d)/.exec(item ?? "");
  return m ? BOOSTER[Number(m[1])] ?? 0 : 0;
}

export interface JumpModel {
  /** Range at a given total mass (hull + fuel + cargo), ly. */
  rangeAt(mass: number): number;
  unladen: number;
  fuel: number;
  reserve: number;
  cargoCapacity: number;
  maxFuelPerJump: number;
  boost: number;
  maxJumpRange: number;
}

export function jumpModel(l?: ShipLoadout): JumpModel | null {
  if (!l?.maxJumpRange || !l.unladenMass) return null;
  const info = fsdInfo(l.fsd);
  const maxFuel = l.fsdMaxFuelPerJump ?? (info ? MAX_FUEL[info.size]?.[info.rating] : undefined) ?? 0;
  const boost = boosterBonus(l.booster);
  // The game computes MaxJumpRange with no cargo and just enough fuel for one jump.
  const m0 = l.unladenMass + maxFuel;
  const base = Math.max(0, l.maxJumpRange - boost);
  return {
    rangeAt: (mass: number) => base * (m0 / Math.max(1, mass)) + boost,
    unladen: l.unladenMass,
    fuel: l.fuelMain ?? 0,
    reserve: l.fuelReserve ?? 0,
    cargoCapacity: l.cargoCapacity ?? 0,
    maxFuelPerJump: maxFuel,
    boost,
    maxJumpRange: l.maxJumpRange,
  };
}

/** Fleet carrier: max 500 ly per jump; tritium per jump ≈ 5 + d × (25 + used/1000) / 200 (community estimate). */
export const CARRIER_MAX_JUMP = 500;
export function carrierFuel(distance: number, usedCapacity: number): number {
  return Math.round(5 + (distance * (25 + usedCapacity / 1000)) / 200);
}

export function carrierEstimate(distance: number, usedCapacity: number) {
  const full = Math.floor(distance / CARRIER_MAX_JUMP);
  const rest = distance - full * CARRIER_MAX_JUMP;
  const jumps = full + (rest > 0.01 ? 1 : 0);
  const fuel = full * carrierFuel(CARRIER_MAX_JUMP, usedCapacity) + (rest > 0.01 ? carrierFuel(rest, usedCapacity) : 0);
  // 15 min countdown + ~5 min cooldown per jump.
  return { jumps, fuel, minutes: jumps * 20 };
}
