// What EDSM knows about a system (public data, no key needed): bodies already reported by
// other commanders, who discovered them, and the system's estimated cartographic value; and for
// the BGS page, a system's minor factions with their influence history.

import { httpFetch } from "../platform/bridge.js";
import { t } from "../platform/i18n.js";
import { log } from "../platform/logger.js";
import type { FactionPresence, InfluenceSample } from "../game/activity/bgs.js";

export interface EdsmBody {
  name: string;
  type: string;
  subType: string;
  distance?: number;
  discoveredBy?: string;
  discoveredAt?: string;
  terraformable?: boolean;
}

export interface EdsmSystem {
  system: string;
  /** Bodies in the system, when EDSM knows the total (from a full system scan). */
  bodyCount?: number;
  bodies: EdsmBody[];
  value?: number;
  valueMapped?: number;
  valuable: { name: string; distance?: number; value: number }[];
  /** EDSM has never heard of this system. */
  unknown: boolean;
  fetched: number;
}

const cache = new Map<string, EdsmSystem>();
const pending = new Map<string, Promise<EdsmSystem>>();
const TTL = 10 * 60 * 1000;

export const edsmSystemUrl = (system: string) =>
  `https://www.edsm.net/en/system?systemName=${encodeURIComponent(system)}`;

/** Cached copy (or undefined: not asked yet). */
export const edsmCached = (system: string) => cache.get(system.toLowerCase());

async function get(path: string): Promise<any> {
  const reply = await httpFetch("GET", `https://www.edsm.net/${path}`);
  if (reply.status < 200 || reply.status >= 300) throw new Error(t("edsm.replied", { status: reply.status }));
  const text = reply.body.trim();
  // EDSM answers [] or {} for a system it doesn't know.
  return text ? JSON.parse(text) : {};
}

/** Fetches (or reuses for 10 minutes) what EDSM knows about a system. */
export function edsmSystem(system: string): Promise<EdsmSystem> {
  const key = system.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetched < TTL) return Promise.resolve(hit);
  const running = pending.get(key);
  if (running) return running;
  const q = encodeURIComponent(system);
  const job = (async () => {
    const [bodies, value] = await Promise.all([
      get(`api-system-v1/bodies?systemName=${q}`),
      get(`api-system-v1/estimated-value?systemName=${q}`),
    ]);
    const list: any[] = Array.isArray(bodies?.bodies) ? bodies.bodies : [];
    const out: EdsmSystem = {
      system,
      bodyCount: typeof bodies?.bodyCount === "number" ? bodies.bodyCount : undefined,
      bodies: list.map((b) => ({
        name: String(b.name ?? ""),
        type: String(b.type ?? ""),
        subType: String(b.subType ?? ""),
        distance: typeof b.distanceToArrival === "number" ? b.distanceToArrival : undefined,
        discoveredBy: b.discovery?.commander ? String(b.discovery.commander) : undefined,
        discoveredAt: b.discovery?.date ? String(b.discovery.date) : undefined,
        terraformable:
          /terraform/i.test(String(b.terraformingState ?? "")) && !/not/i.test(String(b.terraformingState ?? "")),
      })),
      value: typeof value?.estimatedValue === "number" ? value.estimatedValue : undefined,
      valueMapped: typeof value?.estimatedValueMapped === "number" ? value.estimatedValueMapped : undefined,
      valuable: (Array.isArray(value?.valuableBodies) ? value.valuableBodies : []).map((v: any) => ({
        name: String(v.bodyName ?? ""),
        distance: typeof v.distance === "number" ? v.distance : undefined,
        value: Number(v.valueMax ?? 0),
      })),
      unknown: !bodies?.id && !list.length,
      fetched: Date.now(),
    };
    cache.set(key, out);
    log.debug(
      "edsm",
      `${system}: ${out.unknown ? "unknown" : `${out.bodies.length}/${out.bodyCount ?? "?"} bodies, value ${out.value ?? "?"}`}`,
    );
    return out;
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

/** A system's minor factions as EDSM knows them, with each faction's influence history. */
export interface EdsmFactions {
  system: string;
  /** The newest update among the factions (UTC), when EDSM has one. */
  updatedAt?: string;
  controlling?: string;
  factions: FactionPresence[];
  /** Influence samples (percent), oldest first. */
  history: InfluenceSample[];
}

const stateList = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((entry) => String(entry?.state ?? "")).filter(Boolean) : [];
/** EDSM gives influence as 0–1. */
const edsmPercent = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? Math.round(value * 1000) / 10 : NaN;
const unixToIso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** EDSM's api-system-v1/factions answer (with showHistory=1), decoded; null for an unknown system. */
export function decodeEdsmFactions(system: string, raw: any, since = 0): EdsmFactions | null {
  const list: any[] = Array.isArray(raw?.factions) ? raw.factions : [];
  if (!list.length) return null;
  let newest = 0;
  const samples = new Map<number, Record<string, number>>();
  const factions: FactionPresence[] = [];
  for (const f of list) {
    const name = typeof f?.name === "string" ? f.name : "";
    if (!name) continue;
    if (typeof f.lastUpdate === "number" && f.lastUpdate > newest) newest = f.lastUpdate;
    factions.push({
      name,
      influence: edsmPercent(f.influence),
      state: typeof f.state === "string" && f.state ? f.state : "None",
      active: stateList(f.activeStates),
      pending: stateList(f.pendingStates),
      recovering: stateList(f.recoveringStates),
    });
    const history = f.influenceHistory && typeof f.influenceHistory === "object" ? f.influenceHistory : {};
    for (const [time, value] of Object.entries(history)) {
      const seconds = Number(time);
      const influence = edsmPercent(value);
      if (!Number.isFinite(seconds) || seconds * 1000 < since || !Number.isFinite(influence)) continue;
      const sample = samples.get(seconds) ?? {};
      sample[name] = influence;
      samples.set(seconds, sample);
    }
  }
  const controller = raw?.controllingFaction;
  return {
    system,
    updatedAt: newest ? unixToIso(newest) : undefined,
    controlling: typeof controller?.name === "string" ? controller.name : undefined,
    factions,
    history: [...samples]
      .sort((a, b) => a[0] - b[0])
      .map(([seconds, influences]) => ({ at: unixToIso(seconds), influences })),
  };
}

/** What EDSM knows of a system's factions (no cache: the BGS page keeps what it needs). */
export async function edsmFactions(system: string, since = 0): Promise<EdsmFactions | null> {
  const raw = await get(`api-system-v1/factions?systemName=${encodeURIComponent(system)}&showHistory=1`);
  return decodeEdsmFactions(system, raw, since);
}
