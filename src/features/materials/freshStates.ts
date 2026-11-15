// A material's page, the systems listed for a source: their faction states from EliteBGS when it
// has seen the system more recently than Spansh. States change within days, while a little-visited
// system's data can be weeks old at Spansh; both are fed by EDDN, but EliteBGS is often quicker
// for BGS data. Only the few systems shown are asked about, and only when Spansh's data is old.

import { eliteBgsSystems } from "../../services/eliteBgs.js";
import { factionStateBadges, type ResultRow } from "../../services/spansh.js";

/** Spansh's data older than this (milliseconds) is checked against EliteBGS. */
export const STATES_CHECK_AFTER = 86_400_000;

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/**
 * `rows` with the faction states and age of EliteBGS where it is more recent (marked "EliteBGS"
 * in debug mode); `wanted` are the states the source looks for. The rows themselves are not
 * changed: the ones updated are copies.
 */
export async function withFreshStates(rows: ResultRow[], wanted: string[], now = Date.now()): Promise<ResultRow[]> {
  const old = rows.filter((row) => !(now - time(row.updated) <= STATES_CHECK_AFTER));
  if (!old.length) return rows;
  const found = new Map((await eliteBgsSystems(old.map((row) => row.system))).map((s) => [s.name.toLowerCase(), s]));
  return rows.map((row) => {
    const system = found.get(row.system.toLowerCase());
    const newer =
      system && time(system.updatedAt) > (Number.isFinite(time(row.updated)) ? time(row.updated) : -Infinity);
    if (!system || !newer) return row;
    return {
      ...row,
      badges: factionStateBadges(system.factions, system.controllingState, new Set(wanted)),
      updated: system.updatedAt,
      source: "EliteBGS",
    };
  });
}
