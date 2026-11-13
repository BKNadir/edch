// The BGS report: what the commander did for a faction over a period, and the systems where a
// followed faction is as the game showed them on arrival, in the format the squadron's bot reads
// (docs/BGS_SYNC.md). Sent by botSync.ts, only when the member linked the bot.

import type { BgsAction, FactionConflict, FactionPresence, SystemObservation } from "../../game/activity/bgs.js";

/** Format name and version: the bot checks them before reading the rest. */
export const BGS_REPORT_SCHEMA = "edch.bgs.report";
export const BGS_REPORT_VERSION = 1;

export interface BgsReport {
  schema: typeof BGS_REPORT_SCHEMA;
  version: typeof BGS_REPORT_VERSION;
  /** When the report was made (UTC). */
  generatedAt: string;
  /** The faction followed. */
  faction: string;
  /** The period covered: [from, to) in UTC. */
  from: string;
  to: string;
  /** EDCH's version, for the bot's diagnostics. */
  app: string;
  /** The actions of the period that concern the faction, oldest first. */
  actions: Omit<BgsAction, "faction">[];
  /** Systems seen during the period where a followed faction is (public game data). */
  systems?: SystemSeen[];
}

/** A system as the game showed it on arrival: the journal's own data, never what others sent. */
export interface SystemSeen {
  at: string;
  system: string;
  controlling?: string;
  factions: FactionPresence[];
  conflicts: FactionConflict[];
}

/** The journal's visits in [from, to) to systems where one of `factions` is, oldest first. */
export function systemsSeen(
  observed: Record<string, SystemObservation>,
  factions: string[],
  from: string,
  to: string,
): SystemSeen[] {
  const wanted = new Set(factions.map((f) => f.trim().toLowerCase()));
  return Object.values(observed)
    .filter((o) => o.at >= from && o.at < to && o.factions.some((f) => wanted.has(f.name.trim().toLowerCase())))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(({ history: _history, ...seen }) => ({
      ...seen,
      // Influence unknown in a visit is left out (the bot wants a number).
      factions: seen.factions.filter((f) => Number.isFinite(f.influence)),
    }));
}

/** The report of `faction` for [from, to). The commander's name is not in it (see BGS_SYNC.md). */
export function bgsReport(
  actions: BgsAction[],
  faction: string,
  from: string,
  to: string,
  app: string,
  now = new Date().toISOString(),
): BgsReport {
  const wanted = faction.trim().toLowerCase();
  return {
    schema: BGS_REPORT_SCHEMA,
    version: BGS_REPORT_VERSION,
    generatedAt: now,
    faction,
    from,
    to,
    app,
    actions: actions
      .filter((a) => a.faction.trim().toLowerCase() === wanted && a.at >= from && a.at < to)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map(({ faction: _faction, ...rest }) => rest),
  };
}
