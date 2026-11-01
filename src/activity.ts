// Everything that outlives one session: missions, colonisation depots, community goals, unsold
// exploration and exobiology data, Powerplay merits, plus the current session's tallies and
// mining. Rebuilt at start-up from the last weeks of journal (scan_history), then kept up to date
// by live events. Pure functions, like journal.ts.

type Json = Record<string, any>;

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
    goals: {},
    bodies: {},
    unsoldSystems: {},
    organics: [],
    session: emptySession(),
    mining: emptyMining(),
    powerplay: { gains: [] },
  };
}

/** Events read back from the journal archive at start-up. */
export const HISTORY_EVENTS = [
  "LoadGame", "Location", "FSDJump", "CarrierJump", "Docked", "Died", "Resurrect",
  "Missions", "MissionAccepted", "MissionCompleted", "MissionFailed", "MissionAbandoned", "MissionRedirected", "CargoDepot", "Bounty", "FactionKillBond",
  "ColonisationConstructionDepot", "ColonisationContribution",
  "CommunityGoal",
  "Scan", "SAAScanComplete", "FSSBodySignals", "SAASignalsFound", "SellExplorationData", "MultiSellExplorationData",
  "ScanOrganic", "SellOrganicData",
  "RedeemVoucher", "MarketSell", "MaterialCollected",
  "MiningRefined", "ProspectedAsteroid", "LaunchDrone", "AsteroidCracked",
  "Powerplay", "PowerplayMerits", "PowerplayRank", "PowerplayJoin", "PowerplayLeave", "PowerplayDefect",
];

/** How far back the archive is read. */
export const HISTORY_DAYS = 60;

const G = 9.80665;
const ATM = 101325;

/** "$Painite_Name;" / "painite" → "painite" */
export function symbolId(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/_name;$/, "")
    .replace(/;$/, "");
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function bodyKey(ev: Json): string {
  if (ev.SystemAddress != null && ev.BodyID != null) return `${ev.SystemAddress}:${ev.BodyID}`;
  return `name:${String(ev.BodyName ?? ev.Body ?? "").toLowerCase()}`;
}

function getBody(st: ActivityState, ev: Json): BodyInfo {
  const key = bodyKey(ev);
  let b = st.bodies[key];
  if (!b) {
    b = {
      key,
      system: ev.StarSystem ?? st.system?.name ?? "",
      address: ev.SystemAddress ?? undefined,
      bodyId: ev.BodyID ?? undefined,
      name: ev.BodyName ?? ev.Body ?? "",
      genera: [],
      scannedAt: ev.timestamp ?? "",
    };
    st.bodies[key] = b;
  }
  if (!b.system && st.system?.name) b.system = st.system.name;
  return b;
}

function markUnsold(st: ActivityState, b: BodyInfo) {
  if (!b.system) return;
  const list = (st.unsoldSystems[b.system] ??= []);
  if (!list.includes(b.key)) list.push(b.key);
}

function forgetSystems(st: ActivityState, names: string[]) {
  for (const n of names) {
    const keys = st.unsoldSystems[n];
    delete st.unsoldSystems[n];
    for (const k of keys ?? []) {
      const b = st.bodies[k];
      // Keep bodies of the current system (still useful for exobiology).
      if (b && b.address !== st.system?.address) delete st.bodies[k];
    }
  }
}

/** Keeps the body table small: the current system plus systems with unsold data. */
function pruneBodies(st: ActivityState) {
  const keep = new Set(Object.values(st.unsoldSystems).flat());
  for (const [k, b] of Object.entries(st.bodies)) {
    if (keep.has(k) || b.address === st.system?.address) continue;
    if (st.organics.some((o) => o.address === b.address && o.bodyId === b.bodyId)) continue;
    delete st.bodies[k];
  }
}

function weekStart(at: Date): Date {
  // Powerplay weeks start on Thursday 07:00 UTC.
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 7));
  const back = (d.getUTCDay() - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  if (d > at) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

export function meritsSince(pp: Powerplay, since: Date): number {
  return pp.gains.filter((g) => new Date(g.at) >= since).reduce((s, g) => s + g.merits, 0);
}

export function meritsThisWeek(pp: Powerplay, now = new Date()): number {
  return meritsSince(pp, weekStart(now));
}

export { weekStart };

/** "Mission_Delivery_Boom_Wing_name" → "Delivery Boom Wing" (when the game gave no localised title). */
export function missionTitle(symbol: string): string {
  return symbol.replace(/^Mission_/i, "").replace(/_name$/i, "").replace(/_/g, " ").trim() || "Mission";
}

function massacreKill(st: ActivityState, victimFaction: string) {
  // One kill counts towards one mission per issuing faction: the oldest unfinished one.
  const byIssuer = new Map<string, Mission>();
  const candidates = Object.values(st.missions)
    .filter((m) => m.status === "active" && m.killCount && m.targetFaction === victimFaction && m.kills < m.killCount)
    .sort((a, b) => a.accepted.localeCompare(b.accepted));
  for (const m of candidates) if (!byIssuer.has(m.faction)) byIssuer.set(m.faction, m);
  for (const m of byIssuer.values()) m.kills += 1;
}

export interface ActivityContext {
  /** Live position on a planet (Status.json), for exobiology sample spacing. */
  position?: { lat: number; lon: number };
}

/** Folds one journal event. Returns true when something visible changed. */
export function applyActivity(st: ActivityState, ev: Json, ctx: ActivityContext = {}): boolean {
  if (!ev || typeof ev.event !== "string") return false;
  const at: string = ev.timestamp ?? "";
  if (at && st.lastAt && at < st.lastAt) return false;
  if (at) st.lastAt = at;
  const s = st.session;

  switch (ev.event) {
    case "LoadGame":
      st.session = { ...emptySession(), start: at, credits: num(ev.Credits) };
      st.mining = emptyMining();
      return true;

    case "Location":
    case "FSDJump":
    case "CarrierJump":
      st.system = { name: ev.StarSystem, address: ev.SystemAddress };
      if (ev.event === "FSDJump") {
        s.jumps += 1;
        s.distance += num(ev.JumpDist) ?? 0;
      }
      if (ev.Docked && ev.MarketID) st.markets[ev.MarketID] = { station: ev.StationName, system: ev.StarSystem };
      pruneBodies(st);
      return true;

    case "Docked":
      if (ev.MarketID) st.markets[ev.MarketID] = { station: ev.StationName, system: ev.StarSystem };
      if (ev.MarketID && st.depots[ev.MarketID]) Object.assign(st.depots[ev.MarketID], { station: ev.StationName, system: ev.StarSystem });
      return false;

    case "Died":
      s.deaths += 1;
      // Death loses unsold cartography and exobiology.
      st.unsoldSystems = {};
      st.organics = [];
      st.sampling = undefined;
      pruneBodies(st);
      return true;

    // ---------- missions ----------
    case "Missions": {
      const list: Json[] = ev.Active ?? [];
      const active = new Set<number>(list.map((m: Json) => Number(m.MissionID)));
      for (const id of Object.keys(st.missions).map(Number)) if (!active.has(id)) delete st.missions[id];
      // Missions the archive didn't show being accepted (older than the archive, or accepted in a way
      // the journal doesn't log): keep them visible with what the login list says.
      for (const m of list) {
        const id = Number(m.MissionID);
        if (st.missions[id] || !id) continue;
        const name = String(m.Name ?? "");
        st.missions[id] = {
          id,
          name,
          title: missionTitle(name),
          faction: "",
          accepted: at,
          expiry: typeof m.Expires === "number" && at ? new Date(Date.parse(at) + m.Expires * 1000).toISOString() : undefined,
          wing: /wing/i.test(name),
          kills: 0,
          status: "active",
        };
      }
      return true;
    }
    case "MissionAccepted": {
      const id = Number(ev.MissionID);
      st.missions[id] = {
        id,
        name: String(ev.Name ?? ""),
        title: String(ev.LocalisedName ?? ev.Name ?? ""),
        faction: String(ev.Faction ?? ""),
        accepted: at,
        expiry: ev.Expiry,
        destSystem: ev.DestinationSystem,
        destStation: ev.DestinationStation ?? ev.DestinationSettlement,
        wing: Boolean(ev.Wing),
        reward: num(ev.Reward),
        influence: ev.Influence,
        reputation: ev.Reputation,
        commodity: ev.Commodity_Localised ?? ev.Commodity,
        count: num(ev.Count),
        targetFaction: ev.TargetFaction,
        target: ev.Target_Localised ?? ev.Target ?? ev.TargetType_Localised,
        killCount: num(ev.KillCount),
        kills: 0,
        passengers: num(ev.PassengerCount),
        status: "active",
      };
      return true;
    }
    case "MissionRedirected": {
      const m = st.missions[Number(ev.MissionID)];
      if (!m) return false;
      m.status = "redirected";
      m.destSystem = ev.NewDestinationSystem ?? m.destSystem;
      m.destStation = ev.NewDestinationStation ?? m.destStation;
      if (m.killCount) m.kills = Math.max(m.kills, m.killCount);
      return true;
    }
    case "MissionCompleted":
    case "MissionFailed":
    case "MissionAbandoned": {
      const id = Number(ev.MissionID);
      const known = Boolean(st.missions[id]);
      delete st.missions[id];
      st.finished[id] = { status: ev.event === "MissionCompleted" ? "done" : ev.event === "MissionFailed" ? "failed" : "abandoned", at };
      if (ev.event === "MissionCompleted") {
        s.missions += num(ev.Reward) ?? 0;
        s.missionsDone += 1;
      }
      // Keep the list of finished missions short.
      const ids = Object.keys(st.finished);
      if (ids.length > 200) for (const old of ids.slice(0, ids.length - 200)) delete st.finished[Number(old)];
      return known || ev.event === "MissionCompleted";
    }
    case "CargoDepot": {
      const id = Number(ev.MissionID);
      if (!st.missions[id] && id && !st.finished[id]) {
        st.missions[id] = { id, name: "Mission_Delivery_Wing", title: missionTitle(`Mission_Delivery_${ev.CargoType ?? ""}`), faction: "", accepted: at, wing: true, kills: 0, status: "active" };
      }
      const m = st.missions[id];
      if (!m) return false;
      m.delivered = num(ev.ItemsDelivered) ?? m.delivered;
      m.collected = num(ev.ItemsCollected) ?? m.collected;
      m.total = num(ev.TotalItemsToDeliver) ?? m.total;
      return true;
    }
    case "Bounty": {
      s.kills += 1; // credits are counted when redeemed (RedeemVoucher)
      const victim = ev.VictimFaction_Localised ?? ev.VictimFaction;
      if (victim) massacreKill(st, String(victim));
      return true;
    }
    case "FactionKillBond":
      s.kills += 1;
      return true;
    case "RedeemVoucher": {
      const amount = num(ev.Amount) ?? 0;
      if (ev.Type === "bounty") s.bounties += amount;
      else if (ev.Type === "CombatBond") s.bonds += amount;
      return true;
    }

    // ---------- colonisation ----------
    case "ColonisationConstructionDepot": {
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
    }
    case "ColonisationContribution": {
      const d = st.depots[Number(ev.MarketID)];
      if (!d) return false;
      for (const c of ev.Contributions ?? []) {
        const r = d.resources.find((x) => x.id === symbolId(c.Name));
        if (r) r.provided = Math.min(r.required, r.provided + (num(c.Amount) ?? 0));
      }
      d.updated = at;
      return true;
    }

    // ---------- community goals ----------
    case "CommunityGoal": {
      for (const g of ev.CurrentGoals ?? []) {
        const id = Number(g.CGID);
        const prev = st.goals[id];
        const contribution = num(g.PlayerContribution) ?? 0;
        const history = prev?.history ?? [];
        if (!history.length || history[history.length - 1].contribution !== contribution) history.push({ at, contribution });
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
    }

    // ---------- exploration ----------
    case "Scan": {
      if (!ev.BodyName) return false;
      const b = getBody(st, ev);
      b.name = ev.BodyName;
      b.star = ev.StarType;
      b.planetClass = ev.PlanetClass;
      b.atmosphere = ev.Atmosphere;
      b.volcanism = ev.Volcanism;
      b.gravity = num(ev.SurfaceGravity) !== undefined ? ev.SurfaceGravity / G : b.gravity;
      b.temperature = num(ev.SurfaceTemperature) ?? b.temperature;
      b.pressure = num(ev.SurfacePressure) !== undefined ? ev.SurfacePressure / ATM : b.pressure;
      b.massEM = num(ev.MassEM);
      b.stellarMass = num(ev.StellarMass);
      b.terraform = ev.TerraformState || undefined;
      b.landable = ev.Landable;
      b.radius = num(ev.Radius);
      b.wasDiscovered = ev.WasDiscovered;
      b.wasMapped = ev.WasMapped;
      b.wasFootfalled = ev.WasFootfalled;
      b.scannedAt = at;
      if (ev.ScanType !== "NavBeaconDetail") markUnsold(st, b);
      return true;
    }
    case "SAAScanComplete": {
      const b = getBody(st, ev);
      b.mapped = true;
      b.efficient = num(ev.ProbesUsed) !== undefined && num(ev.EfficiencyTarget) !== undefined && ev.ProbesUsed <= ev.EfficiencyTarget;
      markUnsold(st, b);
      return true;
    }
    case "FSSBodySignals":
    case "SAASignalsFound": {
      const b = getBody(st, ev);
      for (const sig of ev.Signals ?? []) {
        const t = String(sig.Type ?? "");
        if (/Biological/i.test(t)) b.bio = num(sig.Count) ?? b.bio;
        if (/Geological/i.test(t)) b.geo = num(sig.Count) ?? b.geo;
      }
      if (Array.isArray(ev.Genuses) && ev.Genuses.length) b.genera = ev.Genuses.map((g: Json) => String(g.Genus ?? "").toLowerCase());
      return true;
    }
    case "SellExplorationData":
      s.exploration += num(ev.TotalEarnings) ?? (num(ev.BaseValue) ?? 0) + (num(ev.Bonus) ?? 0);
      forgetSystems(st, (ev.Systems ?? []).map(String));
      return true;
    case "MultiSellExplorationData":
      s.exploration += num(ev.TotalEarnings) ?? (num(ev.BaseValue) ?? 0) + (num(ev.Bonus) ?? 0);
      forgetSystems(st, (ev.Discovered ?? []).map((d: Json) => String(d.SystemName ?? "")));
      return true;

    // ---------- exobiology ----------
    case "ScanOrganic": {
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
      const same = st.sampling && st.sampling.symbol === symbol && st.sampling.address === find.address && st.sampling.bodyId === find.bodyId;
      if (ev.ScanType === "Log" || !same) {
        st.sampling = { symbol, genusSymbol, genus: find.genus, species: find.species, variant: find.variant, address: find.address, bodyId: find.bodyId, samples: [sample] };
      } else {
        st.sampling!.samples.push(sample);
      }
      if (ev.ScanType === "Analyse") {
        const body = Object.values(st.bodies).find((b) => b.address === find.address && b.bodyId === find.bodyId);
        st.organics.push({ ...find, system: body?.system ?? st.system?.name, body: body?.name, at });
        st.sampling = undefined;
      }
      return true;
    }
    case "SellOrganicData": {
      for (const d of ev.BioData ?? []) {
        s.exobiology += (num(d.Value) ?? 0) + (num(d.Bonus) ?? 0);
        const i = st.organics.findIndex((o) => o.symbol === String(d.Species ?? "").toLowerCase());
        if (i >= 0) st.organics.splice(i, 1);
      }
      return true;
    }

    // ---------- trade, materials ----------
    case "MarketSell": {
      const total = num(ev.TotalSale) ?? 0;
      const paid = (num(ev.AvgPricePaid) ?? 0) * (num(ev.Count) ?? 0);
      s.trade += total - paid;
      return true;
    }
    case "MaterialCollected":
      s.materials += num(ev.Count) ?? 1;
      return true;

    // ---------- mining ----------
    case "LaunchDrone":
      if (ev.Type === "Prospector") st.mining.prospectors += 1;
      else if (ev.Type === "Collection") st.mining.collectors += 1;
      else return false;
      st.mining.started ??= at;
      return true;
    case "ProspectedAsteroid": {
      const m = st.mining;
      m.started ??= at;
      m.prospected += 1;
      m.last.unshift({
        at,
        materials: (ev.Materials ?? [])
          .map((x: Json) => ({ name: symbolId(x.Name), label: String(x.Name_Localised ?? x.Name ?? ""), pct: num(x.Proportion) ?? 0 }))
          .sort((a: { pct: number }, b: { pct: number }) => b.pct - a.pct),
        content: ev.Content_Localised ?? ev.Content,
        motherlode: ev.MotherlodeMaterial_Localised ?? ev.MotherlodeMaterial,
        remaining: num(ev.Remaining),
      });
      m.last.length = Math.min(m.last.length, 20);
      return true;
    }
    case "AsteroidCracked":
      st.mining.cracked += 1;
      return true;
    case "MiningRefined": {
      const id = symbolId(ev.Type);
      const r = (st.mining.refined[id] ??= { label: String(ev.Type_Localised ?? id), count: 0 });
      r.count += 1;
      s.refined += 1;
      st.mining.started ??= at;
      return true;
    }

    // ---------- powerplay ----------
    case "Powerplay":
      Object.assign(st.powerplay, { power: ev.Power, rank: num(ev.Rank), merits: num(ev.Merits), timePledged: num(ev.TimePledged) });
      return true;
    case "PowerplayMerits":
      st.powerplay.power = ev.Power ?? st.powerplay.power;
      st.powerplay.merits = num(ev.TotalMerits) ?? st.powerplay.merits;
      st.powerplay.gains.push({ at, merits: num(ev.MeritsGained) ?? 0 });
      if (st.powerplay.gains.length > 5000) st.powerplay.gains.splice(0, st.powerplay.gains.length - 5000);
      return true;
    case "PowerplayRank":
      st.powerplay.rank = num(ev.Rank) ?? st.powerplay.rank;
      return true;
    case "PowerplayJoin":
    case "PowerplayDefect":
      st.powerplay = { power: ev.Power ?? ev.ToPower, rank: 1, merits: 0, gains: [] };
      return true;
    case "PowerplayLeave":
      st.powerplay = { gains: [] };
      return true;
  }
  return false;
}

/** Applies parsed events (archive or live). */
export function applyActivityEvents(st: ActivityState, events: Json[], ctx?: ActivityContext): boolean {
  let changed = false;
  for (const ev of events) if (applyActivity(st, ev, ctx)) changed = true;
  return changed;
}

// ---------- derived values ----------

/** Sold value estimate of a body's cartographic data (community formula, ±5 %). */
export function bodyValue(b: BodyInfo, opts: { mapped?: boolean } = {}): number {
  const firstDiscovery = b.wasDiscovered === false;
  if (b.star !== undefined && b.planetClass === undefined) {
    let k = 1200;
    const t = b.star ?? "";
    if (t === "N" || t === "H" || t === "SupermassiveBlackHole") k = 22628;
    else if (t.startsWith("D")) k = 14057;
    const value = k + ((b.stellarMass ?? 1) * k) / 66.25;
    return Math.round(value * (firstDiscovery ? 2.6 : 1));
  }
  const pc = b.planetClass ?? "";
  const terra = (b.terraform ?? "").length > 0 && !/not/i.test(b.terraform ?? "");
  let k = 300;
  if (pc === "Metal rich body") k = 21790;
  else if (pc === "Ammonia world") k = 96932;
  else if (pc === "Sudarsky class I gas giant") k = 1656;
  else if (pc === "Sudarsky class II gas giant" || pc === "High metal content body") k = 9654;
  else if (pc === "Water world") k = 64831;
  else if (pc === "Earthlike body") k = 64831 + 116295;
  if (terra) {
    if (pc === "Water world") k += 116295;
    else if (pc === "Metal rich body") k += 65631;
    else if (pc === "High metal content body") k += 100677;
    else if (pc !== "Earthlike body") k += 93328;
  }
  const q = 0.56591828;
  const mass = b.massEM ?? 1;
  let value = k + k * q * Math.pow(mass, 0.2);
  const mapped = opts.mapped ?? b.mapped;
  if (mapped) {
    let mult = 3.3333333333;
    if (firstDiscovery && b.wasMapped === false) mult = 3.699622554;
    else if (b.wasMapped === false) mult = 8.0956;
    if (b.efficient) mult *= 1.25;
    value *= mult;
    value += Math.max(value * 0.3, 555);
  }
  value = Math.max(500, value);
  if (firstDiscovery) value *= 2.6;
  return Math.round(value);
}

/** Great-circle distance between two surface points, metres. */
export function surfaceDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }, radius: number): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Massacre stacks: per target faction, kills still needed (the largest per-issuer remainder). */
export function massacreStacks(missions: Mission[]): { target: string; needed: number; done: number; issuers: { faction: string; kills: number; total: number; missions: number; reward: number }[] }[] {
  const byTarget = new Map<string, Mission[]>();
  for (const m of missions) if (m.killCount && m.targetFaction) byTarget.set(m.targetFaction, [...(byTarget.get(m.targetFaction) ?? []), m]);
  return [...byTarget.entries()].map(([target, list]) => {
    const issuers = new Map<string, { faction: string; kills: number; total: number; missions: number; reward: number }>();
    for (const m of list) {
      const i = issuers.get(m.faction) ?? { faction: m.faction, kills: 0, total: 0, missions: 0, reward: 0 };
      i.kills += Math.min(m.kills, m.killCount!);
      i.total += m.killCount!;
      i.missions += 1;
      i.reward += m.reward ?? 0;
      issuers.set(m.faction, i);
    }
    const all = [...issuers.values()].sort((a, b) => b.total - a.total);
    const needed = Math.max(0, ...all.map((i) => i.total));
    const done = Math.max(0, ...all.map((i) => i.kills));
    return { target, needed, done, issuers: all };
  });
}
