// The BGS page's logic: the followed faction's systems (from the journal's own visits and from
// Spansh, the newer one wins), what needs attention in each (expansion, retreat, a rival close
// behind, conflicts, old data, a system not visited for long), what to do there, the order to
// visit them in, and what the commander did for the faction. Pure functions.
// Credit: the patrol priority and the data-age rules follow Cyberpunk Philou's BGS prototype
// (pull request #2).

import type { BgsAction, FactionConflict, FactionPresence, SystemObservation } from "../../game/activity/bgs.js";
import type { Vec3 } from "../../game/journal/state.js";
import type { FactionSystem } from "../../services/spansh.js";

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
  /** Nobody of yours went there for a while (from your journal). */
  | "notVisited";

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
  /** The other faction closest in influence, and the gap in points (positive: we're ahead). */
  rival?: { name: string; influence: number; gap: number };
  /** Change of influence since the previous visit you made (points), from the journal. */
  trend?: number;
  /** When the shown data was observed, and by whom. */
  dataAt?: string;
  source: "journal" | "spansh";
  /** Your last visit (journal), if any in the journal kept. */
  lastVisit?: string;
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
  base: Pick<BgsSystemRow, "coords" | "distance" | "controlling" | "dataAt" | "source" | "lastVisit" | "trend">,
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
  const visitAge = ageDays(base.lastVisit, now);
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

/** Change of the faction's influence between your last two visits with different values. */
function trendOf(observation: SystemObservation | undefined, faction: string): number | undefined {
  const samples = observation?.history.filter((sample) =>
    Object.keys(sample.influences).some((name) => same(name, faction)),
  );
  if (!samples || samples.length < 2) return undefined;
  const value = (sample: (typeof samples)[number]) =>
    Object.entries(sample.influences).find(([name]) => same(name, faction))![1];
  return Math.round((value(samples.at(-1)!) - value(samples.at(-2)!)) * 10) / 10;
}

/**
 * The followed faction's systems: Spansh's list (when loaded) and the systems of your journal
 * where it was seen. For each, the newest data wins (your own visit, or Spansh's).
 */
export function factionRows(
  faction: string,
  spansh: FactionSystem[] | undefined,
  observed: Record<string, SystemObservation>,
  now = Date.now(),
): BgsSystemRow[] {
  if (!faction) return [];
  const rows = new Map<string, BgsSystemRow>();
  const observedBy = new Map(Object.values(observed).map((o) => [o.system.toLowerCase(), o]));
  for (const system of spansh ?? []) {
    const visit = observedBy.get(system.name.toLowerCase());
    const journalNewer = visit && (!system.updatedAt || visit.at > system.updatedAt);
    const row = journalNewer
      ? rowOf(
          faction,
          system.name,
          visit.factions,
          {
            coords: system.coords,
            distance: system.distance,
            controlling: visit.controlling,
            dataAt: visit.at,
            source: "journal",
            lastVisit: visit.at,
            trend: trendOf(visit, faction),
          },
          visit.conflicts,
          now,
        )
      : rowOf(
          faction,
          system.name,
          system.factions,
          {
            coords: system.coords,
            distance: system.distance,
            controlling: system.controlling,
            dataAt: system.updatedAt,
            source: "spansh",
            lastVisit: visit?.at,
            trend: trendOf(visit, faction),
          },
          visit?.conflicts ?? [],
          now,
        );
    if (row) rows.set(system.name.toLowerCase(), row);
  }
  // Systems of your journal Spansh didn't give (not loaded yet, or not found).
  for (const visit of observedBy.values()) {
    if (rows.has(visit.system.toLowerCase())) continue;
    const row = rowOf(
      faction,
      visit.system,
      visit.factions,
      {
        controlling: visit.controlling,
        dataAt: visit.at,
        source: "journal",
        lastVisit: visit.at,
        trend: trendOf(visit, faction),
      },
      visit.conflicts,
      now,
    );
    if (row) rows.set(visit.system.toLowerCase(), row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.priority - a.priority ||
      (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
      a.system.localeCompare(b.system),
  );
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
