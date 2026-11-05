// Activity state: everything EDCH remembers across sessions from the journal (missions,
// colonisation depots, community goals, unsold exploration and exobiology data, carriers,
// Powerplay merits) plus the current session's tallies and mining. The event handlers of each
// domain (missions.ts, exploration.ts…) update it; index.ts dispatches the events to them.

type Json = Record<string, any>;
export type { Json };

export interface Mission {
  id: number;
  /** Journal symbol, e.g. Mission_Massacre_Conflict_name. */
  name: string;
  /** Localised title as the game shows it. */
  title: string;
  faction: string;
  accepted: string;
  expiry?: string;
  destSystem?: string;
  destStation?: string;
  wing: boolean;
  reward?: number;
  influence?: string;
  reputation?: string;
  commodity?: string;
  /** Commodity symbol, lower case (e.g. "steel"). */
  commodityId?: string;
  count?: number;
  targetFaction?: string;
  target?: string;
  killCount?: number;
  kills: number;
  passengers?: number;
  /** Wing/delivery missions: CargoDepot progress. */
  delivered?: number;
  collected?: number;
  total?: number;
  status: "active" | "redirected";
}

export interface DepotResource {
  /** Commodity symbol, lower case, without $…_name;. */
  id: string;
  label: string;
  required: number;
  provided: number;
  payment?: number;
}

export interface Depot {
  marketId: number;
  station?: string;
  system?: string;
  progress: number;
  complete: boolean;
  failed: boolean;
  resources: DepotResource[];
  updated: string;
}

/**
 * What a fleet carrier holds, rebuilt from the journal. The journal never lists a carrier's
 * hold: it is estimated from transfers between ship and carrier, and from buying from or
 * selling to the carrier's market. The total comes from CarrierStats (own carrier only).
 */
export interface CarrierHold {
  marketId: number;
  /** Name or callsign as the game shows it when docking. */
  name: string;
  /** Your own carrier (seen in CarrierStats). */
  mine: boolean;
  /** A squadron carrier. */
  squadron: boolean;
  items: Record<string, { label: string; count: number }>;
  /** Total tonnes of cargo according to the game (CarrierStats), and when. */
  total?: number;
  totalAt?: string;
  /** First event this estimate is built from. */
  since: string;
  updated: string;
}

export interface CommunityGoal {
  id: number;
  title: string;
  system: string;
  market: string;
  expiry: string;
  complete: boolean;
  total?: number;
  contribution?: number;
  contributors?: number;
  topTier?: { name: string; bonus?: string };
  topRankSize?: number;
  inTopRank?: boolean;
  tierReached?: string;
  percentile?: number;
  bonus?: number;
  updated: string;
  history: { at: string; contribution: number }[];
}

export interface BodyInfo {
  key: string;
  system: string;
  address?: number;
  bodyId?: number;
  name: string;
  star?: string;
  planetClass?: string;
  atmosphere?: string;
  volcanism?: string;
  /** In g. */
  gravity?: number;
  temperature?: number;
  /** In atmospheres. */
  pressure?: number;
  massEM?: number;
  stellarMass?: number;
  terraform?: string;
  landable?: boolean;
  radius?: number;
  wasDiscovered?: boolean;
  wasMapped?: boolean;
  wasFootfalled?: boolean;
  mapped?: boolean;
  efficient?: boolean;
  bio?: number;
  geo?: number;
  genera: string[];
  scannedAt: string;
}

export interface OrganicFind {
  symbol: string;
  genus: string;
  species: string;
  variant?: string;
  system?: string;
  body?: string;
  address?: number;
  bodyId?: number;
  at: string;
}

export interface Sampling {
  symbol: string;
  genus: string;
  genusSymbol: string;
  species: string;
  variant?: string;
  address?: number;
  bodyId?: number;
  samples: { at: string; lat?: number; lon?: number }[];
}

export interface Session {
  start?: string;
  credits?: number;
  bounties: number;
  bonds: number;
  trade: number;
  exploration: number;
  exobiology: number;
  missions: number;
  jumps: number;
  distance: number;
  kills: number;
  deaths: number;
  materials: number;
  refined: number;
  missionsDone: number;
}

export interface Prospect {
  at: string;
  materials: { name: string; label: string; pct: number }[];
  content?: string;
  motherlode?: string;
  remaining?: number;
}

export interface Mining {
  started?: string;
  prospectors: number;
  collectors: number;
  cracked: number;
  prospected: number;
  refined: Record<string, { label: string; count: number }>;
  last: Prospect[];
}

export interface Powerplay {
  power?: string;
  rank?: number;
  merits?: number;
  timePledged?: number;
  gains: { at: string; merits: number }[];
}

export interface ActivityState {
  missions: Record<number, Mission>;
  /** Recently finished missions (id → outcome), for the wing view. */
  finished: Record<number, { status: "done" | "failed" | "abandoned"; at: string }>;
  markets: Record<number, { station: string; system: string }>;
  depots: Record<number, Depot>;
  carriers: Record<number, CarrierHold>;
  /** Where you are docked (market id, and whether it is a fleet carrier). */
  docked?: { marketId: number; carrier: boolean; squadron: boolean; name: string };
  goals: Record<number, CommunityGoal>;
  bodies: Record<string, BodyInfo>;
  /** Systems with unsold cartographic data, by name: body keys scanned there. */
  unsoldSystems: Record<string, string[]>;
  organics: OrganicFind[];
  sampling?: Sampling;
  session: Session;
  mining: Mining;
  powerplay: Powerplay;
  system?: { name: string; address?: number };
  /** Timestamp of the newest event folded in. */
  lastAt?: string;
}

/** Extra live information some events need. */
export interface ActivityContext {
  /** Live position on a planet (Status.json), for exobiology sample spacing. */
  position?: { lat: number; lon: number };
}

/**
 * Applies one journal event to the state. `at` is the event's timestamp. Returns true when
 * something visible changed.
 */
export type EventHandler = (st: ActivityState, ev: Json, at: string, ctx: ActivityContext) => boolean;
/** Handlers by journal event name. */
export type EventHandlers = Record<string, EventHandler>;

export function emptySession(): Session {
  return { bounties: 0, bonds: 0, trade: 0, exploration: 0, exobiology: 0, missions: 0, jumps: 0, distance: 0, kills: 0, deaths: 0, materials: 0, refined: 0, missionsDone: 0 };
}

export function emptyMining(): Mining {
  return { prospectors: 0, collectors: 0, cracked: 0, prospected: 0, refined: {}, last: [] };
}

export function emptyActivity(): ActivityState {
  return {
    missions: {},
    finished: {},
    markets: {},
    depots: {},
    carriers: {},
    goals: {},
    bodies: {},
    unsoldSystems: {},
    organics: [],
    session: emptySession(),
    mining: emptyMining(),
    powerplay: { gains: [] },
  };
}

/** "$Painite_Name;" / "painite" → "painite" */
export function symbolId(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/_name;$/, "")
    .replace(/;$/, "");
}

/** A finite number from the journal, or undefined. */
export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
