// The BGS tick: the time the game last updated the factions (once a day, at no fixed hour), as
// published by EDCD's tick detector. Asked only while the BGS page is shown, at most every 15
// minutes; the request carries nothing about the commander. Kept in memory only.

import { httpFetch } from "../platform/bridge.js";
import { log } from "../platform/logger.js";

const TICK_URL = "https://tick.edcd.io/api/tick";
/** How long a known tick is trusted before asking again. */
const RECHECK_MS = 15 * 60_000;

let tickAt: string | undefined;
let checkedAt = 0;
let pending: Promise<string | undefined> | undefined;

/** The tick detector's answer (a JSON string date) as ISO 8601 UTC; throws on anything else. */
export function decodeTick(body: string): string {
  const parsed: unknown = JSON.parse(body);
  const time = typeof parsed === "string" ? Date.parse(parsed) : NaN;
  if (!Number.isFinite(time)) throw new Error("not a date");
  return new Date(time).toISOString();
}

/** The last tick known, if any (no request). */
export function knownTick(): string | undefined {
  return tickAt;
}

/** The last tick, asked again when the known one is older than 15 minutes. Never throws. */
export function refreshTick(now = Date.now()): Promise<string | undefined> {
  if (pending) return pending;
  if (tickAt && now - checkedAt < RECHECK_MS) return Promise.resolve(tickAt);
  pending = (async () => {
    try {
      const reply = await httpFetch("GET", TICK_URL);
      if (reply.status !== 200) throw new Error(`HTTP ${reply.status}`);
      tickAt = decodeTick(reply.body);
      log.debug("bgs", `BGS tick: ${tickAt ?? "unreadable answer"}`);
    } catch (error) {
      log.warn("bgs", `BGS tick unknown: ${(error as Error)?.message ?? error}`);
    }
    // A failure waits like a success: no hammering when the detector is down.
    checkedAt = now;
    pending = undefined;
    return tickAt;
  })();
  return pending;
}
