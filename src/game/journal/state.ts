// The commander's state as read from the journal: location, ship and loadout, materials and
// cargo, engineers, fleet carrier. Updated by events.ts and companionFiles.ts.

import type { CarrierMarketSnapshot } from "./companionFiles.js";

export type Vec3 = [number, number, number];

export interface FactionInfo {
  name: string;
  state?: string;
  active: string[];
  influence?: number;
  allegiance?: string;
}

export interface LocationInfo {
  system: string;
  address?: number;
  pos?: Vec3;
  body?: string;
  station?: string;
  docked: boolean;
  allegiance?: string;
  security?: string;
  economy?: string;
  government?: string;
  population?: number;
  controllingFaction?: string;
  factions: FactionInfo[];
  /** When the journal last told us about this system (arrival, login, docking). */
  seenAt?: string;
  /** Powerplay 2.0 */
  controllingPower?: string;
  powerState?: string;
  powers?: string[];
  controlProgress?: number;
  reinforcement?: number;
  undermining?: number;
}

export interface EngineerStatus {
  progress: string; // Known | Invited | Acquainted | Unlocked | Barred
  rank?: number;
  rankProgress?: number;
}

export interface ModuleEngineering {
  slot: string;
  item: string;
  blueprint: string;
  level: number;
  quality: number;
  engineer?: string;
  experimental?: string;
}

export interface ShipLoadout {
  ship: string; // journal symbol, e.g. krait_mkii
  shipId?: number;
  unladenMass?: number;
  fuelMain?: number;
  fuelReserve?: number;
  cargoCapacity?: number;
  maxJumpRange?: number;
  /** e.g. int_hyperdrive_size5_class5 or int_hyperdrive_overcharge_size5_class5 */
  fsd?: string;
  fsdOptimalMass?: number;
  fsdMaxFuelPerJump?: number;
  /** Guardian FSD booster module symbol, if fitted. */
  booster?: string;
  modules: { slot: string; item: string; engineering?: { blueprint: string; level: number; experimental?: string } }[];
}

export interface CarrierInfo {
  callsign?: string;
  name?: string;
  fuel?: number;
  capacity?: number;
  used?: number;
  tritiumInCargo?: number;
}

export interface CommanderState {
  commander?: string;
  fid?: string;
  ship?: { type: string; name?: string; ident?: string; symbol?: string; id?: number };
  location?: LocationInfo;
  /** Ship materials (Raw/Manufactured/Encoded) by lowercase symbol. */
  materials: Record<string, number>;
  /** Odyssey ship locker by lowercase symbol. */
  locker: Record<string, number>;
  engineers: Record<string, EngineerStatus>;
  engineering: ModuleEngineering[];
  loadout?: ShipLoadout;
  /** Ship cargo hold, by lowercase commodity symbol. */
  cargo: Record<string, number>;
  /** From Status.json. */
  fuel?: { main: number; reserve: number };
  cargoMass?: number;
  /** From Status.json, on or near a planet. */
  surface?: { lat: number; lon: number; radius?: number; body?: string };
  carrier?: CarrierInfo;
  /**
   * Fleet carrier markets read from Market.json when docked (the freshest local data): what the
   * carrier sells with its stock, what it buys. Kept up to date by MarketBuy/MarketSell.
   */
  carrierMarkets?: Record<number, CarrierMarketSnapshot>;
  /** Minor factions met in the journal (systems visited, missions), most recent first. */
  knownFactions?: string[];
  lastEvent?: string;
  materialsSeenAt?: string;
  lockerSeenAt?: string;
}

/** Most factions kept in `knownFactions` (for the Search page's suggestions). */
const KNOWN_FACTIONS_MAX = 400;

/** Puts `names` first in the commander's known factions. */
export function rememberFactions(state: CommanderState, names: unknown[]) {
  const fresh = names.filter((n): n is string => typeof n === "string" && n.length > 0);
  if (!fresh.length) return;
  const known = new Set(fresh);
  state.knownFactions = [...fresh, ...(state.knownFactions ?? []).filter((n) => !known.has(n))].slice(
    0,
    KNOWN_FACTIONS_MAX,
  );
}

export function emptyState(): CommanderState {
  return { materials: {}, locker: {}, engineers: {}, engineering: [], cargo: {} };
}

export type Json = Record<string, any>;

export type CapacityOf = (id: string) => number | undefined;

export const normalizedName = (name: unknown) => String(name ?? "").toLowerCase();

export function addToBag(bag: Record<string, number>, name: unknown, delta: number, cap?: CapacityOf) {
  const id = normalizedName(name);
  if (!id) return;
  let next = (bag[id] ?? 0) + delta;
  const limit = cap?.(id);
  if (limit !== undefined) next = Math.min(next, limit);
  if (next <= 0) delete bag[id];
  else bag[id] = next;
}
