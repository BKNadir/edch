// Activity: folds journal events into the activity state (state.ts). Each domain has its own
// handlers (travel, missions, colonisation, goals, exploration, exobiology, carriers, mining,
// Powerplay); this module dispatches every event to the right one. Rebuilt at start-up from the
// last weeks of journal (scan_history), then kept up to date by live events. Pure functions.

import { CARRIERS_EVENTS } from "./carriers.js";
import { COLONISATION_EVENTS } from "./colonisation.js";
import { EXOBIOLOGY_EVENTS } from "./exobiology.js";
import { EXPLORATION_EVENTS } from "./exploration.js";
import { GOALS_EVENTS } from "./goals.js";
import { MINING_EVENTS } from "./mining.js";
import { MISSIONS_EVENTS } from "./missions.js";
import { POWERPLAY_EVENTS } from "./powerplay.js";
import type { ActivityContext, ActivityState, EventHandlers, Json } from "./state.js";
import { TRAVEL_EVENTS } from "./travel.js";

/** Every handled journal event → its handler. */
const HANDLERS: EventHandlers = {
  ...TRAVEL_EVENTS,
  ...MISSIONS_EVENTS,
  ...COLONISATION_EVENTS,
  ...GOALS_EVENTS,
  ...EXPLORATION_EVENTS,
  ...EXOBIOLOGY_EVENTS,
  ...CARRIERS_EVENTS,
  ...MINING_EVENTS,
  ...POWERPLAY_EVENTS,
};

/** Events read back from the journal archive at start-up. */
export const HISTORY_EVENTS = [
  "LoadGame", "Location", "FSDJump", "CarrierJump", "Docked", "Died", "Resurrect",
  "Missions", "MissionAccepted", "MissionCompleted", "MissionFailed", "MissionAbandoned", "MissionRedirected", "CargoDepot", "Bounty", "FactionKillBond",
  "ColonisationConstructionDepot", "ColonisationContribution",
  "CommunityGoal",
  "Scan", "SAAScanComplete", "FSSBodySignals", "SAASignalsFound", "SellExplorationData", "MultiSellExplorationData",
  "ScanOrganic", "SellOrganicData",
  "RedeemVoucher", "MarketSell", "MarketBuy", "MaterialCollected", "Undocked", "CargoTransfer", "CarrierStats", "CarrierDepositFuel",
  "MiningRefined", "ProspectedAsteroid", "LaunchDrone", "AsteroidCracked",
  "Powerplay", "PowerplayMerits", "PowerplayRank", "PowerplayJoin", "PowerplayLeave", "PowerplayDefect",
];

/** How far back the archive is read. */
export const HISTORY_DAYS = 60;

/** Folds one journal event. Returns true when something visible changed. */
export function applyActivity(st: ActivityState, ev: Json, ctx: ActivityContext = {}): boolean {
  if (!ev || typeof ev.event !== "string") return false;
  const at: string = ev.timestamp ?? "";
  // Events older than the last one applied are ignored (archive and live events overlap).
  if (at && st.lastAt && at < st.lastAt) return false;
  if (at) st.lastAt = at;
  const handler = HANDLERS[ev.event];
  return handler ? handler(st, ev, at, ctx) : false;
}

/** Applies parsed events (archive or live). */
export function applyActivityEvents(st: ActivityState, events: Json[], ctx?: ActivityContext): boolean {
  let changed = false;
  for (const ev of events) if (applyActivity(st, ev, ctx)) changed = true;
  return changed;
}
