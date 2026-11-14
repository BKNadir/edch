// Search page: how its station results are ordered and filtered once received. Spansh is asked for
// the nearest stations (more of them when sorting on something else than distance) and Ardent for
// the best prices of the whole zone (buying and selling); this puts them in the order chosen.

/** What a station result is sorted on. */
export type StationSort = "price" | "distance" | "volume" | "recent" | "arrival";

/** The sorts each kind of search offers, the first one being its default. */
export const STATION_SORTS = {
  buy: ["price", "distance", "volume", "recent", "arrival"],
  sell: ["price", "distance", "volume", "recent", "arrival"],
  ship: ["distance", "price", "arrival"],
  module: ["distance", "arrival"],
  service: ["distance", "arrival"],
} as const satisfies Record<string, readonly StationSort[]>;

/** Choices offered for the largest distance from the arrival star, in light seconds (0: any). */
export const ARRIVAL_CHOICES = [0, 1_000, 5_000, 10_000, 50_000] as const;

/** What a result is sorted on (numbers missing when unknown). */
export interface SortableStation {
  /** Price in credits (bought from or sold to the market). */
  price?: number;
  /** Tonnes in stock when buying, wanted when selling. */
  volume?: number;
  /** Light years from the reference system. */
  distance?: number;
  /** Light seconds from the arrival star. */
  arrival?: number;
  /** When the station's data was last seen (ms since 1970). */
  seen?: number;
}

const last = (n: number | undefined, high: boolean) =>
  n === undefined || Number.isNaN(n) ? (high ? -Infinity : Infinity) : n;

/**
 * The order for `sort`: lowest price when buying (or for a ship), highest when selling; nearest
 * first for distances; largest volume and most recent first. Unknown values go last, and equal
 * ones are ordered by price, then by how recent they are.
 */
export function stationOrder(sort: StationSort, buying: boolean) {
  const cheapFirst = (a: SortableStation, b: SortableStation) =>
    buying ? last(a.price, false) - last(b.price, false) : last(b.price, true) - last(a.price, true);
  const recentFirst = (a: SortableStation, b: SortableStation) => last(b.seen, true) - last(a.seen, true);
  const by: Record<StationSort, (a: SortableStation, b: SortableStation) => number> = {
    price: cheapFirst,
    distance: (a, b) => last(a.distance, false) - last(b.distance, false),
    volume: (a, b) => last(b.volume, true) - last(a.volume, true),
    recent: recentFirst,
    arrival: (a, b) => last(a.arrival, false) - last(b.arrival, false),
  };
  return (a: SortableStation, b: SortableStation) => by[sort](a, b) || cheapFirst(a, b) || recentFirst(a, b);
}

/** Whether a station is close enough to its arrival star (`maxLs` 0: any distance; unknown: kept). */
export const arrivalAllowed = (arrival: number | undefined, maxLs: number) =>
  !(maxLs > 0) || arrival === undefined || arrival <= maxLs;
