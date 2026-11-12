// Fleet carriers' holds (rebuilt from transfers, market trades and stats, since the journal
// never lists a carrier's cargo) and the trade tallies of the session. The carrier's market
// (Market.json) corrects the estimate when it is read, so later transfers count from it: for your
// own carrier it is a floor (what it sells is in its hold, at least the stock offered; you may keep
// goods without a sell order); for another carrier (your squadron's) it is the truth, since other
// players empty it without your journal seeing it.

import {
  num,
  symbolId,
  type ActivityState,
  type CarrierHold,
  type CarrierStockSeen,
  type EventHandlers,
} from "./state.js";

/** Adds (or removes, with a negative delta) a commodity in a carrier's hold. */
export function carrierAdd(c: CarrierHold, type: unknown, label: unknown, delta: number) {
  const id = symbolId(type);
  if (!id || !delta) return;
  const item = (c.items[id] ??= { label: String(label ?? id), count: 0 });
  if (label) item.label = String(label);
  item.count = Math.max(0, item.count + delta);
  if (!item.count) delete c.items[id];
}

/**
 * The carrier's market was read (Market.json). Your own carrier: each commodity it sells is in
 * its hold, at least as much as the stock offered (a floor). Another carrier (your squadron's):
 * its hold becomes what the market sells, nothing else, since other players add and take goods
 * without your journal seeing it. Returns true when the estimate changed.
 */
export function noteCarrierStock(st: ActivityState, marketId: number, seen: CarrierStockSeen): boolean {
  const carrier = st.carriers[marketId];
  if (!carrier) return false;
  const selling = seen.stockAtRead ?? {};
  let changed = false;
  if (!carrier.mine) {
    for (const id of Object.keys(carrier.items))
      if (!selling[id]) {
        delete carrier.items[id];
        changed = true;
      }
  }
  for (const [id, line] of Object.entries(selling)) {
    const known = carrier.items[id]?.count ?? 0;
    const wanted = carrier.mine ? Math.max(known, line.count) : line.count;
    if (wanted === known) continue;
    carrierAdd(carrier, id, line.label, wanted - known);
    changed = true;
  }
  if (changed) carrier.updated = seen.marketAt;
  return changed;
}

/** Journal events of this domain. */
export const CARRIERS_EVENTS: EventHandlers = {
  // The market screen of a carrier: replaying the history, the floor its last read market gives
  // is applied at that very moment (live, the app applies it once Market.json is read).
  Market: (st, ev, at, ctx) => {
    const marketId = Number(ev.MarketID);
    const seen = ctx.carrierMarket?.(marketId);
    if (!seen || seen.marketAt !== at) return false;
    return noteCarrierStock(st, marketId, seen);
  },
  CargoTransfer: (st, ev, at) => {
    const c = st.docked?.carrier ? st.carriers[st.docked.marketId] : undefined;
    if (!c) return false;
    for (const transfer of ev.Transfers ?? []) {
      const dir = String(transfer.Direction ?? "").toLowerCase();
      const n = num(transfer.Count) ?? 0;
      if (dir === "tocarrier") carrierAdd(c, transfer.Type, transfer.Type_Localised, n);
      else if (dir === "toship" || dir === "tosrv") carrierAdd(c, transfer.Type, transfer.Type_Localised, -n);
    }
    c.updated = at;
    return true;
  },
  CarrierStats: (st, ev, at) => {
    const id = Number(ev.CarrierID);
    if (!id) return false;
    const c = (st.carriers[id] ??= {
      marketId: id,
      name: String(ev.Callsign ?? ""),
      mine: false,
      squadron: false,
      items: {},
      since: at,
      updated: at,
    });
    c.mine = !/squadron/i.test(String(ev.CarrierType ?? ""));
    c.squadron = /squadron/i.test(String(ev.CarrierType ?? ""));
    c.name = [ev.Name, ev.Callsign].filter(Boolean).join(" · ") || c.name;
    const cargo = num(ev.SpaceUsage?.Cargo);
    if (cargo !== undefined) {
      c.total = cargo;
      c.totalAt = at;
    }
    c.updated = at;
    return true;
  },
  // CarrierDepositFuel isn't handled: the tritium donated comes from the ship's hold, not the
  // carrier's (the ship's Cargo drops by the amount), so the carrier's hold doesn't change.
  MarketBuy: (st, ev, at) => {
    const c = st.carriers[Number(ev.MarketID)];
    if (!c) return false;
    carrierAdd(c, ev.Type, ev.Type_Localised, -(num(ev.Count) ?? 0));
    c.updated = at;
    return true;
  },
  MarketSell: (st, ev, at) => {
    const session = st.session;
    const sold = st.carriers[Number(ev.MarketID)];
    if (sold) {
      // Selling to a carrier's buy order puts the goods in its hold.
      carrierAdd(sold, ev.Type, ev.Type_Localised, num(ev.Count) ?? 0);
      sold.updated = at;
    }
    const total = num(ev.TotalSale) ?? 0;
    const paid = (num(ev.AvgPricePaid) ?? 0) * (num(ev.Count) ?? 0);
    session.trade += total - paid;
    return true;
  },
  MaterialCollected: (st, ev) => {
    const session = st.session;
    session.materials += num(ev.Count) ?? 1;
    return true;
  },
};
