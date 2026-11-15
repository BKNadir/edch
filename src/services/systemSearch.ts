// Search → Systems: systems that match a few criteria (a name or its beginning, a star type and a
// body type among their bodies, a volcanism, Powerplay, allegiance, government, economy, security,
// the controlling faction's state, a station type, a minimum number of bodies), nearest first
// (Spansh). Within the range, or anywhere when a name is typed.
//
// The field names and values are the ones Spansh's systems search takes
// (spansh.co.uk/api/systems/searchable_fields and …/field_values/<field>).

import { fold, gameName, t } from "../platform/i18n.js";
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
  /** The system's name or its beginning ("LHS" finds every LHS system); the range then no longer applies. */
  name?: string;
  /** A planet of this kind among the system's bodies ("Earth-like world"). */
  bodyType?: string;
  /**
   * A body with this volcanism ("Major Silicate Vapour Geysers"), or ANY_VOLCANISM. Spansh only
   * filters volcanism on bodies: the systems are found from their bodies first.
   */
  volcanism?: string;
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

/** Planet kinds Spansh knows, most sought first. */
export const BODY_TYPES = [
  "Earth-like world",
  "Water world",
  "Ammonia world",
  "Water giant",
  "High metal content world",
  "Metal-rich body",
  "Rocky body",
  "Rocky Ice world",
  "Icy body",
  "Class I gas giant",
  "Class II gas giant",
  "Class III gas giant",
  "Class IV gas giant",
  "Class V gas giant",
  "Gas giant with water-based life",
  "Gas giant with ammonia-based life",
  "Helium-rich gas giant",
  "Helium gas giant",
];

/** Volcanism values Spansh knows (bodies/field_values/volcanism_type), "No volcanism" left out. */
export const VOLCANISMS = [
  "Carbon Dioxide Geysers",
  "Major Carbon Dioxide Geysers",
  "Minor Carbon Dioxide Geysers",
  "Silicate Vapour Geysers",
  "Major Silicate Vapour Geysers",
  "Minor Silicate Vapour Geysers",
  "Water Geysers",
  "Major Water Geysers",
  "Minor Water Geysers",
  "Metallic Magma",
  "Major Metallic Magma",
  "Minor Metallic Magma",
  "Rocky Magma",
  "Major Rocky Magma",
  "Minor Rocky Magma",
  "Water Magma",
  "Major Water Magma",
  "Minor Water Magma",
  "Minor Ammonia Magma",
  "Minor Methane Magma",
  "Minor Nitrogen Magma",
];

/** The volcanism choice "any volcanism at all". */
export const ANY_VOLCANISM = "*";

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

/** Systems per Spansh request, and requests sent together. */
const SYSTEMS_PAGE_SIZE = 100;
const PARALLEL_PAGES = 3;

const one = (value: string | undefined) => (value ? { value: [value] } : undefined);

/** The Spansh filters for `criteria` within `range` light years. */
export function systemFilters(criteria: SystemCriteria, range: number): Record<string, unknown> {
  const name = criteria.name?.trim();
  // A name searches the whole galaxy: "LHS" finds every LHS system, nearest first.
  const filters: Record<string, unknown> = name
    ? { name: { value: name } }
    : { distance: { min: "0", max: String(range) } };
  const put = (field: string, value: unknown) => value !== undefined && (filters[field] = value);
  // Each entry is a body the system must have (Spansh wants them all).
  const bodies = [
    ...(criteria.starType ? [{ type: one("Star"), subtype: one(criteria.starType) }] : []),
    ...(criteria.bodyType ? [{ subtype: one(criteria.bodyType) }] : []),
  ];
  put("bodies", bodies.length ? bodies : undefined);
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

/** Bodies pages read at most to find the systems with a volcanism (100 bodies each). */
const VOLCANISM_PAGES = 5;

/** The bodies/search filters for a volcanism (and the planet kind, the name or the range). */
export function volcanismFilters(criteria: SystemCriteria, range: number): Record<string, unknown> {
  const name = criteria.name?.trim();
  return {
    ...(name ? { system_name: { value: name } } : { distance: { min: "0", max: String(range) } }),
    volcanism_type: { value: criteria.volcanism === ANY_VOLCANISM ? VOLCANISMS : [criteria.volcanism] },
    ...(criteria.bodyType ? { subtype: one(criteria.bodyType) } : {}),
  };
}

/** The id64 of the systems (nearest first) that have a body with the wanted volcanism. */
async function volcanicSystems(criteria: SystemCriteria, ref: Reference, range: number): Promise<string[]> {
  const ids = new Set<string>();
  for (let page = 0; page < VOLCANISM_PAGES; page++) {
    const data: any = await spanshPost("bodies/search", {
      filters: volcanismFilters(criteria, range),
      sort: [{ distance: { direction: "asc" } }],
      size: 100,
      page,
      ...reference(ref),
    });
    const bodies: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const b of bodies) if (b?.system_id64 != null) ids.add(String(b.system_id64));
    if (bodies.length < 100) break;
  }
  return [...ids];
}

/**
 * The systems matching `criteria`, nearest to `ref` first, up to `limit` (the "results loaded per
 * search" setting), asked once: the page shows them a page at a time without asking again.
 */
export async function searchSystems(
  criteria: SystemCriteria,
  ref: Reference,
  range: number,
  limit: number,
  maxAgeDays?: number,
): Promise<FinderResult> {
  const filters = systemFilters(criteria, range);
  if (criteria.volcanism) {
    // Spansh filters volcanism on bodies only: the systems with such a body, then the rest.
    const ids = await volcanicSystems(criteria, ref, range);
    if (!ids.length) return { rows: [], total: 0 };
    filters.id64 = { value: ids };
  }
  const page = (n: number): Promise<any> =>
    spanshPost("systems/search", {
      filters,
      sort: [{ distance: { direction: "asc" } }],
      size: SYSTEMS_PAGE_SIZE,
      page: n,
      ...reference(ref),
    });
  const answers: any[] = [await page(0)];
  const total = num(answers[0]?.count);
  const wanted = Math.min(Math.ceil(limit / SYSTEMS_PAGE_SIZE), Math.ceil(total / SYSTEMS_PAGE_SIZE));
  // The other pages a few at a time, so Spansh isn't flooded.
  for (let n = 1; n < wanted; n += PARALLEL_PAGES) {
    const batch = Array.from({ length: Math.min(PARALLEL_PAGES, wanted - n) }, (_, i) => n + i);
    answers.push(...(await Promise.all(batch.map(page))));
  }
  const results: any[] = answers.flatMap((a) => (Array.isArray(a?.results) ? a.results : [])).slice(0, limit);
  return { rows: results.map((r) => systemRow(r, criteria, maxAgeDays)), total: total || results.length };
}

/** A station of a system page. */
export interface SystemStation {
  name: string;
  /** Spansh's type ("Orbis Starport"). */
  type: string;
  /** Light seconds from the arrival star. */
  distance?: number;
  /** "L", "M", "S" or undefined when unknown. */
  largestPad?: "L" | "M" | "S";
  faction?: string;
  services: string[];
}

/** A minor faction present in the system. */
export interface SystemFaction {
  name: string;
  /** Percent, NaN when unknown. */
  influence: number;
  state?: string;
  allegiance?: string;
  government?: string;
  controls: boolean;
}

/** A star or planet of the system. */
export interface SystemBody {
  name: string;
  type: string;
  subtype: string;
  distance?: number;
  mainStar: boolean;
}

/** What the system page shows. */
export interface SystemDetails {
  name: string;
  id64?: string;
  coords?: [number, number, number];
  allegiance?: string;
  government?: string;
  economy?: string;
  secondEconomy?: string;
  security?: string;
  population: number;
  needsPermit: boolean;
  colonised?: boolean;
  beingColonised?: boolean;
  controllingFaction?: string;
  /** Powerplay: the controlling power and its state, the powers present, the cycle's progress. */
  power?: string;
  powerState?: string;
  powers: string[];
  /** 0–100, when Spansh has it. */
  controlProgress?: number;
  reinforcement?: number;
  undermining?: number;
  thargoidState?: string;
  bodyCount: number;
  bodies: SystemBody[];
  stations: SystemStation[];
  factions: SystemFaction[];
  updatedAt?: string;
}

const text = (v: unknown) => (typeof v === "string" && v && v !== "None" ? v : undefined);
/** A Spansh date ("2026-11-14 10:00:00+00") as ISO 8601, or undefined. */
const isoDate = (v: unknown) => {
  const raw = text(v);
  if (!raw) return undefined;
  const time = Date.parse(raw.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};
const finite = (v: unknown) => (Number.isFinite(num(v)) ? num(v) : undefined);

/** A Spansh systems/search record as the system page needs it. */
export function decodeSystemDetails(r: any): SystemDetails | null {
  const name = text(r?.name);
  if (!name) return null;
  const controller = text(r.controlling_minor_faction) ?? text(r.controlling_minor_faction?.name);
  const factions: SystemFaction[] = (Array.isArray(r.minor_faction_presences) ? r.minor_faction_presences : [])
    .filter((f: any) => text(f?.name))
    .map((f: any) => {
      const value = finite(f.influence);
      return {
        name: f.name,
        influence: value === undefined ? NaN : Math.round((value <= 1 ? value * 100 : value) * 10) / 10,
        state: text(f.state),
        allegiance: text(f.allegiance),
        government: text(f.government),
        controls: f.name === controller,
      };
    })
    .sort((a: SystemFaction, b: SystemFaction) => (b.influence || 0) - (a.influence || 0));
  const stations: SystemStation[] = (Array.isArray(r.stations) ? r.stations : [])
    .filter((s: any) => text(s?.name))
    .map((s: any) => ({
      name: s.name,
      type: text(s.type) ?? "",
      distance: finite(s.distance_to_arrival),
      largestPad:
        num(s.large_pads) > 0 || s.has_large_pad
          ? "L"
          : num(s.medium_pads) > 0
            ? "M"
            : num(s.small_pads) > 0
              ? "S"
              : undefined,
      faction: text(s.controlling_minor_faction),
      services: Array.isArray(s.services) ? s.services.filter((x: unknown) => typeof x === "string") : [],
    }))
    .sort((a: SystemStation, b: SystemStation) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const bodies: SystemBody[] = (Array.isArray(r.bodies) ? r.bodies : [])
    .filter((b: any) => text(b?.name))
    .map((b: any) => ({
      name: b.name,
      type: text(b.type) ?? "",
      subtype: text(b.subtype) ?? "",
      distance: finite(b.distance_to_arrival),
      mainStar: Boolean(b.is_main_star),
    }))
    .sort((a: SystemBody, b: SystemBody) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  const progress = finite(r.power_state_control_progress);
  const coords = [r.x, r.y, r.z].map(num);
  return {
    name,
    id64: r.id64 == null ? undefined : String(r.id64),
    coords: coords.every(Number.isFinite) ? (coords as [number, number, number]) : undefined,
    allegiance: text(r.allegiance),
    government: text(r.government),
    economy: text(r.primary_economy),
    secondEconomy: text(r.secondary_economy),
    security: text(r.security),
    population: finite(r.population) ?? 0,
    needsPermit: Boolean(r.needs_permit),
    colonised: typeof r.is_colonised === "boolean" ? r.is_colonised : undefined,
    beingColonised: Boolean(r.is_being_colonised),
    controllingFaction: controller,
    power: text(r.controlling_power),
    powerState: text(r.power_state),
    powers: Array.isArray(r.power) ? r.power.filter((p: unknown) => typeof p === "string") : [],
    controlProgress:
      progress === undefined ? undefined : Math.round((progress <= 1 ? progress * 100 : progress) * 10) / 10,
    reinforcement: finite(r.power_state_reinforcement),
    undermining: finite(r.power_state_undermining),
    thargoidState: text(r.thargoid_war_state),
    bodyCount: finite(r.body_count) ?? bodies.length,
    bodies,
    stations,
    factions,
    updatedAt: isoDate(r.updated_at),
  };
}

/**
 * The system named `name` (any capitals), with its bodies, stations and factions, or null.
 * Spansh's name filter ignores capitals but also returns similar names: the exact one is kept.
 */
export async function systemDetails(name: string): Promise<SystemDetails | null> {
  const wanted = name.trim();
  if (!wanted) return null;
  const data: any = await spanshPost("systems/search", { filters: { name: { value: wanted } }, size: 10, page: 0 });
  const records: any[] = Array.isArray(data?.results) ? data.results : [];
  const same = (r: any) => typeof r?.name === "string" && fold(r.name) === fold(wanted);
  const record = records.find(same);
  return record ? decodeSystemDetails(record) : null;
}

/** A body of the system page's detail: rings, reserve, landing, atmosphere and signals. */
export interface BodyDetail {
  name: string;
  type: string;
  subtype: string;
  /** Light seconds from the arrival star. */
  distance?: number;
  landable: boolean;
  /** Spansh's atmosphere ("Thin Ammonia"), undefined when none. */
  atmosphere?: string;
  /** Surface gravity in g, when known. */
  gravity?: number;
  /** Ring types ("Icy", "Metal Rich"…), one per ring. */
  rings: string[];
  /** Reserve level of the rings ("Pristine"…). */
  reserve?: string;
  /** Signals on the body or its rings: name ("Biological", "Platinum"…) and count. */
  signals: { name: string; count: number }[];
}

/** Bodies per Spansh page, and pages read at most (the largest systems have a few hundred). */
const BODY_PAGE = 100;
const BODY_PAGES = 5;

/** A Spansh bodies/search record as the system page needs it. */
export function decodeBodyDetail(b: any): BodyDetail | null {
  const name = text(b?.name);
  if (!name) return null;
  const rings: any[] = Array.isArray(b.rings) ? b.rings : [];
  const signals = [
    ...(Array.isArray(b.signals) ? b.signals : []),
    ...rings.flatMap((r) => (Array.isArray(r?.signals) ? r.signals : [])),
  ]
    .filter((s: any) => text(s?.name) && num(s?.count) > 0)
    .map((s: any) => ({ name: String(s.name), count: num(s.count) }));
  return {
    name,
    type: text(b.type) ?? "",
    subtype: text(b.subtype) ?? "",
    distance: finite(b.distance_to_arrival),
    landable: Boolean(b.is_landable),
    atmosphere: text(b.atmosphere) && !/^no atmosphere$/i.test(b.atmosphere) ? b.atmosphere : undefined,
    gravity: finite(b.gravity),
    rings: rings.map((r) => text(r?.type)).filter((x): x is string => Boolean(x)),
    reserve: text(b.reserve_level),
    signals,
  };
}

/** Every body of the system `id64` with its rings, landing and signals, nearest to the star first. */
export async function systemBodies(id64: string): Promise<BodyDetail[]> {
  const bodies: BodyDetail[] = [];
  for (let page = 0; page < BODY_PAGES; page++) {
    const data: any = await spanshPost("bodies/search", {
      filters: { system_id64: { value: [id64] } },
      sort: [{ distance_to_arrival: { direction: "asc" } }],
      size: BODY_PAGE,
      page,
    });
    const records: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const record of records) {
      const body = decodeBodyDetail(record);
      if (body) bodies.push(body);
    }
    if (records.length < BODY_PAGE) break;
  }
  return bodies;
}
