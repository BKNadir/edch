// Where to mine a mineral (ring hotspots, with the planet, the ring type and the ring's reserve)
// and where to sell it. When nothing is found within the search radius, the radius grows (up to
// MAX_RADIUS) so the commander knows how far the nearest spot is.

import { spanshPost } from "../../platform/bridge.js";
import { ardentSellQuotes } from "../../services/ardent.js";
import { edcnKeyring, edcnQuotes } from "../../services/edcn.js";
import {
  bestRecentFirst,
  freshestQuote,
  meetsDemand,
  newestZoneQuotes,
  recentEnough,
  type QuoteSource,
} from "../market/freshestQuote.js";
import { referenceOf, type Ctx } from "../../state/context.js";
import { t } from "../../platform/i18n.js";

type Json = Record<string, any>;

/** How a mineral is mined. */
export type MiningMethod = "laser" | "core" | "subsurface";

const LASER = new Set([
  "Platinum",
  "Painite",
  "Osmium",
  "Palladium",
  "Gold",
  "Silver",
  "Bertrandite",
  "Indite",
  "Gallite",
  "Coltan",
  "Uraninite",
  "Lepidolite",
  "Samarium",
  "Praseodymium",
  "Bauxite",
  "Rutile",
  "Cobalt",
  "Lithium Hydroxide",
  "Methane Clathrate",
  "Methanol Monohydrate Crystals",
  "Liquid oxygen",
  "Water",
  "Hydrogen Peroxide",
  "Tritium",
  "Low Temperature Diamonds",
  "Bromellite",
]);
const CORE = new Set([
  "Alexandrite",
  "Benitoite",
  "Bromellite",
  "Grandidierite",
  "Low Temperature Diamonds",
  "Monazite",
  "Musgravite",
  "Painite",
  "Rhodplumsite",
  "Serendibite",
  "Void Opal",
]);
const SUBSURFACE = new Set([...CORE, "Platinum"]);

export function miningMethods(mineral: string): MiningMethod[] {
  const out: MiningMethod[] = [];
  if (LASER.has(mineral)) out.push("laser");
  if (SUBSURFACE.has(mineral)) out.push("subsurface");
  if (CORE.has(mineral)) out.push("core");
  return out;
}

/**
 * Ring types where a mineral's motherlode (core) asteroids are found. Its hotspots only show in
 * compatible rings anyway; this keeps "core" off the rings where you'd find no motherlode.
 */
const CORE_RING_TYPES: Record<string, string[]> = {
  Alexandrite: ["Rocky", "Metal Rich", "Icy"],
  Benitoite: ["Rocky", "Metal Rich"],
  Bromellite: ["Icy"],
  Grandidierite: ["Icy", "Rocky"],
  "Low Temperature Diamonds": ["Icy"],
  Monazite: ["Rocky", "Metal Rich", "Metallic"],
  Musgravite: ["Rocky", "Metal Rich"],
  Painite: ["Metallic", "Metal Rich", "Rocky"],
  Rhodplumsite: ["Metallic", "Metal Rich"],
  Serendibite: ["Rocky", "Metal Rich", "Icy"],
  "Void Opal": ["Icy"],
};

/** How `mineral` is mined in a ring of `ringType` (all its methods when the type is unknown). */
export function ringMethods(mineral: string, ringType: string | undefined): MiningMethod[] {
  const coreRings = CORE_RING_TYPES[mineral];
  if (!ringType || !coreRings || coreRings.includes(ringType)) return miningMethods(mineral);
  return miningMethods(mineral).filter(
    (method) => method === "laser" || (method === "subsurface" && mineral === "Platinum"),
  );
}

/** Short names, for the table's "Mining type" column. */
export const METHOD_SHORT_LABEL: Record<MiningMethod, string> = {
  laser: t("miningSpots.laser"),
  subsurface: t("miningSpots.subsurface"),
  core: t("miningSpots.core"),
};

export const METHOD_LABEL: Record<MiningMethod, string> = {
  laser: t("miningSpots.laserSurface"),
  subsurface: t("miningSpots.subsurfaceDisplacementMissiles"),
  core: t("miningSpots.coreSeismicCharges"),
};

/** Ring types as the game names them. */
export const RING_TYPE: Record<string, string> = {
  Metallic: t("miningSpots.metallic"),
  "Metal Rich": t("miningSpots.metalRich"),
  Rocky: t("miningSpots.rocky"),
  Icy: t("miningSpots.icy"),
};
export const RESERVE: Record<string, string> = {
  Pristine: t("miningSpots.pristine"),
  Major: t("miningSpots.major"),
  Common: t("miningSpots.common"),
  Low: t("miningSpots.low"),
  Depleted: t("miningSpots.depleted"),
};

export interface RingSpot {
  mineral: string;
  system: string;
  /** The planet (or star) the ring belongs to. */
  body: string;
  bodyId64?: number;
  ring: string;
  ringType?: string;
  reserve?: string;
  count: number;
  distance?: number;
  arrival?: number;
  state?: string;
}

export interface SellSpot {
  mineral: string;
  station: string;
  system: string;
  price: number;
  demand: number;
  distance?: number;
  arrival?: number;
  largePad?: boolean;
  state?: string;
  updated?: string;
  /** Where the price comes from: the most recent of Spansh's and Ardent's. */
  source: QuoteSource;
}

/** The game's symbol of a commodity from its name ("Low Temperature Diamonds" → "lowtemperaturediamond"). */
export function commodityId(ctx: Ctx, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return ctx.game.data.commodities.find((c) => c.name.toLowerCase() === wanted)?.id;
}

/** Radius steps tried when nothing is found: the setting, then wider. */
export const MAX_RADIUS = 2000;
const radii = (start: number) => {
  const out = [start];
  for (const r of [start * 2, start * 4, 1000, MAX_RADIUS]) if (r > out[out.length - 1] && r <= MAX_RADIUS) out.push(r);
  return out;
};

const where = (ctx: Ctx) => {
  const ref = referenceOf(ctx);
  return ref.coords
    ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } }
    : { reference_system: ref.system };
};

/** Ring hotspots of `mineral`, nearest first; `radius` is the radius that gave results. */
export async function findRingSpots(
  ctx: Ctx,
  mineral: string,
  extra: Json = {},
  range = ctx.store.state.settings.maxDistance,
): Promise<{ spots: RingSpot[]; radius: number; widened: boolean }> {
  const start = range;
  for (const r of radii(start)) {
    const res = await spanshPost("bodies/search", {
      filters: { ...extra, distance: { min: "0", max: String(r) }, ring_signals: { name: { value: [mineral] } } },
      sort: [{ distance: { direction: "asc" } }],
      size: 50,
      page: 0,
      ...where(ctx),
    });
    const spots: RingSpot[] = [];
    for (const b of (res?.results ?? []) as Json[]) {
      for (const ring of (b.rings ?? []) as Json[]) {
        const sig = ((ring.signals ?? []) as Json[]).find(
          (x) => String(x.name).toLowerCase() === mineral.toLowerCase(),
        );
        if (!sig) continue;
        spots.push({
          mineral,
          system: String(b.system_name ?? ""),
          body: String(b.name ?? ""),
          bodyId64: typeof b.id64 === "number" ? b.id64 : undefined,
          ring: String(ring.name ?? ""),
          ringType: ring.type ? String(ring.type) : undefined,
          reserve: b.reserve_level ? String(b.reserve_level) : undefined,
          count: Number(sig.count ?? 1),
          distance: typeof b.distance === "number" ? b.distance : undefined,
          arrival: typeof b.distance_to_arrival === "number" ? b.distance_to_arrival : undefined,
          state: b.system_power_state,
        });
      }
    }
    if (spots.length) return { spots, radius: r, widened: r > start };
  }
  return { spots: [], radius: MAX_RADIUS, widened: true };
}

/**
 * Stations buying `mineral`, best price first (then the most recently seen); `radius` is the radius
 * that gave results. Each price is the most recent of Spansh's and Ardent's, and recent markets only
 * Ardent knows are added when no other filter applies (a power's systems: Ardent can't tell). Only
 * markets wanting at least the "minimum demand" setting, seen within the "data age" setting, are kept.
 */
export async function findSellSpots(
  ctx: Ctx,
  mineral: string,
  extra: Json = {},
  range = ctx.store.state.settings.maxDistance,
): Promise<{ spots: SellSpot[]; radius: number; widened: boolean }> {
  const { minSellDemand, maxAgeDays } = ctx.store.state.settings;
  const start = range;
  const minDemand = Math.max(1, minSellDemand);
  const id = commodityId(ctx, mineral);
  const reference = referenceOf(ctx);
  const system = reference.system;
  const edcn = await edcnKeyring(ctx.store)();
  const addArdentOnly = Object.keys(extra).length === 0;
  for (const r of radii(start)) {
    const [res, fromArdent, fromEdcn] = await Promise.all([
      spanshPost("stations/search", {
        filters: {
          ...extra,
          distance: { min: "0", max: String(r) },
          market: [{ name: mineral, demand: { value: [String(minDemand), "1000000000"], comparison: "<=>" } }],
        },
        sort: [{ distance: { direction: "asc" } }],
        size: 100,
        page: 0,
        ...where(ctx),
      }),
      id && system ? ardentSellQuotes(system, id, r, maxAgeDays, minDemand) : Promise.resolve(new Map()),
      id ? edcnQuotes(edcn, reference, id, false, r) : Promise.resolve(new Map()),
    ]);
    // For each market, the most recent of Ardent's and EDCN's (EDCN's: only with its key).
    const ardent = newestZoneQuotes(fromArdent, fromEdcn);
    const spots: SellSpot[] = [];
    const seen = new Set<number>();
    for (const s of (res?.results ?? []) as Json[]) {
      const found = ((s.market ?? []) as Json[]).find(
        (x) => String(x.commodity).toLowerCase() === mineral.toLowerCase(),
      );
      if (!found || !found.sell_price) continue;
      seen.add(Number(s.market_id));
      const quote = freshestQuote(
        {
          price: Number(found.sell_price),
          demand: Number(found.demand ?? 0),
          updated: s.market_updated_at ?? s.updated_at,
          source: "spansh",
        },
        ardent.get(Number(s.market_id)),
      );
      if (!meetsDemand(quote, minDemand) || !recentEnough(quote.updated, maxAgeDays)) continue;
      spots.push({
        mineral,
        station: String(s.name ?? ""),
        system: String(s.system_name ?? ""),
        price: quote.price,
        demand: quote.demand,
        distance: typeof s.distance === "number" ? s.distance : undefined,
        arrival: typeof s.distance_to_arrival === "number" ? s.distance_to_arrival : undefined,
        largePad: Boolean(s.has_large_pad),
        state: s.system_power_state,
        updated: quote.updated,
        source: quote.source,
      });
    }
    if (addArdentOnly)
      for (const quote of ardent.values()) {
        if (seen.has(quote.marketId)) continue;
        const asQuote = { ...quote, source: quote.source ?? ("ardent" as const) };
        if (!meetsDemand(asQuote, minDemand) || !recentEnough(quote.updated, maxAgeDays)) continue;
        spots.push({
          mineral,
          station: quote.station,
          system: quote.system,
          price: quote.price,
          demand: quote.demand,
          distance: quote.distance,
          arrival: quote.arrival,
          largePad: quote.padSize === 3,
          updated: quote.updated,
          source: asQuote.source,
        });
      }
    if (spots.length) return { spots: spots.sort(bestRecentFirst), radius: r, widened: r > start };
  }
  return { spots: [], radius: MAX_RADIUS, widened: true };
}

export const spanshBodyUrl = (id64: number) => `https://spansh.co.uk/body/${id64}`;
