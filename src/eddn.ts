// EDDN message builders: journal data → messages for https://eddn.edcd.io (the community
// data network EDMC feeds). Written from the EDDN schema READMEs (EDCD/EDDN, live branch).
// Pure functions so they can be tested; sending lives in uploaders.ts.

export const EDDN_URL = "https://eddn.edcd.io:4430/upload/";
export const SOFTWARE_NAME = "EDCH";
export const SOFTWARE_VERSION = "0.8.1";

type Json = Record<string, any>;

/** What the uploader must know about the game session. */
export interface GameSession {
  commander?: string;
  gameversion?: string;
  gamebuild?: string;
  /** From LoadGame only; undefined = unknown → key omitted. */
  horizons?: boolean;
  odyssey?: boolean;
  /** Last Location / FSDJump / CarrierJump, for the mandatory cross-check. */
  system?: string;
  address?: number;
  pos?: [number, number, number];
}

export interface EddnMessage {
  $schemaRef: string;
  header: { uploaderID: string; softwareName: string; softwareVersion: string; gameversion: string; gamebuild: string };
  message: Json;
}

/** Updates the session from any event (replayed or live). */
export function trackSession(s: GameSession, ev: Json) {
  switch (ev.event) {
    case "Fileheader":
      s.gameversion = ev.gameversion ?? "";
      s.gamebuild = ev.build ?? "";
      // A new game start: login flags are re-read from LoadGame.
      s.horizons = undefined;
      s.odyssey = undefined;
      break;
    case "Commander":
      s.commander = ev.Name;
      break;
    case "LoadGame":
      s.commander = ev.Commander ?? s.commander;
      if (typeof ev.Horizons === "boolean") s.horizons = ev.Horizons;
      if (typeof ev.Odyssey === "boolean") s.odyssey = ev.Odyssey;
      if (!s.gameversion && ev.gameversion) s.gameversion = ev.gameversion;
      if (!s.gamebuild && ev.build) s.gamebuild = ev.build;
      break;
    case "Location":
    case "FSDJump":
    case "CarrierJump":
      s.system = ev.StarSystem;
      s.address = ev.SystemAddress;
      s.pos = Array.isArray(ev.StarPos) ? (ev.StarPos as [number, number, number]) : undefined;
      break;
  }
}

export const isBeta = (s: GameSession) => /beta/i.test(s.gameversion ?? "");

function envelope(s: GameSession, schema: string, message: Json): EddnMessage | null {
  if (!s.commander) return null;
  return {
    $schemaRef: `https://eddn.edcd.io/schemas/${schema}${isBeta(s) ? "/test" : ""}`,
    header: {
      uploaderID: s.commander,
      softwareName: SOFTWARE_NAME,
      softwareVersion: SOFTWARE_VERSION,
      gameversion: s.gameversion ?? "",
      gamebuild: s.gamebuild ?? "",
    },
    message,
  };
}

function flags(s: GameSession, m: Json): Json {
  if (s.horizons !== undefined) m.horizons = s.horizons;
  if (s.odyssey !== undefined) m.odyssey = s.odyssey;
  return m;
}

/** Deep copy without any *_Localised key. */
function stripLocalised(v: any): any {
  if (Array.isArray(v)) return v.map(stripLocalised);
  if (v && typeof v === "object") {
    const out: Json = {};
    for (const [k, x] of Object.entries(v)) if (!k.endsWith("_Localised")) out[k] = stripLocalised(x);
    return out;
  }
  return v;
}

const PERSONAL = ["ActiveFine", "CockpitBreach", "BoostUsed", "FuelLevel", "FuelUsed", "JumpDist", "Latitude", "Longitude", "Wanted", "IsNewEntry", "NewTraitsDiscovered", "Traits", "VoucherAmount"];
const PERSONAL_FACTION = ["HappiestSystem", "HomeSystem", "MyReputation", "SquadronFaction"];
const JOURNAL_EVENTS = new Set(["Docked", "FSDJump", "Scan", "Location", "SAASignalsFound", "CarrierJump"]);

/**
 * Adds StarSystem/StarPos from the last location event, only when the event's own
 * SystemAddress (or name) matches it. Returns false when the message must be dropped.
 */
function augmentLocation(s: GameSession, m: Json, nameKey: "StarSystem" | "SystemName", needName: boolean): boolean {
  if (m.SystemAddress !== undefined && m.SystemAddress !== s.address) return false;
  if (m[nameKey] !== undefined && s.system !== undefined && m[nameKey] !== s.system) return false;
  if (m.SystemAddress === undefined && m[nameKey] === undefined) return false;
  if (!s.pos || s.address === undefined || !s.system) return false;
  if (m.SystemAddress === undefined) m.SystemAddress = s.address;
  if (needName && m[nameKey] === undefined) m[nameKey] = s.system;
  if (m.StarPos === undefined) m.StarPos = s.pos;
  return true;
}

/** journal/1 for Docked, FSDJump, Scan, Location, SAASignalsFound, CarrierJump. */
export function journalMessage(s: GameSession, ev: Json): EddnMessage | null {
  if (!JOURNAL_EVENTS.has(ev.event)) return null;
  const m: Json = stripLocalised(ev);
  for (const k of PERSONAL) delete m[k];
  if (Array.isArray(m.Factions)) {
    m.Factions = m.Factions.map((f: Json) => {
      const copy = { ...f };
      for (const k of PERSONAL_FACTION) delete copy[k];
      return copy;
    });
  }
  if (["Docked", "Scan", "SAASignalsFound"].includes(ev.event)) {
    if (!augmentLocation(s, m, "StarSystem", ev.event === "SAASignalsFound")) return null;
  }
  if (!m.StarSystem || !Array.isArray(m.StarPos) || m.SystemAddress === undefined) return null;
  return envelope(s, "journal/1", flags(s, m));
}

const canonical = (name: string) => name.replace(/^\$/, "").replace(/_name;$/i, "").toLowerCase();

/** commodity/3 from Market.json (read when the Market event fires). */
export function commodityMessage(s: GameSession, market: Json): EddnMessage | null {
  if (!market?.MarketID || !market.StationName || !market.StarSystem) return null;
  const items: Json[] = Array.isArray(market.Items) ? market.Items : [];
  const commodities = items
    .filter((i) => !/nonmarketable/i.test(String(i.Category ?? "")) && !(typeof i.Legality === "string" && i.Legality))
    .map((i) => ({
      name: canonical(String(i.Name)),
      meanPrice: i.MeanPrice,
      buyPrice: i.BuyPrice,
      stock: i.Stock,
      stockBracket: i.StockBracket,
      sellPrice: i.SellPrice,
      demand: i.Demand,
      demandBracket: i.DemandBracket,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const m: Json = { timestamp: market.timestamp, systemName: market.StarSystem, stationName: market.StationName, marketId: market.MarketID, commodities };
  if (market.StationType) m.stationType = market.StationType;
  if (market.CarrierDockingAccess) m.carrierDockingAccess = market.CarrierDockingAccess;
  return envelope(s, "commodity/3", flags(s, m));
}

const MODULE_OK = /(^hpt_|^int_|_armour_)/i;
const normaliseModule = (n: string) => n.replace(/^hpt_/i, "Hpt_").replace(/^int_/i, "Int_").replace(/_armour_/i, "_Armour_");

/** outfitting/2 from Outfitting.json. */
export function outfittingMessage(s: GameSession, outfitting: Json): EddnMessage | null {
  if (!outfitting?.MarketID) return null;
  const names = [...new Set<string>((outfitting.Items ?? []).map((i: Json) => String(i.Name ?? "")))]
    .filter((n) => MODULE_OK.test(n) && n.toLowerCase() !== "int_planetapproachsuite")
    .map(normaliseModule)
    .sort();
  if (!names.length) return null;
  const m = { timestamp: outfitting.timestamp, systemName: outfitting.StarSystem, stationName: outfitting.StationName, marketId: outfitting.MarketID, modules: names };
  return envelope(s, "outfitting/2", flags(s, m));
}

/** shipyard/2 from Shipyard.json. */
export function shipyardMessage(s: GameSession, shipyard: Json): EddnMessage | null {
  if (!shipyard?.MarketID) return null;
  const ships = [...new Set<string>((shipyard.PriceList ?? []).map((p: Json) => String(p.ShipType ?? "")).filter(Boolean))].sort();
  if (!ships.length) return null;
  const m: Json = { timestamp: shipyard.timestamp, systemName: shipyard.StarSystem, stationName: shipyard.StationName, marketId: shipyard.MarketID, ships };
  if (typeof shipyard.AllowCobraMkIV === "boolean") m.allowCobraMkIV = shipyard.AllowCobraMkIV;
  return envelope(s, "shipyard/2", flags(s, m));
}

/** navroute/1 from NavRoute.json. */
export function navrouteMessage(s: GameSession, nav: Json): EddnMessage | null {
  const route: Json[] = Array.isArray(nav?.Route) ? nav.Route : [];
  if (!route.length) return null;
  const Route = route.map((r) => ({ StarSystem: r.StarSystem, SystemAddress: r.SystemAddress, StarPos: r.StarPos, StarClass: r.StarClass }));
  return envelope(s, "navroute/1", flags(s, { timestamp: nav.timestamp, event: "NavRoute", Route }));
}

/** fssdiscoveryscan/1 and fssallbodiesfound/1. */
export function fssMessage(s: GameSession, ev: Json): EddnMessage | null {
  if (ev.event !== "FSSDiscoveryScan" && ev.event !== "FSSAllBodiesFound") return null;
  const m: Json = { timestamp: ev.timestamp, event: ev.event, SystemName: ev.SystemName, SystemAddress: ev.SystemAddress };
  if (ev.event === "FSSDiscoveryScan") Object.assign(m, { BodyCount: ev.BodyCount, NonBodyCount: ev.NonBodyCount });
  else m.Count = ev.Count;
  if (!augmentLocation(s, m, "SystemName", false)) return null;
  return envelope(s, ev.event === "FSSDiscoveryScan" ? "fssdiscoveryscan/1" : "fssallbodiesfound/1", flags(s, m));
}
