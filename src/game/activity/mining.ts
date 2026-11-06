// Mining session: limpets launched, asteroids prospected (with their content) and cracked, and
// what was refined.

import { num, symbolId, type EventHandlers, type Json } from "./state.js";

/** Journal events of this domain. */

/** "$AsteroidMaterialContent_Low;" → "Low" (shown in the app's language); else the game's text. */
function contentLevel(ev: Json): string | undefined {
  const level = /AsteroidMaterialContent_(Low|Medium|High)/.exec(String(ev.Content ?? ""));
  return level ? level[1] : (ev.Content_Localised ?? ev.Content);
}

export const MINING_EVENTS: EventHandlers = {
  LaunchDrone: (st, ev, at) => {
    if (ev.Type === "Prospector") st.mining.prospectors += 1;
    else if (ev.Type === "Collection") st.mining.collectors += 1;
    else return false;
    st.mining.started ??= at;
    return true;
  },
  ProspectedAsteroid: (st, ev, at) => {
    const m = st.mining;
    m.started ??= at;
    m.prospected += 1;
    m.last.unshift({
      at,
      materials: (ev.Materials ?? [])
        .map((x: Json) => ({
          name: symbolId(x.Name),
          label: String(x.Name_Localised ?? x.Name ?? ""),
          pct: num(x.Proportion) ?? 0,
        }))
        .sort((a: { pct: number }, b: { pct: number }) => b.pct - a.pct),
      content: contentLevel(ev),
      motherlode: ev.MotherlodeMaterial_Localised ?? ev.MotherlodeMaterial,
      remaining: num(ev.Remaining),
    });
    m.last.length = Math.min(m.last.length, 20);
    return true;
  },
  AsteroidCracked: (st, ev) => {
    st.mining.cracked += 1;
    return true;
  },
  MiningRefined: (st, ev, at) => {
    const session = st.session;
    const id = symbolId(ev.Type);
    const r = (st.mining.refined[id] ??= { label: String(ev.Type_Localised ?? id), count: 0 });
    r.count += 1;
    session.refined += 1;
    st.mining.started ??= at;
    return true;
  },
};
