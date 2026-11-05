// Exobiology: the sample being taken (and where each sample was taken, for the distance rule),
// analysed organisms not sold yet, and their sale.

import { num, type EventHandlers } from "./state.js";

/** Journal events of this domain. */
export const EXOBIOLOGY_EVENTS: EventHandlers = {
  ScanOrganic: (st, ev, at, ctx) => {
    const symbol = String(ev.Species ?? "").toLowerCase();
    const genusSymbol = String(ev.Genus ?? "").toLowerCase();
    const find = {
      symbol,
      genus: String(ev.Genus_Localised ?? ev.Genus ?? ""),
      species: String(ev.Species_Localised ?? ev.Species ?? ""),
      variant: ev.Variant_Localised ?? ev.Variant,
      address: ev.SystemAddress,
      bodyId: ev.Body,
    };
    const sample = { at, lat: ctx.position?.lat, lon: ctx.position?.lon };
    const same =
      st.sampling &&
      st.sampling.symbol === symbol &&
      st.sampling.address === find.address &&
      st.sampling.bodyId === find.bodyId;
    if (ev.ScanType === "Log" || !same) {
      st.sampling = {
        symbol,
        genusSymbol,
        genus: find.genus,
        species: find.species,
        variant: find.variant,
        address: find.address,
        bodyId: find.bodyId,
        samples: [sample],
      };
    } else {
      st.sampling!.samples.push(sample);
    }
    if (ev.ScanType === "Analyse") {
      const body = Object.values(st.bodies).find((b) => b.address === find.address && b.bodyId === find.bodyId);
      st.organics.push({ ...find, system: body?.system ?? st.system?.name, body: body?.name, at });
      st.sampling = undefined;
    }
    return true;
  },
  SellOrganicData: (st, ev) => {
    const session = st.session;
    for (const d of ev.BioData ?? []) {
      session.exobiology += (num(d.Value) ?? 0) + (num(d.Bonus) ?? 0);
      const i = st.organics.findIndex((o) => o.symbol === String(d.Species ?? "").toLowerCase());
      if (i >= 0) st.organics.splice(i, 1);
    }
    return true;
  },
};
