// Where to get the goods a mission asks for: stations that sell them (ranked on price, distance and
// how fresh the market data is) and, for minerals, the nearest rings with a hotspot.

import { spanshPost } from "./bridge.js";
import { referenceOf, type Ctx } from "./context.js";

type Json = Record<string, any>;

export interface Offer {
  station: string;
  system: string;
  price: number;
  supply: number;
  distance: number;
  arrival?: number;
  largePad?: boolean;
  carrier: boolean;
  updated?: string;
  ageDays: number;
  /** Lower is better. */
  score: number;
  tags: ("best" | "cheapest" | "nearest" | "freshest")[];
}

export interface Hotspot {
  system: string;
  ring: string;
  count: number;
  distance: number;
}

const BIG = "1000000000";
const STATION_TYPES = [
  "Asteroid base", "Coriolis Starport", "Dodec Starport", "Mega ship", "Ocellus Starport", "Orbis Starport", "Outpost",
  "Planetary Construction Depot", "Planetary Outpost", "Planetary Port", "Settlement", "Space Construction Depot", "Surface Settlement",
];

function where(ctx: Ctx) {
  const ref = referenceOf(ctx);
  return ref.coords ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } } : { reference_system: ref.system };
}

/**
 * Stations selling `commodity` (English market name) with enough stock, best compromise first:
 * a price close to the cheapest, not too far, and market data seen recently.
 */
export async function findSupply(ctx: Ctx, commodity: string, need: number): Promise<Offer[]> {
  const s = ctx.store.state.settings;
  const filters: Json = {
    distance: { min: "0", max: String(s.maxDistance) },
    type: { value: STATION_TYPES },
    market: [{ name: commodity, supply: { value: [String(Math.max(1, need)), BIG], comparison: "<=>" } }],
  };
  if (s.largePadOnly) filters.has_large_pad = { value: ["true"] };
  const res = await spanshPost("stations/search", { filters, sort: [{ distance: { direction: "asc" } }], size: 60, page: 0, ...where(ctx) });
  const now = Date.now();
  const offers: Offer[] = [];
  for (const r of (res?.results ?? []) as Json[]) {
    const q = ((r.market ?? []) as Json[]).find((x) => String(x.commodity).toLowerCase() === commodity.toLowerCase());
    if (!q || !q.buy_price) continue;
    const updated = r.market_updated_at ?? r.updated_at;
    const ageDays = updated ? Math.max(0, (now - Date.parse(String(updated).replace(" ", "T") + (String(updated).endsWith("Z") ? "" : "Z"))) / 86400000) : 30;
    offers.push({
      station: r.name,
      system: r.system_name,
      price: Number(q.buy_price),
      supply: Number(q.supply ?? 0),
      distance: Number(r.distance ?? 0),
      arrival: r.distance_to_arrival,
      largePad: r.has_large_pad,
      carrier: /carrier/i.test(String(r.type ?? "")),
      updated,
      ageDays,
      score: 0,
      tags: [],
    });
  }
  if (!offers.length) return [];
  // Data older than a week is unreliable: keep it only when nothing fresher exists.
  const fresh = offers.filter((o) => o.ageDays <= 7);
  const pool = fresh.length ? fresh : offers;
  const cheapest = Math.min(...pool.map((o) => o.price));
  const nearest = Math.min(...pool.map((o) => o.distance));
  for (const o of pool) {
    // Price over the cheapest (as a share), plus distance (100 ly ≈ 10 % dearer), plus staleness.
    const priceGap = (o.price - cheapest) / Math.max(1, cheapest);
    o.score = priceGap + (o.distance - nearest) / 1000 + Math.min(o.ageDays, 7) * 0.02 + (o.carrier ? 0.05 : 0);
  }
  pool.sort((a, b) => a.score - b.score);
  pool[0].tags.push("best");
  pool.reduce((m, o) => (o.price < m.price ? o : m)).tags.push("cheapest");
  pool.reduce((m, o) => (o.distance < m.distance ? o : m)).tags.push("nearest");
  pool.reduce((m, o) => (o.ageDays < m.ageDays ? o : m)).tags.push("freshest");
  return pool.slice(0, 6);
}

/** Nearest rings with a hotspot of `mineral` (hotspot spelling, e.g. "Void Opal"). */
export async function findHotspots(ctx: Ctx, mineral: string): Promise<Hotspot[]> {
  const s = ctx.store.state.settings;
  const res = await spanshPost("bodies/search", {
    filters: { distance: { min: "0", max: String(s.maxDistance) }, ring_signals: { name: { value: [mineral] } } },
    sort: [{ distance: { direction: "asc" } }],
    size: 10,
    page: 0,
    ...where(ctx),
  });
  const out: Hotspot[] = [];
  for (const b of (res?.results ?? []) as Json[]) {
    for (const r of (b.rings ?? []) as Json[]) {
      const sig = ((r.signals ?? []) as Json[]).find((x) => String(x.name).toLowerCase() === mineral.toLowerCase());
      if (sig) out.push({ system: b.system_name, ring: r.name, count: Number(sig.count ?? 1), distance: Number(b.distance ?? 0) });
    }
  }
  return out.slice(0, 5);
}

/** Minerals that rings can hold as hotspots (market name → hotspot name). */
export const HOTSPOT_NAMES: Record<string, string> = {
  platinum: "Platinum", painite: "Painite", lowtemperaturediamond: "Low Temperature Diamonds", opal: "Void Opal", monazite: "Monazite",
  musgravite: "Musgravite", rhodplumsite: "Rhodplumsite", serendibite: "Serendibite", benitoite: "Benitoite", grandidierite: "Grandidierite",
  alexandrite: "Alexandrite", bromellite: "Bromellite", tritium: "Tritium", bertrandite: "Bertrandite", indite: "Indite", gallite: "Gallite",
  coltan: "Coltan", uraninite: "Uraninite", lepidolite: "Lepidolite", samarium: "Samarium", praseodymium: "Praseodymium", bauxite: "Bauxite",
  rutile: "Rutile", cobalt: "Cobalt", lithiumhydroxide: "Lithium Hydroxide", methaneclathrate: "Methane Clathrate",
  methanolmonohydratecrystals: "Methanol Monohydrate Crystals", liquidoxygen: "Liquid oxygen", water: "Water", hydrogenperoxide: "Hydrogen Peroxide",
};
