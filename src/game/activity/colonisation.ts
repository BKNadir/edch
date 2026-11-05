// Colonisation construction depots: what each site still needs, updated from the depot's market
// and from the commander's own deliveries.

import { num, symbolId, type EventHandlers, type Json } from "./state.js";

/** Journal events of this domain. */
export const COLONISATION_EVENTS: EventHandlers = {
  ColonisationConstructionDepot: (st, ev, at) => {
    const id = Number(ev.MarketID);
    const where = st.markets[id];
    const prev = st.depots[id];
    st.depots[id] = {
      marketId: id,
      station: where?.station ?? prev?.station,
      system: where?.system ?? prev?.system,
      progress: num(ev.ConstructionProgress) ?? prev?.progress ?? 0,
      complete: Boolean(ev.ConstructionComplete),
      failed: Boolean(ev.ConstructionFailed),
      resources: (ev.ResourcesRequired ?? []).map((r: Json) => ({
        id: symbolId(r.Name),
        label: String(r.Name_Localised ?? symbolId(r.Name)),
        required: num(r.RequiredAmount) ?? 0,
        provided: num(r.ProvidedAmount) ?? 0,
        payment: num(r.Payment),
      })),
      updated: at,
    };
    return true;
  },
  ColonisationContribution: (st, ev, at) => {
    const d = st.depots[Number(ev.MarketID)];
    if (!d) return false;
    for (const c of ev.Contributions ?? []) {
      const r = d.resources.find((x) => x.id === symbolId(c.Name));
      if (r) r.provided = Math.min(r.required, r.provided + (num(c.Amount) ?? 0));
    }
    d.updated = at;
    return true;
  },
};
