// Where to sell or buy a commodity: Spansh, Ardent and EDCN all collect market prices from EDDN,
// each with its own delays. For every market they know, the most recently seen price wins.

import type { ArdentQuote } from "../../services/ardent.js";
import { validDataAge } from "../../state/dataAge.js";

/** Which site a price comes from. */
export type QuoteSource = "spansh" | "ardent" | "edcn";

/** Names shown next to a price (site names, the same in every language). */
export const QUOTE_SOURCE_LABELS: Record<QuoteSource, string> = {
  spansh: "Spansh",
  ardent: "Ardent",
  edcn: "EDCN",
};

/** A market's price for a commodity. */
export interface MarketQuote {
  price: number;
  /** Tonnes the market wants (selling), or has in stock (buying). */
  demand: number;
  /** When the market was last seen (ISO date), when known. */
  updated?: string;
  source: QuoteSource;
}

/** A date from Spansh ("2026-11-14 20:01:02+00") or Ardent ("2026-11-14T20:01:02.000Z"), in ms. */
export function quoteTime(updated: string | undefined): number {
  if (!updated) return Number.NEGATIVE_INFINITY;
  let iso = updated.trim().replace(" ", "T");
  if (/:\d\d(\.\d+)?[+-]\d\d$/.test(iso)) iso += ":00";
  else if (!/([zZ]|[+-]\d\d:?\d\d)$/.test(iso)) iso += "Z";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** Spansh's quote, or Ardent's (or EDCN's) when it saw the market more recently. */
export function freshestQuote(spansh: MarketQuote, ardent: ArdentQuote | undefined): MarketQuote {
  if (!ardent || quoteTime(ardent.updated) <= quoteTime(spansh.updated)) return spansh;
  return { price: ardent.price, demand: ardent.demand, updated: ardent.updated, source: ardent.source ?? "ardent" };
}

/**
 * Ardent's and EDCN's quotes of a zone as one: for a market both know, the one that saw it more
 * recently (Ardent's when as recent).
 */
export function newestZoneQuotes(...zones: Map<number, ArdentQuote>[]): Map<number, ArdentQuote> {
  const newest = new Map<number, ArdentQuote>();
  for (const zone of zones)
    for (const [marketId, quote] of zone) {
      const known = newest.get(marketId);
      if (!known || quoteTime(quote.updated) > quoteTime(known.updated)) newest.set(marketId, quote);
    }
  return newest;
}

/** Whether a quote still wants at least `minDemand` tonnes. */
export const meetsDemand = (quote: MarketQuote, minDemand: number) => quote.demand >= Math.max(1, minDemand);

/** Whether a price was seen within the last `maxDays` days; an unknown date is too old. */
export function recentEnough(updated: string | undefined, maxDays: number, now = Date.now()): boolean {
  return now - quoteTime(updated) <= validDataAge(maxDays) * 86_400_000;
}

/** Best price first; between equal prices, the most recently seen first. */
export function bestRecentFirst(a: MarketQuote, b: MarketQuote): number {
  return b.price - a.price || quoteTime(b.updated) - quoteTime(a.updated);
}

/** Ardent's station types (the game's) with Spansh's names, for stations only Ardent returned. */
export const ARDENT_STATION_TYPES: Record<string, string> = {
  AsteroidBase: "Asteroid base",
  Bernal: "Ocellus Starport",
  Coriolis: "Coriolis Starport",
  CraterOutpost: "Planetary Outpost",
  CraterPort: "Planetary Port",
  Dodec: "Dodec Starport",
  FleetCarrier: "Drake-Class Carrier",
  MegaShip: "Mega ship",
  Ocellus: "Ocellus Starport",
  OnFootSettlement: "Settlement",
  Orbis: "Orbis Starport",
  Outpost: "Outpost",
  PlanetaryConstructionDepot: "Planetary Construction Depot",
  SpaceConstructionDepot: "Space Construction Depot",
  SurfaceStation: "Surface Settlement",
};

/** Whether a station of Ardent's `stationType` passes the station choices of a search. */
export function ardentStationAllowed(
  quote: Pick<ArdentQuote, "stationType" | "padSize">,
  choices: { largePad: boolean; carriers: boolean; planetary: boolean },
): boolean {
  const type = quote.stationType;
  if (choices.largePad && quote.padSize !== 3) return false;
  if (!choices.carriers && type === "FleetCarrier") return false;
  if (!choices.planetary && /Crater|Settlement|Surface|Planetary/.test(type)) return false;
  return true;
}
