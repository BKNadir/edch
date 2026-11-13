// BGS (background simulation): what the journal tells about the minor factions. Two things:
// - what the commander did for or against each faction, system by system (missions and their
//   influence, bounties and combat bonds cashed in, trade profit, cartography sold, crimes,
//   missions failed or abandoned);
// - the factions seen in each system visited (influence, states, conflicts), with a short history
//   of the visits, so the BGS page has first-hand data next to Spansh's.
// Rebuilt from the journal at start-up like the rest of the activity (nothing stored).
// Credit: the action categories follow Cyberpunk Philou's BGS prototype (pull request #2).

import { num, type ActivityState, type EventHandler, type EventHandlers, type Json } from "./state.js";

/** What a BGS action was. */
export type BgsActionKind =
  | "mission"
  | "missionFailed"
  | "missionAbandoned"
  | "bounty"
  | "combatBond"
  | "trade"
  | "blackMarket"
  | "exploration"
  | "crime";

/** One thing the commander did that moves a faction's influence, as the journal tells it. */
export interface BgsAction {
  /** Journal timestamp (UTC). */
  at: string;
  kind: BgsActionKind;
  /** The system where it counts (where the mission's influence goes, where a voucher is cashed…). */
  system: string;
  faction: string;
  /** Credits involved (reward, voucher, trade profit, cartography sold); none for crimes. */
  credits?: number;
  /** Mission influence, as the game shows it: 1 to 5 "+" (negative when it lowers the faction). */
  influence?: number;
  /** The action lowers the faction (crime, failed or abandoned mission, a mission against it). */
  against: boolean;
}

/** A faction present in a system, as seen on arrival. */
export interface FactionPresence {
  name: string;
  /** Influence in percent (0–100). */
  influence: number;
  state: string;
  active: string[];
  pending: string[];
  recovering: string[];
}

/** A war or election in a system: the two sides, what is at stake and the days won. */
export interface FactionConflict {
  type: string;
  status: string;
  sides: { name: string; stake: string; wonDays: number }[];
}

/** Each faction's influence (percent) in a system at one moment. */
export interface InfluenceSample {
  at: string;
  influences: Record<string, number>;
}

/** A system's factions as the journal last showed them, with the influences of earlier visits. */
export interface SystemObservation {
  system: string;
  at: string;
  controlling?: string;
  factions: FactionPresence[];
  conflicts: FactionConflict[];
  /** Earlier visits (oldest first): when, and each faction's influence then. */
  history: InfluenceSample[];
}

export interface BgsJournal {
  actions: BgsAction[];
  /** By system name. */
  observed: Record<string, SystemObservation>;
  /** System address → name (missions give the address of the system their influence goes to). */
  systemNames: Record<number, string>;
  /** The faction of the station you're docked at (trade and cartography count for it). */
  stationFaction?: string;
}

export const emptyBgs = (): BgsJournal => ({ actions: [], observed: {}, systemNames: {} });

/** Bounds: two months of actions at a busy pace, and the systems of a long patrol area. */
const MAX_ACTIONS = 4000;
const MAX_SYSTEMS = 400;
const MAX_HISTORY = 12;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const states = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((entry) => text(entry?.State)).filter(Boolean) : [];
const percent = (value: unknown) => {
  const n = num(value);
  return n === undefined ? 0 : Math.round(n * 1000) / 10;
};

function add(st: ActivityState, action: BgsAction) {
  if (!action.faction || !action.system) return;
  st.bgs.actions.push(action);
  if (st.bgs.actions.length > MAX_ACTIONS) st.bgs.actions.splice(0, st.bgs.actions.length - MAX_ACTIONS);
}

const here = (st: ActivityState) => st.system?.name ?? "";

/** Location, FSDJump, CarrierJump: the system's factions (when it has any). */
const onArrival: EventHandler = (st, ev, at) => {
  const system = text(ev.StarSystem);
  const address = num(ev.SystemAddress);
  if (system && address) st.bgs.systemNames[address] = system;
  if (ev.event !== "CarrierJump" || ev.Docked) st.bgs.stationFaction = text(ev.StationFaction?.Name) || undefined;
  if (!system || !Array.isArray(ev.Factions) || !ev.Factions.length) return false;
  const factions: FactionPresence[] = ev.Factions.map((f: Json) => ({
    name: text(f.Name),
    influence: percent(f.Influence),
    state: text(f.FactionState) || "None",
    active: states(f.ActiveStates),
    pending: states(f.PendingStates),
    recovering: states(f.RecoveringStates),
  })).filter((f: FactionPresence) => f.name);
  const conflicts: FactionConflict[] = Array.isArray(ev.Conflicts)
    ? ev.Conflicts.map((c: Json) => ({
        type: text(c.WarType),
        status: text(c.Status),
        sides: [c.Faction1, c.Faction2].map((side: Json) => ({
          name: text(side?.Name),
          stake: text(side?.Stake),
          wonDays: num(side?.WonDays) ?? 0,
        })),
      }))
    : [];
  const previous = st.bgs.observed[system];
  const history = previous ? [...previous.history] : [];
  const influences = Object.fromEntries(factions.map((f) => [f.name, f.influence]));
  // One sample per visit; a visit with the same influences as the last one adds nothing.
  if (JSON.stringify(history.at(-1)?.influences) !== JSON.stringify(influences)) history.push({ at, influences });
  st.bgs.observed[system] = {
    system,
    at,
    controlling: text(ev.SystemFaction?.Name) || undefined,
    factions,
    conflicts,
    history: history.slice(-MAX_HISTORY),
  };
  const names = Object.keys(st.bgs.observed);
  if (names.length > MAX_SYSTEMS) {
    const oldest = names.sort((a, b) => st.bgs.observed[a].at.localeCompare(st.bgs.observed[b].at));
    for (const name of oldest.slice(0, names.length - MAX_SYSTEMS)) delete st.bgs.observed[name];
  }
  return true;
};

/** The number of "+" of a mission's influence ("+++" → 3), signed by its trend. */
function influenceOf(entry: Json): number {
  const plus = text(entry.Influence).length;
  return /^Down/.test(text(entry.Trend)) ? -plus : plus;
}

const onMissionCompleted: EventHandler = (st, ev, at) => {
  const effects: Json[] = Array.isArray(ev.FactionEffects) ? ev.FactionEffects : [];
  let changed = false;
  for (const effect of effects) {
    const faction = text(effect.Faction);
    for (const entry of Array.isArray(effect.Influence) ? effect.Influence : []) {
      const influence = influenceOf(entry);
      if (!faction || !influence) continue;
      const system = st.bgs.systemNames[num(entry.SystemAddress) ?? 0] ?? text(ev.DestinationSystem) ?? here(st);
      add(st, {
        at,
        kind: "mission",
        system: system || here(st),
        faction,
        influence,
        credits: faction === text(ev.Faction) ? (num(ev.Reward) ?? 0) : undefined,
        against: influence < 0,
      });
      changed = true;
    }
  }
  return changed;
};

/** Failed or abandoned: it lowers the faction that gave the mission. */
const onMissionLost: EventHandler = (st, ev, at) => {
  const mission = st.missions[Number(ev.MissionID)];
  if (!mission?.faction) return false;
  add(st, {
    at,
    kind: ev.event === "MissionFailed" ? "missionFailed" : "missionAbandoned",
    system: here(st),
    faction: mission.faction,
    against: true,
  });
  return true;
};

const onVoucher: EventHandler = (st, ev, at) => {
  const type = text(ev.Type).toLowerCase();
  const system = here(st);
  if (type === "bounty" && Array.isArray(ev.Factions)) {
    for (const f of ev.Factions)
      add(st, { at, kind: "bounty", system, faction: text(f.Faction), credits: num(f.Amount), against: false });
    return true;
  }
  if (type === "combatbond") {
    add(st, { at, kind: "combatBond", system, faction: text(ev.Faction), credits: num(ev.Amount), against: false });
    return true;
  }
  return false;
};

const onMarketSell: EventHandler = (st, ev, at) => {
  const faction = st.bgs.stationFaction;
  if (!faction) return false;
  const count = num(ev.Count) ?? 0;
  const profit = (num(ev.TotalSale) ?? 0) - (num(ev.AvgPricePaid) ?? 0) * count;
  add(st, {
    at,
    kind: ev.BlackMarket ? "blackMarket" : "trade",
    system: here(st),
    faction,
    credits: Math.round(profit),
    against: false,
  });
  return true;
};

const onExploration: EventHandler = (st, ev, at) => {
  const faction = st.bgs.stationFaction;
  if (!faction) return false;
  const credits = num(ev.TotalEarnings) ?? num(ev.BaseValue) ?? 0;
  add(st, { at, kind: "exploration", system: here(st), faction, credits, against: false });
  return true;
};

/** A crime: it counts against the faction whose law was broken. */
const onCrime: EventHandler = (st, ev, at) => {
  add(st, { at, kind: "crime", system: here(st), faction: text(ev.Faction), against: true });
  return true;
};

/** Journal events of this domain (MissionFailed / Abandoned run before the missions domain's). */
export const BGS_EVENTS: EventHandlers = {
  Location: onArrival,
  FSDJump: onArrival,
  CarrierJump: onArrival,
  Docked: (st, ev) => {
    st.bgs.stationFaction = text(ev.StationFaction?.Name) || undefined;
    return false;
  },
  Undocked: (st) => {
    st.bgs.stationFaction = undefined;
    return false;
  },
  MissionCompleted: onMissionCompleted,
  MissionFailed: onMissionLost,
  MissionAbandoned: onMissionLost,
  RedeemVoucher: onVoucher,
  MarketSell: onMarketSell,
  SellExplorationData: onExploration,
  MultiSellExplorationData: onExploration,
  CommitCrime: onCrime,
};
