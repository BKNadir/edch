// Turns Elite Dangerous journal events into the commander's state.
// Pure functions: easy to test with recorded journals (see test/).

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

export interface CommanderState {
  commander?: string;
  fid?: string;
  ship?: { type: string; name?: string; ident?: string };
  location?: LocationInfo;
  /** Ship materials (Raw/Manufactured/Encoded) by lowercase symbol. */
  materials: Record<string, number>;
  /** Odyssey ship locker by lowercase symbol. */
  locker: Record<string, number>;
  engineers: Record<string, EngineerStatus>;
  engineering: ModuleEngineering[];
  lastEvent?: string;
  materialsSeenAt?: string;
  lockerSeenAt?: string;
}

export function emptyState(): CommanderState {
  return { materials: {}, locker: {}, engineers: {}, engineering: [] };
}

type Json = Record<string, any>;
type CapacityOf = (id: string) => number | undefined;

const key = (name: unknown) => String(name ?? "").toLowerCase();

function add(bag: Record<string, number>, name: unknown, delta: number, cap?: CapacityOf) {
  const id = key(name);
  if (!id) return;
  let next = (bag[id] ?? 0) + delta;
  const limit = cap?.(id);
  if (limit !== undefined) next = Math.min(next, limit);
  if (next <= 0) delete bag[id];
  else bag[id] = next;
}

function security(ev: Json): string | undefined {
  const raw: string = ev.SystemSecurity ?? "";
  if (raw.includes("high")) return "High";
  if (raw.includes("medium")) return "Medium";
  if (raw.includes("low")) return "Low";
  if (raw.includes("anarchy")) return "Anarchy";
  return ev.SystemSecurity_Localised;
}

function readFactions(ev: Json): FactionInfo[] {
  if (!Array.isArray(ev.Factions)) return [];
  return ev.Factions.map((f: Json) => ({
    name: f.Name,
    state: f.FactionState,
    active: Array.isArray(f.ActiveStates) ? f.ActiveStates.map((s: Json) => s.State) : [],
    influence: f.Influence,
    allegiance: f.Allegiance,
  }));
}

function readList(list: unknown): { name: string; count: number }[] {
  if (Array.isArray(list)) {
    return list.map((x: Json) => ({ name: key(x.Name ?? x.Material), count: Number(x.Count ?? x.Quantity ?? 0) }));
  }
  // Very old journals wrote ingredients as an object map.
  if (list && typeof list === "object") {
    return Object.entries(list as Json).map(([name, count]) => ({ name: key(name), count: Number(count) }));
  }
  return [];
}

/** Applies a ShipLocker snapshot (journal event or ShipLocker.json). */
export function applyLocker(state: CommanderState, ev: Json): boolean {
  const groups = ["Items", "Components", "Data", "Consumables"];
  if (!groups.some((g) => Array.isArray(ev[g]))) return false;
  const locker: Record<string, number> = {};
  for (const g of groups) {
    for (const x of ev[g] ?? []) {
      const id = key(x.Name);
      if (id) locker[id] = (locker[id] ?? 0) + Number(x.Count ?? 0);
    }
  }
  state.locker = locker;
  state.lockerSeenAt = ev.timestamp;
  return true;
}

/** Applies one journal event. Returns true when something visible changed. */
export function applyEvent(state: CommanderState, ev: Json, cap?: CapacityOf): boolean {
  if (!ev || typeof ev.event !== "string") return false;
  state.lastEvent = ev.timestamp ?? state.lastEvent;
  switch (ev.event) {
    case "Commander":
      state.commander = ev.Name;
      state.fid = ev.FID;
      return true;

    case "LoadGame":
      state.commander = ev.Commander ?? state.commander;
      state.fid = ev.FID ?? state.fid;
      if (ev.Ship) state.ship = { type: ev.Ship_Localised ?? ev.Ship, name: ev.ShipName, ident: ev.ShipIdent };
      return true;

    case "Loadout":
      state.ship = { type: ev.Ship_Localised ?? state.ship?.type ?? ev.Ship, name: ev.ShipName, ident: ev.ShipIdent };
      state.engineering = (ev.Modules ?? [])
        .filter((m: Json) => m.Engineering)
        .map((m: Json) => ({
          slot: m.Slot,
          item: m.Item,
          blueprint: m.Engineering.BlueprintName,
          level: m.Engineering.Level,
          quality: m.Engineering.Quality,
          engineer: m.Engineering.Engineer,
          experimental: m.Engineering.ExperimentalEffect_Localised ?? m.Engineering.ExperimentalEffect,
        }));
      return true;

    case "Location":
    case "FSDJump":
    case "CarrierJump": {
      const prev = state.location;
      const sameSystem = prev && prev.system === ev.StarSystem;
      state.location = {
        system: ev.StarSystem,
        address: ev.SystemAddress,
        pos: Array.isArray(ev.StarPos) ? (ev.StarPos as Vec3) : prev?.pos,
        body: ev.Body ?? (sameSystem ? prev?.body : undefined),
        station: ev.Docked ? ev.StationName : undefined,
        docked: Boolean(ev.Docked),
        allegiance: ev.SystemAllegiance || undefined,
        security: security(ev),
        economy: ev.SystemEconomy_Localised,
        government: ev.SystemGovernment_Localised,
        population: ev.Population,
        controllingFaction: ev.SystemFaction?.Name,
        factions: readFactions(ev),
      };
      return true;
    }

    case "Docked":
      if (state.location) {
        state.location.docked = true;
        state.location.station = ev.StationName;
      } else {
        state.location = { system: ev.StarSystem, docked: true, station: ev.StationName, factions: [] };
      }
      return true;

    case "Undocked":
      if (state.location) {
        state.location.docked = false;
        state.location.station = undefined;
      }
      return true;

    case "ApproachBody":
    case "Touchdown":
      if (state.location && ev.Body) state.location.body = ev.Body;
      return true;

    case "LeaveBody":
      if (state.location) state.location.body = undefined;
      return true;

    case "Materials": {
      const bag: Record<string, number> = {};
      for (const group of ["Raw", "Manufactured", "Encoded"]) {
        for (const m of readList(ev[group])) if (m.count > 0) bag[m.name] = m.count;
      }
      state.materials = bag;
      state.materialsSeenAt = ev.timestamp;
      return true;
    }

    case "MaterialCollected":
      add(state.materials, ev.Name, Number(ev.Count ?? 1), cap);
      return true;

    case "MaterialDiscarded":
      add(state.materials, ev.Name, -Number(ev.Count ?? 1));
      return true;

    case "MaterialTrade":
      if (ev.Paid) add(state.materials, ev.Paid.Material, -Number(ev.Paid.Quantity ?? 0));
      if (ev.Received) add(state.materials, ev.Received.Material, Number(ev.Received.Quantity ?? 0), cap);
      return true;

    case "EngineerCraft":
      for (const m of readList(ev.Ingredients)) add(state.materials, m.name, -m.count);
      if (ev.Engineer) {
        const e = state.engineers[ev.Engineer];
        state.engineers[ev.Engineer] = { ...e, progress: "Unlocked" };
      }
      return true;

    case "Synthesis":
      for (const m of readList(ev.Materials)) add(state.materials, m.name, -m.count);
      return true;

    case "TechnologyBroker":
      for (const m of readList(ev.Materials)) add(state.materials, m.name, -m.count);
      return true;

    case "MissionCompleted":
      for (const m of readList(ev.MaterialsReward)) add(state.materials, m.name, m.count, cap);
      return Boolean(ev.MaterialsReward);

    case "EngineerContribution":
      if (ev.Type === "Materials" && ev.Material) add(state.materials, ev.Material, -Number(ev.Quantity ?? 0));
      return ev.Type === "Materials";

    case "ScientificResearch":
      add(state.materials, ev.Name, -Number(ev.Count ?? 0));
      return true;

    case "EngineerProgress": {
      const list: Json[] = Array.isArray(ev.Engineers) ? ev.Engineers : [ev];
      for (const e of list) {
        if (!e.Engineer) continue;
        const prev = state.engineers[e.Engineer];
        state.engineers[e.Engineer] = {
          progress: e.Progress ?? prev?.progress ?? "Known",
          rank: e.Rank ?? prev?.rank,
          rankProgress: e.RankProgress ?? prev?.rankProgress,
        };
      }
      return true;
    }

    case "ShipLocker":
    case "ShipLockerMaterials":
      return applyLocker(state, ev);

    default:
      return false;
  }
}

/** Parses and applies raw journal lines; tolerant of junk lines. */
export function applyLines(state: CommanderState, lines: string[], cap?: CapacityOf): { changed: boolean; events: Json[] } {
  let changed = false;
  const events: Json[] = [];
  for (const line of lines) {
    let ev: Json;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    events.push(ev);
    if (applyEvent(state, ev, cap)) changed = true;
  }
  return { changed, events };
}
