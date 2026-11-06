// "Reset" buttons of the session counters (Session, Mining, Powerplay, Thargoids pages). The activity is
// rebuilt from the journal at each start, so a reset can't just zero it: it keeps a snapshot of
// the counters at that moment, and the pages show the counters minus that snapshot. A snapshot
// belongs to one game session (its LoadGame time): a new game session starts from zero anyway.

import type { ActivityState, Mining, Session } from "../game/activity/state.js";

/** A reset: for which game session, when, and the counters at that moment. */
interface CounterReset<T> {
  /** `session.start` of the game session it was made in. */
  gameSession: string;
  /** When the reset button was clicked. */
  at: string;
  counters: T;
}

interface Resets {
  session?: CounterReset<Session>;
  mining?: CounterReset<Mining>;
  powerplay?: CounterReset<null>;
  thargoids?: CounterReset<null>;
}

const KEY = "edch.counterResets";

let resets: Resets = (() => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Resets) ?? {};
  } catch {
    return {};
  }
})();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(resets));
  } catch {
    /* kept until EDCH closes */
  }
}

/** The reset of `kind`, if it was made in the current game session. */
function currentReset<K extends keyof Resets>(activity: ActivityState, kind: K): Resets[K] | undefined {
  const reset = resets[kind];
  return reset && reset.gameSession === activity.session.start ? reset : undefined;
}

/** `now - before` for every number of the object (other fields stay as now). */
function minus<T extends object>(now: T, before: T): T {
  const result = { ...now } as Record<string, unknown>;
  for (const [key, value] of Object.entries(now))
    if (typeof value === "number") result[key] = value - Number((before as Record<string, unknown>)[key] ?? 0);
  return result as T;
}

/** Session page: the counters to zero from now (until the next game session). */
export function resetSessionCounters(activity: ActivityState) {
  if (!activity.session.start) return;
  resets.session = {
    gameSession: activity.session.start,
    at: new Date().toISOString(),
    counters: structuredClone(activity.session),
  };
  save();
}

/** The session counters since the last reset (its time as the start). */
export function sessionSinceReset(activity: ActivityState): Session {
  const reset = currentReset(activity, "session");
  if (!reset) return activity.session;
  return { ...minus(activity.session, reset.counters), start: reset.at, credits: activity.session.credits };
}

/** Mining page: the mining counters to zero from now (the last asteroids stay). */
export function resetMiningCounters(activity: ActivityState) {
  if (!activity.session.start) return;
  resets.mining = {
    gameSession: activity.session.start,
    at: new Date().toISOString(),
    counters: structuredClone(activity.mining),
  };
  save();
}

/** The mining counters since the last reset (tonnes refined per mineral too). */
export function miningSinceReset(activity: ActivityState): Mining {
  const reset = currentReset(activity, "mining");
  if (!reset) return activity.mining;
  const before = reset.counters;
  const refined: Mining["refined"] = {};
  for (const [id, mineral] of Object.entries(activity.mining.refined)) {
    const count = mineral.count - (before.refined[id]?.count ?? 0);
    if (count > 0) refined[id] = { ...mineral, count };
  }
  const started = activity.mining.started ? reset.at : undefined;
  return { ...minus(activity.mining, before), refined, started, last: activity.mining.last };
}

/** Powerplay page: the session's merits count from now. */
export function resetPowerplayCounters(activity: ActivityState) {
  if (!activity.session.start) return;
  resets.powerplay = { gameSession: activity.session.start, at: new Date().toISOString(), counters: null };
  save();
}

/** Since when the Powerplay page counts the session's merits. */
export function powerplaySessionStart(activity: ActivityState): string | undefined {
  return currentReset(activity, "powerplay")?.at ?? activity.session.start;
}

/** Thargoids page: the session's kills and AX zones count from now. */
export function resetThargoidCounters(activity: ActivityState) {
  if (!activity.session.start) return;
  resets.thargoids = { gameSession: activity.session.start, at: new Date().toISOString(), counters: null };
  save();
}

/** Since when the Thargoids page counts the session's kills and AX zones. */
export function thargoidSessionStart(activity: ActivityState): string | undefined {
  return currentReset(activity, "thargoids")?.at ?? activity.session.start;
}
