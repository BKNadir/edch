// The game's companion files next to the journal: Cargo.json, Market.json and Status.json
// (fuel, cargo, position on a planet…), read whenever the game rewrites them.

import { type CommanderState, type Json, normalizedName } from "./state.js";

/** Applies Status.json (fuel, cargo mass). */
/**
 * Cargo.json, rewritten by the game whenever the hold changes. The Cargo journal event often
 * only says "look at Cargo.json" (no Inventory), so the file is the reliable source.
 */
export function applyCargoFile(state: CommanderState, file: Json): boolean {
  if (!file || (file.Vessel ?? "Ship") !== "Ship" || !Array.isArray(file.Inventory)) return false;
  const next: Record<string, number> = {};
  for (const c of file.Inventory)
    next[normalizedName(c.Name)] = (next[normalizedName(c.Name)] ?? 0) + Number(c.Count ?? 0);
  if (JSON.stringify(next) === JSON.stringify(state.cargo)) return false;
  state.cargo = next;
  return true;
}

export interface CarrierMarketSnapshot {
  at: string;
  station: string;
  selling: Record<string, { label: string; count: number; price?: number }>;
  buying: Record<string, { label: string; count: number; price?: number }>;
}

/** "$Tritium_Name;" → "tritium" */
const commodityKey = (raw: unknown) =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/_name;$/, "")
    .replace(/;$/, "");

/** Market.json at a fleet carrier: its sell orders (with stock) and buy orders, as the game shows them now. */
export function applyMarketFile(state: CommanderState, file: Json): boolean {
  if (!file || !Array.isArray(file.Items) || !/carrier/i.test(String(file.StationType ?? ""))) return false;
  const id = Number(file.MarketID);
  if (!id) return false;
  const snap: CarrierMarketSnapshot = {
    at: String(file.timestamp ?? new Date().toISOString()),
    station: String(file.StationName ?? ""),
    selling: {},
    buying: {},
  };
  for (const it of file.Items) {
    const key = commodityKey(it.Name);
    const label = String(it.Name_Localised ?? key);
    if (Number(it.Stock) > 0)
      snap.selling[key] = { label, count: Number(it.Stock), price: Number(it.BuyPrice) || undefined };
    if (Number(it.Demand) > 0)
      snap.buying[key] = { label, count: Number(it.Demand), price: Number(it.SellPrice) || undefined };
  }
  const prev = state.carrierMarkets?.[id];
  if (prev && prev.at > snap.at) return false;
  state.carrierMarkets = { ...(state.carrierMarkets ?? {}), [id]: snap };
  return true;
}

/** Buying from / selling to a carrier changes its market right away. */
export function tradeAtCarrier(state: CommanderState, ev: Json): boolean {
  const snap = state.carrierMarkets?.[Number(ev.MarketID)];
  if (!snap || (ev.timestamp && ev.timestamp < snap.at)) return false;
  const key = commodityKey(ev.Type);
  const n = Number(ev.Count ?? 0);
  const book = ev.event === "MarketBuy" ? snap.selling : snap.buying;
  const line = book[key];
  if (line) {
    line.count = Math.max(0, line.count - n);
    if (!line.count) delete book[key];
  }
  snap.at = ev.timestamp ?? snap.at;
  return true;
}

export function applyStatus(state: CommanderState, status: Json): boolean {
  if (!status || typeof status !== "object") return false;
  let changed = false;
  if (status.Fuel && typeof status.Fuel.FuelMain === "number") {
    const fuel = { main: status.Fuel.FuelMain, reserve: status.Fuel.FuelReservoir ?? 0 };
    if (state.fuel?.main !== fuel.main) changed = true;
    state.fuel = fuel;
  }
  if (typeof status.Latitude === "number" && typeof status.Longitude === "number") {
    const surface = {
      lat: status.Latitude,
      lon: status.Longitude,
      radius: typeof status.PlanetRadius === "number" ? status.PlanetRadius : undefined,
      body: status.BodyName,
    };
    if (state.surface?.lat !== surface.lat || state.surface?.lon !== surface.lon) changed = true;
    state.surface = surface;
  } else if (state.surface) {
    state.surface = undefined;
    changed = true;
  }
  if (typeof status.Cargo === "number" && state.cargoMass !== status.Cargo) {
    state.cargoMass = status.Cargo;
    changed = true;
  }
  return changed;
}
