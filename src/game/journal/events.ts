// Turns Elite Dangerous journal events into the commander's state.
// Pure functions: easy to test with recorded journals (see test/).

import { tradeAtCarrier } from "./companionFiles.js";
import { readLoadout, setShip } from "./ship.js";
import {
  addToBag,
  type CapacityOf,
  type CommanderState,
  type FactionInfo,
  type Json,
  normalizedName,
  rememberFactions,
  type Vec3,
} from "./state.js";

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
    return list.map((x: Json) => ({
      name: normalizedName(x.Name ?? x.Material),
      count: Number(x.Count ?? x.Quantity ?? 0),
    }));
  }
  // Very old journals wrote ingredients as an object map.
  if (list && typeof list === "object") {
    return Object.entries(list as Json).map(([name, count]) => ({ name: normalizedName(name), count: Number(count) }));
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
      const id = normalizedName(x.Name);
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
      if (ev.Ship) setShip(state, ev.Ship, ev.Ship_Localised, ev.ShipID, ev.ShipName, ev.ShipIdent);
      return true;

    // Changing ship: shown at once, the Loadout that follows fills in the modules.
    case "ShipyardSwap":
    case "ShipyardNew":
      setShip(state, ev.ShipType, ev.ShipType_Localised, ev.ShipID ?? ev.NewShipID);
      if (state.loadout && state.loadout.shipId !== (ev.ShipID ?? ev.NewShipID)) {
        state.loadout = undefined;
        state.engineering = [];
      }
      return true;

    case "SetUserShipName":
      if (state.ship && (state.ship.id === undefined || state.ship.id === ev.ShipID)) {
        state.ship = { ...state.ship, name: ev.UserShipName, ident: ev.UserShipId };
        return true;
      }
      return false;

    case "Loadout":
      setShip(state, ev.Ship, ev.Ship_Localised, ev.ShipID, ev.ShipName, ev.ShipIdent);
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
      state.loadout = readLoadout(ev);
      return true;

    case "MarketBuy":
    case "MarketSell":
      return tradeAtCarrier(state, ev);

    case "Cargo":
      if (Array.isArray(ev.Inventory) && (ev.Vessel ?? "Ship") === "Ship") {
        state.cargo = {};
        for (const c of ev.Inventory) state.cargo[normalizedName(c.Name)] = Number(c.Count ?? 0);
        return true;
      }
      return false;

    case "CarrierStats":
      state.carrier = {
        callsign: ev.Callsign,
        name: ev.Name,
        fuel: ev.FuelLevel,
        capacity: ev.SpaceUsage?.TotalCapacity,
        used: ev.SpaceUsage ? ev.SpaceUsage.TotalCapacity - ev.SpaceUsage.FreeSpace : undefined,
        tritiumInCargo: state.carrier?.tritiumInCargo,
      };
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
        seenAt: ev.timestamp,
        controllingPower: ev.ControllingPower,
        powerState: ev.PowerplayState,
        powers: Array.isArray(ev.Powers) ? ev.Powers : undefined,
        controlProgress:
          typeof ev.PowerplayStateControlProgress === "number" ? ev.PowerplayStateControlProgress : undefined,
        reinforcement: typeof ev.PowerplayStateReinforcement === "number" ? ev.PowerplayStateReinforcement : undefined,
        undermining: typeof ev.PowerplayStateUndermining === "number" ? ev.PowerplayStateUndermining : undefined,
      };
      rememberFactions(
        state,
        state.location.factions.map((f) => f.name),
      );
      return true;
    }

    case "Docked":
      if (state.location) {
        state.location.docked = true;
        state.location.station = ev.StationName;
        if (state.location.system === ev.StarSystem) state.location.seenAt = ev.timestamp;
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
      addToBag(state.materials, ev.Name, Number(ev.Count ?? 1), cap);
      return true;

    case "MaterialDiscarded":
      addToBag(state.materials, ev.Name, -Number(ev.Count ?? 1));
      return true;

    case "MaterialTrade":
      if (ev.Paid) addToBag(state.materials, ev.Paid.Material, -Number(ev.Paid.Quantity ?? 0));
      if (ev.Received) addToBag(state.materials, ev.Received.Material, Number(ev.Received.Quantity ?? 0), cap);
      return true;

    case "EngineerCraft":
      for (const m of readList(ev.Ingredients)) addToBag(state.materials, m.name, -m.count);
      if (ev.Engineer) {
        const e = state.engineers[ev.Engineer];
        state.engineers[ev.Engineer] = { ...e, progress: "Unlocked" };
      }
      return true;

    case "Synthesis":
      for (const m of readList(ev.Materials)) addToBag(state.materials, m.name, -m.count);
      return true;

    case "TechnologyBroker":
      for (const m of readList(ev.Materials)) addToBag(state.materials, m.name, -m.count);
      return true;

    case "MissionCompleted":
      for (const m of readList(ev.MaterialsReward)) addToBag(state.materials, m.name, m.count, cap);
      return Boolean(ev.MaterialsReward);

    case "EngineerContribution":
      if (ev.Type === "Materials" && ev.Material) addToBag(state.materials, ev.Material, -Number(ev.Quantity ?? 0));
      return ev.Type === "Materials";

    case "ScientificResearch":
      addToBag(state.materials, ev.Name, -Number(ev.Count ?? 0));
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
export function applyLines(
  state: CommanderState,
  lines: string[],
  cap?: CapacityOf,
): { changed: boolean; events: Json[] } {
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
