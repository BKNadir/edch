// The BGS report: what the commander did for a faction over a period, in the format a squadron
// bot will read (docs/BGS_SYNC.md). Nothing sends it yet: the link to the bot will come later,
// opt-in (a box to tick), and only when the share mode allows it.

import type { BgsAction } from "../../game/activity/bgs.js";

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
