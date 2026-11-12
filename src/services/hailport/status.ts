// Where the Hailport link stands, for the pages (Settings): kept here so a page can read it
// without reaching the app's wiring (app/hailport.ts sets it).

import type { HailportState } from "./client.js";

let state: HailportState = "off";
let offered = false;
let reconnect: (() => void) | null = null;
const listeners = new Set<(state: HailportState) => void>();

/** The link's state. */
export const hailportState = () => state;
/** Whether this build offers Hailport (not the portable exe, not a phone or the demo). */
export const hailportOffered = () => offered;

/** Follows the link's state; returns the function that stops following. */
export function onHailportState(listener: (state: HailportState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Connects again at once (after a refusal or a removal, from the Settings page). */
export function hailportReconnect() {
  reconnect?.();
}

/** For app/hailport.ts: what the build offers, and how to connect again. */
export function setHailportOffer(isOffered: boolean, reconnectNow: (() => void) | null) {
  offered = isOffered;
  reconnect = reconnectNow;
}

/** For app/hailport.ts: the link's new state. */
export function setHailportState(next: HailportState) {
  state = next;
  for (const listener of listeners) listener(next);
}
