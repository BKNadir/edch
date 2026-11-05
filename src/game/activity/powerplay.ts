// Powerplay: pledged power, rank and merits, with every merit gain dated to count the merits of
// the current Powerplay week.

import { num, type EventHandler, type EventHandlers, type Powerplay } from "./state.js";

/** Start of the Powerplay week containing `at` (weeks start on Thursday 07:00 UTC). */
export function weekStart(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 7));
  const back = (d.getUTCDay() - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  if (d > at) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

/** Merits gained since a date. */
export function meritsSince(pp: Powerplay, since: Date): number {
  return pp.gains.filter((g) => new Date(g.at) >= since).reduce((s, g) => s + g.merits, 0);
}

/** Merits gained this Powerplay week. */
export function meritsThisWeek(pp: Powerplay, now = new Date()): number {
  return meritsSince(pp, weekStart(now));
}

/** PowerplayJoin, PowerplayDefect. */
const onPowerplayJoin: EventHandler = (st, ev) => {
    st.powerplay = { power: ev.Power ?? ev.ToPower, rank: 1, merits: 0, gains: [] };
    return true;
};

/** Journal events of this domain. */
export const POWERPLAY_EVENTS: EventHandlers = {
  Powerplay: (st, ev) => {
    Object.assign(st.powerplay, { power: ev.Power, rank: num(ev.Rank), merits: num(ev.Merits), timePledged: num(ev.TimePledged) });
    return true;
  },
  PowerplayMerits: (st, ev, at) => {
    st.powerplay.power = ev.Power ?? st.powerplay.power;
    st.powerplay.merits = num(ev.TotalMerits) ?? st.powerplay.merits;
    st.powerplay.gains.push({ at, merits: num(ev.MeritsGained) ?? 0 });
    if (st.powerplay.gains.length > 5000) st.powerplay.gains.splice(0, st.powerplay.gains.length - 5000);
    return true;
  },
  PowerplayRank: (st, ev) => {
    st.powerplay.rank = num(ev.Rank) ?? st.powerplay.rank;
    return true;
  },
  PowerplayJoin: onPowerplayJoin,
  PowerplayDefect: onPowerplayJoin,
  PowerplayLeave: (st, ev) => {
    st.powerplay = { gains: [] };
    return true;
  },
};
