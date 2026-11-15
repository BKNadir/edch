// Search → Systems: systems around the reference system that match a few criteria (a star type
// among their bodies, Powerplay, allegiance, government, economy, security, the controlling
// faction's state, a station type, a minimum number of bodies), nearest first (Spansh).
//
// The field names and values are the ones Spansh's systems search takes
// (spansh.co.uk/api/systems/searchable_fields and …/field_values/<field>).

import { gameName, t } from "../platform/i18n.js";
import { spanshPost } from "../platform/bridge.js";
import {
  fmtPop,
  inaraSystem,
  num,
  recentEnoughDate,
  reference,
  type FinderResult,
  type Reference,
  type ResultRow,
} from "./spansh.js";

/** What a system must have; an empty or missing criterion doesn't filter. */
export interface SystemCriteria {
  /** A star of this kind among the system's bodies ("Neutron Star"). */
  starType?: string;
  /** The Powerplay power controlling the system. */
  power?: string;
  /** Its Powerplay state ("Fortified"). */
  powerState?: string;
  allegiance?: string;
  government?: string;
  /** The primary economy. */
  economy?: string;
  security?: string;
  /** The state of the faction controlling the system ("Boom"). */
  factionState?: string;
  /** A station of this type in the system ("Orbis Starport"). */
  stationType?: string;
  /** At least this many bodies. */
  minBodies?: number;
}

/** Star types Spansh knows, most sought first. */
export const STAR_TYPES = [
  "Neutron Star",
  "White Dwarf (DA) Star",
  "Black Hole",
  "O (Blue-White) Star",
  "B (Blue-White) Star",
  "A (Blue-White) Star",
  "F (White) Star",
  "G (White-Yellow) Star",
  "K (Yellow-Orange) Star",
  "M (Red dwarf) Star",
  "M (Red giant) Star",
  "L (Brown dwarf) Star",
  "T (Brown dwarf) Star",
  "Y (Brown dwarf) Star",
  "T Tauri Star",
  "Herbig Ae/Be Star",
  "Wolf-Rayet Star",
  "C Star",
  "S-type Star",
  "Supermassive Black Hole",
];

export const POWERS = [
  "A. Lavigny-Duval",
  "Aisling Duval",
  "Archon Delaine",
  "Denton Patreus",
  "Edmund Mahon",
  "Felicia Winters",
  "Jerome Archer",
  "Li Yong-Rui",
  "Nakato Kaine",
  "Pranav Antal",
  "Yuri Grom",
  "Zemina Torval",
];

export const POWER_STATES = ["Stronghold", "Fortified", "Exploited", "Unoccupied"];

export const ALLEGIANCES = ["Alliance", "Empire", "Federation", "Independent", "Guardian", "Thargoid"];

export const GOVERNMENTS = [
  "Anarchy",
  "Communism",
  "Confederacy",
  "Cooperative",
  "Corporate",
  "Democracy",
  "Dictatorship",
  "Feudal",
  "Patronage",
  "Prison Colony",
  "Theocracy",
];

export const ECONOMIES = [
  "Agriculture",
  "Colony",
  "Extraction",
  "High Tech",
  "Industrial",
  "Military",
  "Refinery",
  "Service",
  "Terraforming",
  "Tourism",
];

export const SECURITIES = ["High", "Medium", "Low", "Anarchy"];

/** A system's security in the app's language ("High" → "High security"), other values unchanged. */
export function securityLabel(value: string): string {
  const labels: Record<string, string> = {
    High: t("common.highSecurity"),
    Medium: t("common.mediumSecurity"),
    Low: t("common.lowSecurity"),
    Anarchy: t("common.anarchy"),
  };
  return labels[value] ?? gameName(value);
}

export const FACTION_STATES = [
  "Boom",
  "Bust",
  "Civil Liberty",
  "Civil Unrest",
  "Civil War",
  "Election",
  "Expansion",
  "Famine",
  "Investment",
  "Lockdown",
  "Outbreak",
  "Pirate Attack",
  "Retreat",
  "War",
];

export const SYSTEM_STATION_TYPES = [
  "Coriolis Starport",
  "Orbis Starport",
  "Ocellus Starport",
  "Dodec Starport",
  "Asteroid base",
  "Outpost",
  "Planetary Port",
  "Planetary Outpost",
  "Settlement",
  "Mega ship",
];

/** Systems per page. */
export const SYSTEMS_PAGE_SIZE = 50;

const one = (value: string | undefined) => (value ? { value: [value] } : undefined);

/** The Spansh filters for `criteria` within `range` light years. */
export function systemFilters(criteria: SystemCriteria, range: number): Record<string, unknown> {
  const filters: Record<string, unknown> = { distance: { min: "0", max: String(range) } };
  const put = (field: string, value: unknown) => value !== undefined && (filters[field] = value);
  put("bodies", criteria.starType ? [{ type: one("Star"), subtype: one(criteria.starType) }] : undefined);
  put("controlling_power", one(criteria.power));
  put("power_state", one(criteria.powerState));
  put("allegiance", one(criteria.allegiance));
  put("government", one(criteria.government));
  put("primary_economy", one(criteria.economy));
  put("security", one(criteria.security));
  put("controlling_minor_faction_state", one(criteria.factionState));
  put("stations", criteria.stationType ? [{ type: one(criteria.stationType) }] : undefined);
  if (criteria.minBodies && criteria.minBodies > 0)
    filters.body_count = { min: String(Math.floor(criteria.minBodies)), max: "100000" };
  return filters;
}

/** A Spansh system as a result line: its main star, Powerplay, economy, bodies and stations. */
export function systemRow(r: any, criteria: SystemCriteria, maxAgeDays?: number): ResultRow {
  const bodies: any[] = Array.isArray(r.bodies) ? r.bodies : [];
  const stations: any[] = Array.isArray(r.stations) ? r.stations : [];
  const mainStar = bodies.find((b) => b?.is_main_star)?.subtype;
  const badges: ResultRow["badges"] = [];
  if (mainStar) badges.push({ text: gameName(mainStar), tone: mainStar === criteria.starType ? "hit" : "muted" });
  if (criteria.starType && mainStar !== criteria.starType)
    badges.push({ text: gameName(criteria.starType), tone: "hit" });
  if (r.controlling_power)
    badges.push({
      text: [r.controlling_power, r.power_state && gameName(r.power_state)].filter(Boolean).join(" · "),
      tone: criteria.power || criteria.powerState ? "hit" : "muted",
    });
  if (r.controlling_minor_faction_state && r.controlling_minor_faction_state !== "None")
    badges.push({
      text: gameName(r.controlling_minor_faction_state),
      tone: criteria.factionState ? "hit" : "muted",
    });
  if (maxAgeDays && !recentEnoughDate(r.updated_at, maxAgeDays))
    badges.push({ text: t("spansh.oldData"), tone: "warn" });
  const sub: string[] = [];
  const politics = [r.allegiance, r.government, r.primary_economy]
    .filter((v) => typeof v === "string" && v && v !== "None")
    .map((v) => gameName(v));
  if (typeof r.security === "string" && r.security) politics.push(securityLabel(r.security));
  if (politics.length) sub.push(politics.join(" · "));
  if (num(r.population) > 0) sub.push(fmtPop(num(r.population)));
  if (num(r.body_count) > 0) sub.push(t("search.systemBodies", { count: num(r.body_count) }));
  if (stations.length) sub.push(t("search.systemStations", { count: stations.length }));
  return {
    system: r.name,
    title: r.name,
    distance: num(r.distance),
    sub,
    badges,
    links: [
      ...(r.id64 ? [{ label: "Spansh", url: `https://spansh.co.uk/system/${r.id64}` }] : []),
      { label: "Inara", url: inaraSystem(r.name) },
    ],
    updated: r.updated_at,
  };
}

/** One page (SYSTEMS_PAGE_SIZE systems) of the systems matching `criteria`, nearest to `ref` first. */
export async function searchSystems(
  criteria: SystemCriteria,
  ref: Reference,
  range: number,
  page: number,
  maxAgeDays?: number,
): Promise<FinderResult> {
  const data: any = await spanshPost("systems/search", {
    filters: systemFilters(criteria, range),
    sort: [{ distance: { direction: "asc" } }],
    size: SYSTEMS_PAGE_SIZE,
    page,
    ...reference(ref),
  });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return { rows: results.map((r) => systemRow(r, criteria, maxAgeDays)), total: num(data?.count) || results.length };
}
