// Where to mine a mineral (ring hotspots, with the planet, the ring type and the ring's reserve)
// and where to sell it. When nothing is found within the search radius, the radius grows (up to
// MAX_RADIUS) so the commander knows how far the nearest spot is.

import { spanshPost } from "./bridge.js";
import { referenceOf, type Ctx } from "./context.js";
import { t } from "./i18n.js";

type Json = Record<string, any>;

/** How a mineral is mined. */
export type MiningMethod = "laser" | "core" | "subsurface";

const LASER = new Set([
  "Platinum", "Painite", "Osmium", "Palladium", "Gold", "Silver", "Bertrandite", "Indite", "Gallite", "Coltan", "Uraninite", "Lepidolite",
  "Samarium", "Praseodymium", "Bauxite", "Rutile", "Cobalt", "Lithium Hydroxide", "Methane Clathrate", "Methanol Monohydrate Crystals",
  "Liquid oxygen", "Water", "Hydrogen Peroxide", "Tritium", "Low Temperature Diamonds", "Bromellite",
]);
const CORE = new Set(["Alexandrite", "Benitoite", "Bromellite", "Grandidierite", "Low Temperature Diamonds", "Monazite", "Musgravite", "Painite", "Rhodplumsite", "Serendibite", "Void Opal"]);
const SUBSURFACE = new Set([...CORE, "Platinum"]);

export function miningMethods(mineral: string): MiningMethod[] {
  const out: MiningMethod[] = [];
  if (LASER.has(mineral)) out.push("laser");
  if (SUBSURFACE.has(mineral)) out.push("subsurface");
  if (CORE.has(mineral)) out.push("core");
  return out;
}

export const METHOD_LABEL: Record<MiningMethod, string> = {
  laser: t("miningSpots.laserSurface"),
  subsurface: t("miningSpots.subsurfaceDisplacementMissiles"),
  core: t("miningSpots.coreSeismicCharges"),
};

/** Ring types as the game names them. */
export const RING_TYPE: Record<string, string> = { Metallic: t("miningSpots.metallic"), "Metal Rich": t("miningSpots.metalRich"), Rocky: t("miningSpots.rocky"), Icy: t("miningSpots.icy") };
export const RESERVE: Record<string, string> = { Pristine: t("miningSpots.pristine"), Major: t("miningSpots.major"), Common: t("miningSpots.common"), Low: t("miningSpots.low"), Depleted: t("miningSpots.depleted") };

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
  return ref.coords ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } } : { reference_system: ref.system };
};

/** Ring hotspots of `mineral`, nearest first; `radius` is the radius that gave results. */
export async function findRingSpots(ctx: Ctx, mineral: string, extra: Json = {}): Promise<{ spots: RingSpot[]; radius: number; widened: boolean }> {
  const start = ctx.store.state.settings.maxDistance;
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
        const sig = ((ring.signals ?? []) as Json[]).find((x) => String(x.name).toLowerCase() === mineral.toLowerCase());
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

/** Stations buying `mineral`, best price first; `radius` is the radius that gave results. */
export async function findSellSpots(ctx: Ctx, mineral: string, extra: Json = {}): Promise<{ spots: SellSpot[]; radius: number; widened: boolean }> {
  const start = ctx.store.state.settings.maxDistance;
  for (const r of radii(start)) {
    const res = await spanshPost("stations/search", {
      filters: { ...extra, distance: { min: "0", max: String(r) }, market: [{ name: mineral, demand: { value: ["1", "1000000000"], comparison: "<=>" } }] },
      sort: [{ distance: { direction: "asc" } }],
      size: 100,
      page: 0,
      ...where(ctx),
    });
    const spots: SellSpot[] = [];
    for (const s of (res?.results ?? []) as Json[]) {
      const quote = ((s.market ?? []) as Json[]).find((x) => String(x.commodity).toLowerCase() === mineral.toLowerCase());
      if (!quote || !quote.sell_price) continue;
      spots.push({
        mineral,
        station: String(s.name ?? ""),
        system: String(s.system_name ?? ""),
        price: Number(quote.sell_price),
        demand: Number(quote.demand ?? 0),
        distance: typeof s.distance === "number" ? s.distance : undefined,
        arrival: typeof s.distance_to_arrival === "number" ? s.distance_to_arrival : undefined,
        largePad: Boolean(s.has_large_pad),
        state: s.system_power_state,
        updated: s.market_updated_at ?? s.updated_at,
      });
    }
    if (spots.length) return { spots: spots.sort((a, b) => b.price - a.price), radius: r, widened: r > start };
  }
  return { spots: [], radius: MAX_RADIUS, widened: true };
}

export const spanshBodyUrl = (id64: number) => `https://spansh.co.uk/body/${id64}`;
