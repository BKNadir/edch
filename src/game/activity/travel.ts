// Session start, jumps, docking and death: where the commander is, and what a death loses.

import {
  emptyMining,
  emptySession,
  num,
  type ActivityState,
  type EventHandler,
  type EventHandlers,
  type Json,
} from "./state.js";
import { pruneBodies } from "./exploration.js";

/** Docked at a station: remember it, and a fleet carrier's hold when it is one. */
function dockAt(st: ActivityState, ev: Json, at: string) {
  const id = Number(ev.MarketID);
  if (!id) return;
  const type = String(ev.StationType ?? "");
  const carrier = /carrier/i.test(type);
  const squadron = /squadron/i.test(type);
  st.docked = { marketId: id, carrier, squadron, name: String(ev.StationName ?? "") };
  if (!carrier) return;
  const c = (st.carriers[id] ??= {
    marketId: id,
    name: String(ev.StationName ?? ""),
    mine: false,
    squadron,
    items: {},
    since: at,
    updated: at,
  });
  if (squadron) c.squadron = true;
  if (!c.name) c.name = String(ev.StationName ?? "");
}

/** Location, FSDJump, CarrierJump. */
const onLocation: EventHandler = (st, ev, at) => {
  const session = st.session;
  st.system = { name: ev.StarSystem, address: ev.SystemAddress };
  if (ev.event === "FSDJump") {
    session.jumps += 1;
    session.distance += num(ev.JumpDist) ?? 0;
  }
  if (ev.Docked && ev.MarketID) {
    st.markets[ev.MarketID] = { station: ev.StationName, system: ev.StarSystem };
    dockAt(st, ev, at);
  } else if (ev.event === "FSDJump") st.docked = undefined;
  pruneBodies(st);
  return true;
};

/** Journal events of this domain. */
export const TRAVEL_EVENTS: EventHandlers = {
  // A new journal file or the game closing ends the session; a relog from the main menu doesn't.
  Fileheader: (st) => {
    st.gameRestarted = true;
    return false;
  },
  Shutdown: (st) => {
    st.gameRestarted = true;
    return false;
  },
  LoadGame: (st, ev, at) => {
    const relog = Boolean(st.session.start) && st.gameRestarted === false;
    st.gameRestarted = false;
    if (relog) return false;
    st.session = { ...emptySession(), start: at, credits: num(ev.Credits) };
    st.mining = emptyMining();
    return true;
  },
  Location: onLocation,
  FSDJump: onLocation,
  CarrierJump: onLocation,
  Undocked: (st, ev) => {
    st.docked = undefined;
    return false;
  },
  Docked: (st, ev, at) => {
    dockAt(st, ev, at);
    if (ev.MarketID) st.markets[ev.MarketID] = { station: ev.StationName, system: ev.StarSystem };
    if (ev.MarketID && st.depots[ev.MarketID])
      Object.assign(st.depots[ev.MarketID], { station: ev.StationName, system: ev.StarSystem });
    return false;
  },
  Died: (st, ev) => {
    const session = st.session;
    session.deaths += 1;
    // Death loses unsold cartography and exobiology.
    st.unsoldSystems = {};
    st.organics = [];
    st.sampling = undefined;
    pruneBodies(st);
    return true;
  },
};
