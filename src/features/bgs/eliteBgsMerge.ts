// The BGS page with EliteBGS's data next to Spansh's: EliteBGS knows the followed faction's own
// influence and states (and the other factions by name only). When it saw a system more recently
// than what EDCH holds, its data is used, with the other factions' influence kept from the older
// snapshot rather than lost.

import type { FactionSystem } from "../../services/spansh.js";
import type { RemoteSnapshot } from "../../state/bgsHistory.js";

/** The snapshot to record for an EliteBGS system, given the one EDCH already holds (if any). */
export function eliteBgsSnapshot(
  system: FactionSystem,
  previous: RemoteSnapshot | undefined,
): RemoteSnapshot | undefined {
  if (!system.updatedAt) return undefined;
  const before = new Map((previous?.factions ?? []).map((f) => [f.name.toLowerCase(), f]));
  return {
    at: system.updatedAt,
    source: "elitebgs",
    controlling: system.controlling ?? previous?.controlling,
    factions: system.factions.map((f) => (Number.isFinite(f.influence) ? f : (before.get(f.name.toLowerCase()) ?? f))),
  };
}
