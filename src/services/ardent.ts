// Ardent Insight (api.ardent-insight.com): commodity prices collected from EDDN, like Spansh's but
// gathered separately. EDCH asks it only when looking for where to sell or buy a commodity, to
// compare each market's price with Spansh's, keep the most recent one, and add recent markets
// Spansh's answer missed.

import { ardentGet } from "../platform/bridge.js";
import { log } from "../platform/logger.js";

/** Ardent answers up to this distance around a system. */
export const ARDENT_MAX_DISTANCE = 500;

/** One market trading a commodity, as Ardent last saw it. */
export interface ArdentQuote {
  marketId: number;
  /** What the market pays per tonne (selling), or asks (buying). */
  price: number;
  /** Tonnes the market wants (selling), or has in stock (buying). */
  demand: number;
  /** When the market was last seen (ISO date). */
  updated: string;
  station: string;
  system: string;
  /** The game's station type ("Coriolis", "FleetCarrier", "CraterOutpost"…). */
  stationType: string;
  /** Largest landing pad: 1 small, 2 medium, 3 large (0 unknown). */
  padSize: number;
  /** Light years from the reference system, when Ardent gives it. */
  distance?: number;
  /** Light seconds from the arrival star. */
  arrival?: number;
}

/**
 * Turns Ardent's rows into quotes by market id, for selling to the markets (their sell price and
 * demand) or buying from them (`buying`: buy price and stock). Rows without a market or a price are
 * left out.
 */
export function ardentQuotesOf(rows: unknown, buying = false): Map<number, ArdentQuote> {
  const quotes = new Map<number, ArdentQuote>();
  if (!Array.isArray(rows)) return quotes;
  for (const row of rows) {
    const marketId = Number(row?.marketId);
    const price = Number(buying ? row?.buyPrice : row?.sellPrice);
    if (!Number.isFinite(marketId) || !(price > 0) || typeof row?.updatedAt !== "string") continue;
    quotes.set(marketId, {
      marketId,
      price,
      demand: Number((buying ? row.stock : row.demand) ?? 0),
      updated: row.updatedAt,
      station: String(row.stationName ?? ""),
      system: String(row.systemName ?? ""),
      stationType: String(row.stationType ?? ""),
      padSize: Number(row.maxLandingPadSize ?? 0) || 0,
      distance: typeof row.distance === "number" ? row.distance : undefined,
      arrival: typeof row.distanceToArrival === "number" ? row.distanceToArrival : undefined,
    });
  }
  return quotes;
}

/**
 * Markets buying `commodityId` (the game's symbol, "lowtemperaturediamond") in `system` and up to
 * `maxDistance` light years around it, wanting at least `minDemand` tonnes, seen within `maxDays`
 * days. Empty when Ardent can't answer: Spansh's prices stay.
 */
export function ardentSellQuotes(
  system: string,
  commodityId: string,
  maxDistance: number,
  maxDays: number,
  minDemand = 1,
): Promise<Map<number, ArdentQuote>> {
  return ardentQuotes("imports", system, commodityId, maxDistance, maxDays, minDemand);
}

/** Markets selling `commodityId` with at least `minStock` tonnes, as ardentSellQuotes. */
export function ardentBuyQuotes(
  system: string,
  commodityId: string,
  maxDistance: number,
  maxDays: number,
  minStock = 1,
): Promise<Map<number, ArdentQuote>> {
  return ardentQuotes("exports", system, commodityId, maxDistance, maxDays, minStock);
}

async function ardentQuotes(
  side: "imports" | "exports",
  system: string,
  commodityId: string,
  maxDistance: number,
  maxDays: number,
  minVolume: number,
): Promise<Map<number, ArdentQuote>> {
  const buying = side === "exports";
  const base = `system/name/${encodeURIComponent(system)}/commodity/name/${encodeURIComponent(commodityId)}`;
  const distance = Math.max(1, Math.min(ARDENT_MAX_DISTANCE, Math.ceil(maxDistance)));
  const days = Math.max(1, Math.ceil(maxDays));
  const volume = Math.max(1, Math.floor(minVolume));
  try {
    // "nearby" leaves out the system itself, asked apart.
    const [here, nearby] = await Promise.all([
      ardentGet(`${base}?maxDaysAgo=${days}`),
      ardentGet(`${base}/nearby/${side}?minVolume=${volume}&maxDistance=${distance}&maxDaysAgo=${days}`),
    ]);
    const quotes = ardentQuotesOf(nearby, buying);
    for (const [id, quote] of ardentQuotesOf(here, buying)) quotes.set(id, { ...quote, distance: 0 });
    log.debug("ardent", `${commodityId} ${side}: ${quotes.size} market(s) within ${distance} ly, ${days} day(s)`);
    return quotes;
  } catch (error) {
    log.warn("ardent", `${commodityId}: no Ardent prices (${String((error as Error)?.message ?? error)}), Spansh only`);
    return new Map();
  }
}
