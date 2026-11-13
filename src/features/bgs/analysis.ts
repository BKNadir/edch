// The BGS page's logic: the followed faction's systems (from the journal's own visits, Spansh and
// EDSM, the newest data wins), their influence trend and forecast, what needs attention in each
// (expansion, retreat, a rival close behind, conflicts, a bad trend, old data, a system not
// visited for long), what to do there, the order to visit them in, and what the commander did
// for the faction. Pure functions.
// Credit: the patrol priority and the data-age rules follow Cyberpunk Philou's BGS prototype
// (pull request #2).

import type {
  BgsAction,
  FactionConflict,
  FactionPresence,
  InfluenceSample,
  SystemObservation,
} from "../../game/activity/bgs.js";
import type { Vec3 } from "../../game/journal/state.js";
import type { BgsHistory, KnownSystem, RemoteSource } from "../../state/bgsHistory.js";
import type { BgsShared, SharedSystem } from "../../state/bgsShared.js";

/** What needs attention in a system. */
export type BgsAlertKind =
  /** Influence high enough for the faction to expand. */
  | "expansion"
  /** Influence so low the faction may have to leave the system. */
  | "retreat"
  /** Another faction close behind (or ahead): a conflict can start. */
  | "rivalClose"
  /** A war, civil war or election, going on or coming. */
  | "conflict"
  /** The data is old: what is shown may have changed. */
  | "staleData"
  /** Nobody of yours went there for a while (your journal, and your squadron's through Discord). */
  | "notVisited"
  /** At the current trend, the faction falls under the retreat line or a rival passes it soon. */
  | "atRisk";

/** Influence (percent) from which a faction can expand. */
export const EXPANSION_AT = 75;
/** Influence (percent) under which a faction risks retreating from the system. */
export const RETREAT_BELOW = 5;
/** Influence points between two factions that make a conflict worth watching. */
export const RIVAL_GAP = 5;
/** Data older than this (days) is shown as old, and the system goes into the refresh tour. */
export const STALE_DAYS = 3;
/** A system not visited for this long (days) is flagged. */
export const NOT_VISITED_DAYS = 7;

const CONFLICT_STATES = new Set(["War", "CivilWar", "Civil war", "Election"]);
const DAY = 86_400_000;

/** Where private data comes from: your journal, or your squadron through its Discord bot. */
export type PrivateSource = "journal" | "discord";

/** One system of the followed faction, as the page shows it. */
export interface BgsSystemRow {
  system: string;
  coords?: Vec3;
  distance?: number;
  /** The followed faction's influence (percent), when known. */
  influence?: number;
  controls: boolean;
  controlling?: string;
  state: string;
  active: string[];
  pending: string[];
  recovering: string[];
  /**
   * The other faction closest in influence, and the gap in points (positive: we're ahead); the
   * forecast gap is the one expected in FORECAST_DAYS days at both factions' trends.
   */
  rival?: { name: string; influence: number; gap: number; forecastGap?: number };
  /** Average change of influence per day (points), over the last days' samples. */
  trend?: number;
  /** Influence expected in FORECAST_DAYS days at that trend (percent). */
  forecast?: number;
  /** When the shown data was observed, and by whom. */
  dataAt?: string;
  source: PrivateSource | RemoteSource;
  /** Your last visit (journal), if any in the journal kept. */
  lastVisit?: string;
  /**
   * The private data (not public): your journal's visit or, when newer, what a member of your
   * squadron saw, received from its Discord bot. Never sent to EDDN or anywhere public.
   */
  privateAt?: string;
  privateSource?: PrivateSource;
  /** The public data (what Spansh or EDSM know, so what everyone sees): when, and from where. */
  publicAt?: string;
  publicSource?: RemoteSource;
  conflicts: FactionConflict[];
  alerts: BgsAlertKind[];
  /** Priority to visit (higher first): an indication, not a measure of a threat. */
  priority: number;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const ageDays = (at: string | undefined, now: number) => {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) ? Math.max(0, (now - time) / DAY) : undefined;
};

/** The row of one system, from the factions seen there. */
function rowOf(
  faction: string,
  system: string,
  factions: FactionPresence[],
  base: Pick<
    BgsSystemRow,
    | "coords"
    | "distance"
    | "controlling"
    | "dataAt"
    | "source"
    | "lastVisit"
    | "privateAt"
    | "privateSource"
    | "publicAt"
    | "publicSource"
  >,
  conflicts: FactionConflict[],
  now: number,
): BgsSystemRow | null {
  const ours = factions.find((f) => same(f.name, faction));
  if (!ours) return null;
  const influence = Number.isFinite(ours.influence) ? ours.influence : undefined;
  const others = factions.filter((f) => f !== ours && Number.isFinite(f.influence));
  const closest =
    influence === undefined
      ? undefined
      : others.sort((a, b) => Math.abs(a.influence - influence) - Math.abs(b.influence - influence))[0];
  const rival = closest
    ? { name: closest.name, influence: closest.influence, gap: Math.round((influence! - closest.influence) * 10) / 10 }
    : undefined;
  const ourConflicts = conflicts.filter((c) => c.sides.some((side) => same(side.name, faction)));
  const states = [ours.state, ...ours.active, ...ours.pending];
  const alerts: BgsAlertKind[] = [];
  if (influence !== undefined && influence >= EXPANSION_AT && !states.includes("Expansion")) alerts.push("expansion");
  if (influence !== undefined && influence < RETREAT_BELOW) alerts.push("retreat");
  if (rival && Math.abs(rival.gap) <= RIVAL_GAP) alerts.push("rivalClose");
  if (ourConflicts.length || states.some((state) => CONFLICT_STATES.has(state))) alerts.push("conflict");
  const dataAge = ageDays(base.dataAt, now);
  if (dataAge === undefined || dataAge >= STALE_DAYS) alerts.push("staleData");
  const visitAge = ageDays(base.privateAt, now);
  if (visitAge === undefined || visitAge >= NOT_VISITED_DAYS) alerts.push("notVisited");
  const controls = base.controlling ? same(base.controlling, faction) : false;
  return {
    system,
    ...base,
    influence,
    controls,
    state: ours.state,
    active: ours.active,
    pending: ours.pending,
    recovering: ours.recovering,
    rival,
    conflicts: ourConflicts,
    alerts,
    priority: priorityOf(alerts, controls, visitAge, dataAge),
  };
}

/** Patrol priority: what is at stake first, then how long since anyone looked. */
function priorityOf(alerts: BgsAlertKind[], controls: boolean, visitAge?: number, dataAge?: number): number {
  let score = controls ? 10 : 0;
  if (alerts.includes("conflict")) score += 30;
  if (alerts.includes("retreat")) score += 25;
  if (alerts.includes("rivalClose")) score += 20;
  if (alerts.includes("expansion")) score += 5;
  score += visitAge === undefined ? 20 : visitAge >= NOT_VISITED_DAYS ? 15 : visitAge >= STALE_DAYS ? 8 : 0;
  score += dataAge === undefined ? 15 : dataAge >= NOT_VISITED_DAYS ? 12 : dataAge >= STALE_DAYS ? 6 : 0;
  return score;
}

/** Days of samples the trend is computed on (about three BGS days and the one before). */
export const TREND_WINDOW_DAYS = 4;
/** How far ahead the forecast looks (days). */
export const FORECAST_DAYS = 3;

/**
 * A faction's average change of influence per day (points), over the samples of the last
 * TREND_WINDOW_DAYS days: the slope of a least-squares line, so one odd sample weighs little.
 * Undefined with fewer than two samples or less than half a day between the first and the last.
 */
export function influenceTrend(samples: InfluenceSample[], faction: string, now = Date.now()): number | undefined {
  const since = now - TREND_WINDOW_DAYS * DAY;
  const points: [number, number][] = [];
  for (const sample of samples) {
    const time = Date.parse(sample.at);
    if (!Number.isFinite(time) || time < since) continue;
    const entry = Object.entries(sample.influences).find(([name]) => same(name, faction));
    if (entry && Number.isFinite(entry[1])) points.push([time / DAY, entry[1]]);
  }
  if (points.length < 2) return undefined;
  const days = points.map(([x]) => x);
  if (Math.max(...days) - Math.min(...days) < 0.5) return undefined;
  const meanX = days.reduce((a, b) => a + b, 0) / points.length;
  const meanY = points.reduce((a, [, y]) => a + y, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const [x, y] of points) {
    covariance += (x - meanX) * (y - meanY);
    variance += (x - meanX) ** 2;
  }
  return variance ? Math.round((covariance / variance) * 100) / 100 : undefined;
}

/** All the samples known for a system: your visits (journal) and Spansh's or EDSM's, by date. */
function samplesOf(
  visit: SystemObservation | undefined,
  known: KnownSystem | undefined,
  squadron: SharedSystem | undefined,
): InfluenceSample[] {
  return [...(visit?.history ?? []), ...(known?.history ?? []), ...(squadron?.history ?? [])].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
}

/** One view of a system's factions, from wherever it came. */
interface Snapshot {
  at?: string;
  source: BgsSystemRow["source"];
  controlling?: string;
  factions: FactionPresence[];
  conflicts: FactionConflict[];
}

const distanceBetween = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The followed faction's systems: those of your journal where it was seen, those your squadron's
 * members saw (`shared`, from its Discord bot) and those Spansh or EDSM gave (kept in `known`).
 * For each, the newest data wins; the trend uses every sample. `from` (your position) gives the
 * distances.
 */
export function factionRows(
  faction: string,
  known: BgsHistory,
  observed: Record<string, SystemObservation>,
  now = Date.now(),
  from?: Vec3,
  shared: BgsShared = {},
): BgsSystemRow[] {
  if (!faction) return [];
  const visits = new Map(Object.values(observed).map((o) => [o.system.toLowerCase(), o]));
  const names = new Set([...visits.keys(), ...Object.keys(known), ...Object.keys(shared)]);
  const rows: BgsSystemRow[] = [];
  for (const key of names) {
    const visit = visits.get(key);
    const remote = known[key];
    const squadron = shared[key];
    const candidates: Snapshot[] = [];
    if (visit)
      candidates.push({
        at: visit.at,
        source: "journal",
        controlling: visit.controlling,
        factions: visit.factions,
        conflicts: visit.conflicts,
      });
    if (squadron)
      candidates.push({
        at: squadron.at,
        source: "discord",
        controlling: squadron.controlling,
        factions: squadron.factions,
        conflicts: squadron.conflicts,
      });
    if (remote?.latest)
      candidates.push({
        at: remote.latest.at,
        source: remote.latest.source,
        controlling: remote.latest.controlling,
        factions: remote.latest.factions,
        // Only the journal tells a conflict's sides: a visit's are kept until a newer visit.
        conflicts: (squadron && (!visit || squadron.at > visit.at) ? squadron.conflicts : visit?.conflicts) ?? [],
      });
    // Private: your visit, or your squadron's when newer.
    const privateNewest = squadron && (!visit || squadron.at > visit.at) ? "discord" : visit ? "journal" : undefined;
    const newest = candidates.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
    if (!newest) continue;
    const coords = remote?.coords;
    const row = rowOf(
      faction,
      visit?.system ?? squadron?.system ?? remote!.system,
      newest.factions,
      {
        coords,
        distance: coords && from ? Math.round(distanceBetween(coords, from) * 100) / 100 : undefined,
        controlling: newest.controlling,
        dataAt: newest.at,
        source: newest.source,
        lastVisit: visit?.at,
        privateAt: privateNewest === "discord" ? squadron!.at : visit?.at,
        privateSource: privateNewest,
        publicAt: remote?.latest?.at,
        publicSource: remote?.latest?.source,
      },
      newest.conflicts,
      now,
    );
    if (!row) continue;
    addForecast(row, samplesOf(visit, remote, squadron), faction, now);
    rows.push(row);
  }
  return rows.sort(
    (a, b) =>
      b.priority - a.priority ||
      (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
      a.system.localeCompare(b.system),
  );
}

/** Trend, forecast in FORECAST_DAYS days, and the "at risk" alert when it goes badly. */
function addForecast(row: BgsSystemRow, samples: InfluenceSample[], faction: string, now: number) {
  const trend = influenceTrend(samples, faction, now);
  if (trend === undefined || row.influence === undefined) return;
  row.trend = trend;
  row.forecast = Math.min(100, Math.max(0, Math.round((row.influence + trend * FORECAST_DAYS) * 10) / 10));
  if (row.rival) {
    const rivalTrend = influenceTrend(samples, row.rival.name, now) ?? 0;
    row.rival.forecastGap = Math.round((row.rival.gap + (trend - rivalTrend) * FORECAST_DAYS) * 10) / 10;
  }
  const falling = row.influence >= RETREAT_BELOW && row.forecast < RETREAT_BELOW;
  const overtaken = row.rival !== undefined && row.rival.gap > 0 && (row.rival.forecastGap ?? 1) <= 0;
  if (falling || overtaken) {
    row.alerts.push("atRisk");
    row.priority += 20;
  }
}

/** Factions seen in your journal, most seen first (to pick the one to follow). */
export function knownFactions(observed: Record<string, SystemObservation>): string[] {
  const count = new Map<string, number>();
  for (const observation of Object.values(observed))
    for (const f of observation.factions) count.set(f.name, (count.get(f.name) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

/** What helps the faction in a state (keys of the "bgs.advice*" texts). */
const ADVICE_BY_STATE: Record<string, string> = {
  War: "conflictZones",
  CivilWar: "conflictZones",
  "Civil war": "conflictZones",
  Election: "election",
  Boom: "trade",
  Bust: "trade",
  Famine: "food",
  Outbreak: "medicines",
  CivilUnrest: "bounties",
  "Civil unrest": "bounties",
  Lockdown: "bounties",
  PirateAttack: "bounties",
  "Pirate attack": "bounties",
  InfrastructureFailure: "supplies",
  "Infrastructure Failure": "supplies",
  NaturalDisaster: "rescue",
  "Natural Disaster": "rescue",
  Drought: "supplies",
  Blight: "supplies",
  TerroristAttack: "bounties",
  "Terrorist Attack": "bounties",
};

/** What to do in a system for the faction: one advice per state, else the usual ways. */
export function adviceFor(row: BgsSystemRow): string[] {
  const advice = new Set<string>();
  for (const state of [row.state, ...row.active]) {
    const key = ADVICE_BY_STATE[state];
    if (key) advice.add(key);
  }
  if (!advice.size) advice.add("usual");
  return [...advice];
}

/**
 * The refresh tour: systems whose data is old, nearest first from `from` then from each stop
 * (a simple nearest-neighbour order, not a ship route). Systems without coordinates come last.
 */
export function refreshTour(rows: BgsSystemRow[], from?: Vec3, maxStops = 15): BgsSystemRow[] {
  const stale = rows.filter((row) => row.alerts.includes("staleData"));
  const placed = stale.filter((row) => row.coords);
  const tour: BgsSystemRow[] = [];
  let at = from;
  while (placed.length && tour.length < maxStops) {
    const distanceTo = (row: BgsSystemRow) =>
      at ? Math.hypot(row.coords![0] - at[0], row.coords![1] - at[1], row.coords![2] - at[2]) : (row.distance ?? 0);
    placed.sort((a, b) => distanceTo(a) - distanceTo(b));
    const next = placed.shift()!;
    tour.push(next);
    at = next.coords;
  }
  return [...tour, ...stale.filter((row) => !row.coords)].slice(0, maxStops);
}

/** What the commander did for (or against) the faction in one system. */
export interface BgsActivityRow {
  system: string;
  missions: number;
  /** Sum of the missions' "+" (minus the "+" of missions against the faction). */
  influence: number;
  bounties: number;
  combatBonds: number;
  tradeProfit: number;
  blackMarket: number;
  exploration: number;
  /** Failed or abandoned missions, crimes, missions against the faction. */
  against: number;
  lastAt: string;
}

/** The commander's actions for `faction` since `since` (ISO), by system, busiest first. */
export function activityFor(actions: BgsAction[], faction: string, since: string): BgsActivityRow[] {
  const rows = new Map<string, BgsActivityRow>();
  for (const action of actions) {
    if (action.at < since || !same(action.faction, faction)) continue;
    const row =
      rows.get(action.system) ??
      ({
        system: action.system,
        missions: 0,
        influence: 0,
        bounties: 0,
        combatBonds: 0,
        tradeProfit: 0,
        blackMarket: 0,
        exploration: 0,
        against: 0,
        lastAt: action.at,
      } satisfies BgsActivityRow);
    rows.set(action.system, row);
    if (action.at > row.lastAt) row.lastAt = action.at;
    const credits = action.credits ?? 0;
    switch (action.kind) {
      case "mission":
        row.missions += 1;
        row.influence += action.influence ?? 0;
        if (action.against) row.against += 1;
        break;
      case "bounty":
        row.bounties += credits;
        break;
      case "combatBond":
        row.combatBonds += credits;
        break;
      case "trade":
        row.tradeProfit += credits;
        break;
      case "blackMarket":
        row.blackMarket += credits;
        break;
      case "exploration":
        row.exploration += credits;
        break;
      default:
        row.against += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
