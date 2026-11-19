// The system page's factions from EliteBGS when it has seen the system more recently than
// Spansh: influence and states change with each tick, while a system's data can be days or weeks
// old at Spansh. Both are fed by EDDN, but EliteBGS is often quicker for BGS data.

import { eliteBgsSystems } from "../../services/eliteBgs.js";
import type { SystemDetails, SystemFaction } from "../../services/systemSearch.js";

/** Spansh's data older than this (milliseconds) is checked against EliteBGS. */
export const FACTIONS_CHECK_AFTER = 86_400_000;

/** More recent factions of a system, and when they were seen. */
export interface FreshFactions {
  factions: SystemFaction[];
  updatedAt: string;
}

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/**
 * The system's factions from EliteBGS when its data is more recent than Spansh's (most influent
 * first); null when Spansh's is recent enough, or EliteBGS has nothing newer. Allegiance and
 * government, which hardly ever change, are kept from Spansh.
 */
export async function freshFactions(details: SystemDetails, now = Date.now()): Promise<FreshFactions | null> {
  const known = time(details.updatedAt);
  if (now - known <= FACTIONS_CHECK_AFTER) return null;
  const [system] = (await eliteBgsSystems([details.name])).filter(
    (s) => s.name.toLowerCase() === details.name.toLowerCase(),
  );
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
  return factions.length ? { factions, updatedAt: system.updatedAt } : null;
}
