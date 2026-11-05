// Fleet carriers' holds (rebuilt from transfers, market trades and stats, since the journal
// never lists a carrier's cargo) and the trade tallies of the session.

import { num, symbolId, type CarrierHold, type EventHandlers } from "./state.js";

/** Adds (or removes, with a negative delta) a commodity in a carrier's hold. */
export function carrierAdd(c: CarrierHold, type: unknown, label: unknown, delta: number) {
  const id = symbolId(type);
  if (!id || !delta) return;
  const item = (c.items[id] ??= { label: String(label ?? id), count: 0 });
  if (label) item.label = String(label);
  item.count = Math.max(0, item.count + delta);
  if (!item.count) delete c.items[id];
}

/** Journal events of this domain. */
export const CARRIERS_EVENTS: EventHandlers = {
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
    const c = (st.carriers[id] ??= { marketId: id, name: String(ev.Callsign ?? ""), mine: false, squadron: false, items: {}, since: at, updated: at });
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
  CarrierDepositFuel: (st, ev, at) => {
    // Tritium from the carrier's hold into its tank.
    const c = st.carriers[Number(ev.CarrierID)];
    if (!c) return false;
    carrierAdd(c, "tritium", "Tritium", -(num(ev.Amount) ?? 0));
    c.updated = at;
    return true;
  },
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
