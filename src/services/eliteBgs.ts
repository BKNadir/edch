// EliteBGS (elitebgs.app): a public BGS database fed by EDDN, like Spansh's but collected apart.
// The BGS page asks it for the followed faction's systems, to find those Spansh misses and to keep
// the most recent influence and states of each. Only the faction's name is sent.

import { eliteBgsGet } from "../platform/bridge.js";
import { log } from "../platform/logger.js";
import type { FactionPresence } from "../game/activity/bgs.js";
import type { FactionSystem } from "./spansh.js";

/** EliteBGS writes states in lower case without spaces ("civilwar"): the game's names. */
const STATE_NAMES: Record<string, string> = {
  blight: "Blight",
  boom: "Boom",
  bust: "Bust",
  civilliberty: "Civil Liberty",
  civilunrest: "Civil Unrest",
  civilwar: "Civil War",
  coldwar: "Cold War",
  colonisation: "Colonisation",
  drought: "Drought",
  election: "Election",
  expansion: "Expansion",
  famine: "Famine",
  historicevent: "Historic Event",
  infrastructurefailure: "Infrastructure Failure",
  investment: "Investment",
  lockdown: "Lockdown",
  naturaldisaster: "Natural Disaster",
  outbreak: "Outbreak",
  pirateattack: "Pirate Attack",
  publicholiday: "Public Holiday",
  retreat: "Retreat",
  revolution: "Revolution",
  terroristattack: "Terrorist Attack",
  theftofsupplies: "Theft of Supplies",
  war: "War",
};

/** A state's game name ("civilwar" → "Civil War"; an unknown one keeps its spelling). */
export function eliteBgsState(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw || raw.toLowerCase() === "none") return undefined;
  return STATE_NAMES[raw.toLowerCase().replace(/[^a-z]/g, "")] ?? raw;
}

const stateList = (list: unknown): string[] =>
  Array.isArray(list)
    ? list
        .map((entry: any) => eliteBgsState(typeof entry === "string" ? entry : entry?.state))
        .filter((s): s is string => !!s)
    : [];

/**
 * The systems of `faction` in EliteBGS's answer (factions?name=…&systemDetails=true): the faction's
 * own influence and states, the other factions present by name only (their influence unknown).
 */
export function decodeEliteBgs(answer: any, faction: string): FactionSystem[] {
  const doc = (Array.isArray(answer?.docs) ? answer.docs : []).find(
    (d: any) => String(d?.name ?? "").toLowerCase() === faction.toLowerCase(),
  );
  if (!doc) return [];
  const own = String(doc.name);
  const out: FactionSystem[] = [];
  for (const p of Array.isArray(doc.faction_presence) ? doc.faction_presence : []) {
    const name = String(p?.system_name ?? "").trim();
    if (!name) continue;
    const details = p.system_details ?? {};
    const influence = typeof p.influence === "number" && Number.isFinite(p.influence) ? p.influence * 100 : NaN;
    const mine: FactionPresence = {
      name: own,
      influence: Number.isFinite(influence) ? Math.round(influence * 10) / 10 : NaN,
      state: eliteBgsState(p.state) ?? "None",
      active: stateList(p.active_states),
      pending: stateList(p.pending_states),
      recovering: stateList(p.recovering_states),
    };
    const others: FactionPresence[] = (Array.isArray(details.factions) ? details.factions : [])
      .map((f: any) => String(f?.name ?? ""))
      .filter((n: string) => n && n.toLowerCase() !== own.toLowerCase())
      .map((n: string) => ({ name: n, influence: NaN, state: "None", active: [], pending: [], recovering: [] }));
    const updated = Date.parse(String(p.updated_at ?? ""));
    const coords = [details.x, details.y, details.z];
    out.push({
      name,
      id64: details.system_address == null ? undefined : String(details.system_address),
      coords: coords.every(Number.isFinite) ? (coords as [number, number, number]) : undefined,
      updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : undefined,
      controlling:
        typeof details.controlling_minor_faction_cased === "string"
          ? details.controlling_minor_faction_cased
          : undefined,
      factions: [mine, ...others],
    });
  }
  return out;
}

/** The faction's systems as EliteBGS knows them; empty when it can't answer (Spansh's stay). */
export async function eliteBgsFactionSystems(faction: string): Promise<FactionSystem[]> {
  try {
    const answer = await eliteBgsGet(`factions?name=${encodeURIComponent(faction)}&systemDetails=true`);
    const systems = decodeEliteBgs(answer, faction);
    log.debug("elitebgs", `${systems.length} system(s) for the followed faction`);
    return systems;
  } catch (error) {
    log.warn("elitebgs", `No EliteBGS data (${String((error as Error)?.message ?? error)}), Spansh only`);
    return [];
  }
}
