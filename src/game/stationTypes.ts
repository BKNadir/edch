// Kinds of stations, from the type the journal or Spansh gives ("Orbis", "Orbis Starport",
// "CraterOutpost", "Drake-Class Carrier"…). Used to show each station's icon.

/** The kinds of stations EDCH draws an icon for. */
export type StationKind =
  | "coriolis"
  | "orbis"
  | "ocellus"
  | "dodec"
  | "asteroidBase"
  | "outpost"
  | "megaship"
  | "fleetCarrier"
  | "squadronCarrier"
  | "installation"
  | "planetaryPort"
  | "planetaryOutpost"
  | "settlement"
  | "constructionDepot";

/**
 * Patterns tried in order (the first that matches wins): the journal writes "CraterOutpost",
 * Spansh "Planetary Outpost", so spaces are ignored; "outpost" comes after the planetary ones.
 */
const STATION_PATTERNS: [RegExp, StationKind][] = [
  [/construction/, "constructionDepot"],
  [/squadron/, "squadronCarrier"],
  [/carrier/, "fleetCarrier"],
  [/coriolis/, "coriolis"],
  [/orbis/, "orbis"],
  [/ocellus|bernal/, "ocellus"],
  [/dodec/, "dodec"],
  [/asteroid/, "asteroidBase"],
  [/mega/, "megaship"],
  [/crateroutpost|planetaryoutpost/, "planetaryOutpost"],
  [/craterport|planetaryport|surfacestation|surfaceport/, "planetaryPort"],
  [/settlement/, "settlement"],
  [/outpost/, "outpost"],
  [/installation/, "installation"],
];

/** The kind of a station from its type as the journal or Spansh writes it; undefined if unknown. */
export function stationKind(type: unknown): StationKind | undefined {
  if (typeof type !== "string") return undefined;
  const plain = type.toLowerCase().replace(/[\s_-]+/g, "");
  return STATION_PATTERNS.find(([pattern]) => pattern.test(plain))?.[1];
}
