// Share modes of the uploaders (EDDN, EDSM, Inara): what a journal event becomes before it is
// shared. In "bgs" mode the event loses its BGS data (factions, influence, states, conflicts), and
// the events that only tell the BGS work done (missions, vouchers, trade, cartography…) aren't
// shared at all. In "invisible" mode nothing is shared. The event EDCH itself reads is untouched.

import type { ShareMode } from "../../state/syncSettings.js";
import type { Json } from "./common.js";

/** Fields of the location events (FSDJump, Location, CarrierJump, Docked…) that tell the BGS. */
export const BGS_FIELDS = ["Factions", "Conflicts", "SystemFaction", "StationFaction"] as const;

/** Events that tell the BGS work done (they move a faction's influence): never shared in "bgs". */
export const BGS_ACTION_EVENTS = new Set([
  "MissionAccepted",
  "MissionCompleted",
  "MissionFailed",
  "MissionAbandoned",
  "MissionRedirected",
  "RedeemVoucher",
  "Bounty",
  "FactionKillBond",
  "CapShipBond",
  "CommitCrime",
  "PayFines",
  "PayBounties",
  "MarketBuy",
  "MarketSell",
  "SellExplorationData",
  "MultiSellExplorationData",
  "SellOrganicData",
  "SellMicroResources",
  "SearchAndRescue",
  "HoloscreenHacked",
]);

/**
 * The event as it may be shared in `mode`: the event itself ("normal"), a copy without its BGS
 * data ("bgs"), or null when it mustn't be shared ("invisible", or a BGS action in "bgs").
 */
export function shareableEvent(event: Json, mode: ShareMode): Json | null {
  if (mode === "invisible") return null;
  if (mode !== "bgs") return event;
  if (BGS_ACTION_EVENTS.has(event.event)) return null;
  if (!BGS_FIELDS.some((field) => field in event)) return event;
  const copy = { ...event };
  for (const field of BGS_FIELDS) delete copy[field];
  return copy;
}
