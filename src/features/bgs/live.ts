/** Mark BGS systems visited only on live FSDJump events (never replay). */
import { isRemote } from "../../platform/bridge.js";
import { recordVisitDb } from "./sqlite.js";
import { readLiveVisit, type LiveVisit } from "./utils.js";
import { recordCommanderEvents } from "./commander.js";
// EDCH-BGS-v1.4.1

/** Called exclusively by the journal feed inside `if (!b.replay)` (not historical lines). */
export function recordLiveArrivals(events: readonly Record<string, unknown>[], commander?: string): void {
  if (isRemote()) return;
  // Feed is already gated by !b.replay in journalFeed.ts; no replayed missions are counted.
  if (commander && recordCommanderEvents(commander, events) > 0)
    window.dispatchEvent(new CustomEvent("edch-bgs-cmdr-event", { detail: { commander } }));
  for (const event of events) {
    const visit = readLiveVisit(event);
    if (!visit) continue;
    // Persist even if the BGS page is not open. SQLite visits are separate from snapshots.
    void recordVisitDb(visit.system, visit.at).catch((error: unknown) =>
      console.warn("[EDCH BGS] sauvegarde visite échouée", error),
    );
    window.dispatchEvent(new CustomEvent<LiveVisit>("edch-bgs-visit", { detail: visit }));
  }
}
