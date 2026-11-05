// Exploration: scanned and mapped bodies, unsold cartographic data per system, and its estimated
// value. Bodies are also used by the exobiology pages (gravity, atmosphere…).

import { num, type ActivityState, type BodyInfo, type EventHandler, type EventHandlers, type Json } from "./state.js";

/** Earth's gravity (m/s²) and atmospheric pressure (Pa): the journal gives SI units. */
const G = 9.80665;
const ATM = 101325;

/** A body's key: system address and body id, or its name when the journal has no ids. */
function bodyKey(ev: Json): string {
  if (ev.SystemAddress != null && ev.BodyID != null) return `${ev.SystemAddress}:${ev.BodyID}`;
  return `name:${String(ev.BodyName ?? ev.Body ?? "").toLowerCase()}`;
}

/** The body an event is about, created on first sight. */
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

/** Adds a body to its system's unsold data. */
function markUnsold(st: ActivityState, b: BodyInfo) {
  if (!b.system) return;
  const list = (st.unsoldSystems[b.system] ??= []);
  if (!list.includes(b.key)) list.push(b.key);
}

/** Data sold for these systems: forget their bodies (except the current system's). */
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
export function pruneBodies(st: ActivityState) {
  const keep = new Set(Object.values(st.unsoldSystems).flat());
  for (const [k, b] of Object.entries(st.bodies)) {
    if (keep.has(k) || b.address === st.system?.address) continue;
    if (st.organics.some((o) => o.address === b.address && o.bodyId === b.bodyId)) continue;
    delete st.bodies[k];
  }
}

/** FSSBodySignals, SAASignalsFound. */
const onFSSBodySignals: EventHandler = (st, ev) => {
    const b = getBody(st, ev);
    for (const sig of ev.Signals ?? []) {
      const signalType = String(sig.Type ?? "");
      if (/Biological/i.test(signalType)) b.bio = num(sig.Count) ?? b.bio;
      if (/Geological/i.test(signalType)) b.geo = num(sig.Count) ?? b.geo;
    }
    if (Array.isArray(ev.Genuses) && ev.Genuses.length) b.genera = ev.Genuses.map((g: Json) => String(g.Genus ?? "").toLowerCase());
    return true;
};

/** Journal events of this domain. */
export const EXPLORATION_EVENTS: EventHandlers = {
  Scan: (st, ev, at) => {
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
  },
  SAAScanComplete: (st, ev) => {
    const b = getBody(st, ev);
    b.mapped = true;
    b.efficient = num(ev.ProbesUsed) !== undefined && num(ev.EfficiencyTarget) !== undefined && ev.ProbesUsed <= ev.EfficiencyTarget;
    markUnsold(st, b);
    return true;
  },
  FSSBodySignals: onFSSBodySignals,
  SAASignalsFound: onFSSBodySignals,
  SellExplorationData: (st, ev) => {
    const session = st.session;
    session.exploration += num(ev.TotalEarnings) ?? (num(ev.BaseValue) ?? 0) + (num(ev.Bonus) ?? 0);
    forgetSystems(st, (ev.Systems ?? []).map(String));
    return true;
  },
  MultiSellExplorationData: (st, ev) => {
    const session = st.session;
    session.exploration += num(ev.TotalEarnings) ?? (num(ev.BaseValue) ?? 0) + (num(ev.Bonus) ?? 0);
    forgetSystems(st, (ev.Discovered ?? []).map((d: Json) => String(d.SystemName ?? "")));
    return true;
  },
};

/** Sold value estimate of a body's cartographic data (community formula, ±5 %). */
export function bodyValue(b: BodyInfo, opts: { mapped?: boolean } = {}): number {
  const firstDiscovery = b.wasDiscovered === false;
  if (b.star !== undefined && b.planetClass === undefined) {
    let k = 1200;
    const starType = b.star ?? "";
    if (starType === "N" || starType === "H" || starType === "SupermassiveBlackHole") k = 22628;
    else if (starType.startsWith("D")) k = 14057;
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

/** Unsold cartography, per system (computed on the PC, sent as-is to a phone). */
export function unsoldSummary(bodies: Record<string, BodyInfo>, systems: Record<string, string[]>) {
  return Object.entries(systems)
    .map(([system, keys]) => {
      const list = keys.map((k) => bodies[k]).filter(Boolean) as BodyInfo[];
      return {
        system,
        bodies: list.length,
        value: list.reduce((s, b) => s + bodyValue(b), 0),
        first: list.filter((b) => b.wasDiscovered === false).length,
        mapped: list.filter((b) => b.mapped).length,
        at: list.reduce((m, b) => (b.scannedAt > m ? b.scannedAt : m), ""),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}
