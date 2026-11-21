// The system page's factions from EliteBGS or EDCN when one has seen the system more recently than
// Spansh: influence and states change with each tick, while a system's data can be days or weeks
// old at Spansh. All are fed by EDDN, but EliteBGS and EDCN are often quicker for BGS data; the
// most recent of the three wins.

import { eliteBgsSystems, type EliteBgsSystem } from "../../services/eliteBgs.js";
import { edcnSystems, type EdcnAccess } from "../../services/edcn.js";
import type { SystemDetails, SystemFaction } from "../../services/systemSearch.js";

/** Spansh's data older than this (milliseconds) is checked against EliteBGS. */
export const FACTIONS_CHECK_AFTER = 86_400_000;

/** More recent factions of a system, when they were seen, and by which site. */
export interface FreshFactions {
  factions: SystemFaction[];
  updatedAt: string;
  source: "EliteBGS" | "EDCN";
}

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/** The most recently seen of these systems (the first when as recent), or undefined. */
export function newestSystem(systems: (EliteBgsSystem | undefined)[]): EliteBgsSystem | undefined {
  let newest: EliteBgsSystem | undefined;
  for (const system of systems)
    if (system?.updatedAt && (!newest || time(system.updatedAt) > time(newest.updatedAt))) newest = system;
  return newest;
}

/**
 * The system's factions from EliteBGS or EDCN (`edcn`: with the user's key), the more recent of
 * the two, when more recent than Spansh's (most influent first); null when Spansh's is recent
 * enough, or neither has newer. Allegiance and government, which hardly ever change, are kept
 * from Spansh.
 */
export async function freshFactions(
  details: SystemDetails,
  edcn: EdcnAccess | null,
  now = Date.now(),
): Promise<FreshFactions | null> {
  const known = time(details.updatedAt);
  if (now - known <= FACTIONS_CHECK_AFTER) return null;
  const same = (s: EliteBgsSystem) => s.name.toLowerCase() === details.name.toLowerCase();
  const [fromEliteBgs, fromEdcn] = await Promise.all([
    eliteBgsSystems([details.name]).then((list) => list.find(same)),
    edcnSystems(edcn, [details.name]).then((list) => list.find(same)),
  ]);
  const system = newestSystem([fromEliteBgs, fromEdcn]);
  if (!system?.updatedAt || !(time(system.updatedAt) > (Number.isFinite(known) ? known : -Infinity))) return null;
  const controlling = system.controlling?.toLowerCase();
  const factions = system.factions
    .filter((f) => f.name)
    .map((f) => {
      const spansh = details.factions.find((d) => d.name.toLowerCase() === f.name.toLowerCase());
      return {
        name: f.name,
        influence: f.influence,
        state: f.state && f.state !== "None" ? f.state : undefined,
        allegiance: spansh?.allegiance,
        government: spansh?.government,
        controls: f.name.toLowerCase() === controlling,
      };
    })
    .sort(
      (a, b) => (Number.isFinite(b.influence) ? b.influence : -1) - (Number.isFinite(a.influence) ? a.influence : -1),
    );
  const source = system === fromEdcn ? "EDCN" : "EliteBGS";
  return factions.length ? { factions, updatedAt: system.updatedAt, source } : null;
}
