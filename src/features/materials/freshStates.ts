// A material's page, the systems listed for a source: their faction states from EliteBGS or EDCN
// when one has seen the system more recently than Spansh. States change within days, while a
// little-visited system's data can be weeks old at Spansh; all are fed by EDDN, but EliteBGS and
// EDCN are often quicker for BGS data, and the most recent wins. Only the few systems shown are
// asked about, and only when Spansh's data is old.

import { eliteBgsSystems } from "../../services/eliteBgs.js";
import { edcnSystems, type EdcnAccess } from "../../services/edcn.js";
import { newestSystem } from "../systems/freshFactions.js";
import { factionStateBadges, type ResultRow } from "../../services/spansh.js";

/** Spansh's data older than this (milliseconds) is checked against EliteBGS. */
export const STATES_CHECK_AFTER = 86_400_000;

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/**
 * `rows` with the faction states and age of EliteBGS or EDCN (`edcn`: with the user's key) where
 * more recent (marked with the site's name in debug mode); `wanted` are the states the source
 * looks for. The rows themselves are not changed: the ones updated are copies.
 */
export async function withFreshStates(
  rows: ResultRow[],
  wanted: string[],
  edcn: EdcnAccess | null,
  now = Date.now(),
): Promise<ResultRow[]> {
  const old = rows.filter((row) => !(now - time(row.updated) <= STATES_CHECK_AFTER));
  if (!old.length) return rows;
  const names = old.map((row) => row.system);
  const [eliteBgs, fromEdcn] = await Promise.all([eliteBgsSystems(names), edcnSystems(edcn, names)]);
  const byName = (list: typeof eliteBgs) => new Map(list.map((s) => [s.name.toLowerCase(), s]));
  const [eliteBgsFound, edcnFound] = [byName(eliteBgs), byName(fromEdcn)];
  return rows.map((row) => {
    const name = row.system.toLowerCase();
    const system = newestSystem([eliteBgsFound.get(name), edcnFound.get(name)]);
    const newer =
      system && time(system.updatedAt) > (Number.isFinite(time(row.updated)) ? time(row.updated) : -Infinity);
    if (!system || !newer) return row;
    return {
      ...row,
      badges: factionStateBadges(system.factions, system.controllingState, new Set(wanted)),
      updated: system.updatedAt,
      source: system === edcnFound.get(name) ? "EDCN" : "EliteBGS",
    };
  });
}
