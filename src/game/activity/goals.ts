// Community goals the commander takes part in, with the history of their contribution.

import { num, type EventHandlers } from "./state.js";

/** Journal events of this domain. */
export const GOALS_EVENTS: EventHandlers = {
  CommunityGoal: (st, ev, at) => {
    for (const g of ev.CurrentGoals ?? []) {
      const id = Number(g.CGID);
      const prev = st.goals[id];
      const contribution = num(g.PlayerContribution) ?? 0;
      const history = prev?.history ?? [];
      if (!history.length || history[history.length - 1].contribution !== contribution)
        history.push({ at, contribution });
      st.goals[id] = {
        id,
        title: String(g.Title ?? ""),
        system: String(g.SystemName ?? ""),
        market: String(g.MarketName ?? ""),
        expiry: String(g.Expiry ?? ""),
        complete: Boolean(g.IsComplete),
        total: num(g.CurrentTotal),
        contribution,
        contributors: num(g.NumContributors),
        topTier: g.TopTier ? { name: String(g.TopTier.Name ?? ""), bonus: g.TopTier.Bonus } : undefined,
        topRankSize: num(g.TopRankSize),
        inTopRank: g.PlayerInTopRank,
        tierReached: g.TierReached,
        percentile: num(g.PlayerPercentileBand),
        bonus: num(g.Bonus),
        updated: at,
        history: history.slice(-50),
      };
    }
    return true;
  },
};
