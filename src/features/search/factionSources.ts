// Search → Faction: the systems of a minor faction, each with the most recent data among Spansh,
// EliteBGS and EDSM, so a state change (expansion, war, election…) shows up as soon as one of them
// has it. Spansh and EliteBGS give the whole list in one go; EDSM is asked system by system, so
// only for the nearest systems whose data is more than a day old (EDSM limits its requests).

import { gameName, locale, t } from "../../platform/i18n.js";
import { log } from "../../platform/logger.js";
import { edsmFactions } from "../../services/edsm.js";
import { eliteBgsFactionSystems } from "../../services/eliteBgs.js";
import {
  distance,
  factionSystems,
  inaraSystem,
  type FactionQuery,
  type FactionSystem,
  type FinderResult,
  type Reference,
  type ResultRow,
} from "../../services/spansh.js";
import type { FactionPresence } from "../../game/activity/bgs.js";

/** The public sites a faction system can come from (shown in debug mode). */
export type FactionSource = "Spansh" | "EliteBGS" | "EDSM";

/** A faction system with the site its data comes from. */
export interface SourcedSystem extends FactionSystem {
  source: FactionSource;
}

/** Systems asked to EDSM at most per search, and how old their data must be (milliseconds). */
export const EDSM_CHECKS = 15;
const EDSM_OLDER_THAN = 86_400_000;

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/**
 * One line per system (any capitals): the most recent data wins; coordinates, id64 and distance
 * are kept from whichever source has them.
 */
export function freshestSystems(
  lists: { source: FactionSource; systems: (FactionSystem | SourcedSystem)[] }[],
): SourcedSystem[] {
  const byName = new Map<string, SourcedSystem>();
  for (const { source, systems } of lists)
    for (const system of systems) {
      // A system merged before keeps the source it came from.
      const sourced: SourcedSystem = { ...system, source: "source" in system ? system.source : source };
      const key = system.name.toLowerCase();
      const known = byName.get(key);
      if (!known) {
        byName.set(key, sourced);
        continue;
      }
      const newer = time(system.updatedAt) > time(known.updatedAt) || !Number.isFinite(time(known.updatedAt));
      const winner = newer && Number.isFinite(time(system.updatedAt)) ? sourced : known;
      byName.set(key, {
        ...winner,
        id64: winner.id64 ?? known.id64 ?? system.id64,
        coords: winner.coords ?? known.coords ?? system.coords,
        distance: winner.distance ?? known.distance ?? system.distance,
      });
    }
  return [...byName.values()];
}

/** The faction's own presence in a system (any capitals). */
export function presenceIn(system: FactionSystem, faction: string): FactionPresence | undefined {
  return system.factions.find((f) => f.name.toLowerCase() === faction.toLowerCase());
}

/** Whether a system matches the query: controlled by the faction if asked, in a wanted state if any. */
export function matchesQuery(system: FactionSystem, q: FactionQuery): boolean {
  const presence = presenceIn(system, q.faction);
  if (!presence) return false;
  if (q.ownerOnly && system.controlling?.toLowerCase() !== q.faction.toLowerCase()) return false;
  if (!q.states.length) return true;
  const current = [presence.state, ...presence.active].map((s) => s.toLowerCase());
  return q.states.some((s) => current.includes(s.toLowerCase()));
}

/** A faction system as a result line: control, influence, states, age. */
export function factionLine(system: SourcedSystem, q: FactionQuery): ResultRow {
  const presence = presenceIn(system, q.faction);
  const wanted = new Set(q.states.map((s) => s.toLowerCase()));
  const controls = system.controlling?.toLowerCase() === q.faction.toLowerCase();
  const badges: ResultRow["badges"] = [];
  if (controls) badges.push({ text: t("spansh.controlsSystem"), tone: "hit" });
  if (presence && Number.isFinite(presence.influence))
    badges.push({
      text: t("spansh.influence", {
        value: presence.influence.toLocaleString(locale(), { maximumFractionDigits: 1 }),
      }),
    });
  const states = [...new Set([presence?.state, ...(presence?.active ?? [])])].filter(
    (s): s is string => Boolean(s) && s !== "None",
  );
  for (const state of states)
    badges.push({ text: gameName(state), tone: wanted.has(state.toLowerCase()) ? "hit" : "muted" });
  if (
    q.maxAgeDays &&
    (!Number.isFinite(time(system.updatedAt)) || Date.now() - time(system.updatedAt) > q.maxAgeDays * 86_400_000)
  )
    badges.push({ text: t("spansh.oldData"), tone: "warn" });
  const sub: string[] = [];
  if (system.controlling && !controls) sub.push(t("spansh.controlledBy", { faction: system.controlling }));
  return {
    system: system.name,
    title: system.name,
    distance: system.distance ?? NaN,
    sub,
    badges,
    links: [
      ...(system.id64 ? [{ label: "Spansh", url: `https://spansh.co.uk/system/${system.id64}` }] : []),
      { label: "Inara", url: inaraSystem(system.name) },
    ],
    updated: system.updatedAt,
    source: system.source,
  };
}

/** Runs `work` on each item, `at` a time. */
async function inBatches<T>(items: T[], at: number, work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += at) await Promise.all(items.slice(i, i + at).map(work));
}

/** The faction's systems matching `q`, nearest first, each with its most recent data. */
export async function searchFactionFreshest(q: FactionQuery, ref: Reference): Promise<FinderResult> {
  const [spansh, eliteBgs] = await Promise.all([factionSystems(q.faction, ref), eliteBgsFactionSystems(q.faction)]);
  let systems = freshestSystems([
    { source: "Spansh", systems: spansh.systems },
    { source: "EliteBGS", systems: eliteBgs },
  ]);
  for (const s of systems) if (s.distance === undefined) s.distance = distance(ref.coords, s.coords);
  systems.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  // EDSM, for the nearest systems still more than a day old.
  const stale = systems.filter((s) => !(Date.now() - time(s.updatedAt) <= EDSM_OLDER_THAN)).slice(0, EDSM_CHECKS);
  const fromEdsm: FactionSystem[] = [];
  await inBatches(stale, 3, async (s) => {
    try {
      const answer = await edsmFactions(s.name);
      if (answer)
        fromEdsm.push({
          name: s.name,
          updatedAt: answer.updatedAt,
          controlling: answer.controlling,
          factions: answer.factions,
        });
    } catch (error) {
      log.debug("faction", `EDSM ${s.name}: ${String((error as Error)?.message ?? error)}`);
    }
  });
  if (fromEdsm.length)
    systems = freshestSystems([
      { source: "Spansh", systems },
      { source: "EDSM", systems: fromEdsm },
    ]).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  log.debug(
    "faction",
    `${spansh.systems.length} Spansh, ${eliteBgs.length} EliteBGS, ${fromEdsm.length}/${stale.length} EDSM → ${systems.length}`,
  );

  const rows = systems.filter((s) => matchesQuery(s, q)).map((s) => factionLine(s, q));
  return { rows, total: rows.length };
}
