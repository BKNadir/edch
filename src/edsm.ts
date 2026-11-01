// What EDSM knows about a system (public data, no key needed): bodies already reported by
// other commanders, who discovered them, and the system's estimated cartographic value.

import { httpFetch } from "./bridge.js";
import { log } from "./logger.js";

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

export const edsmSystemUrl = (system: string) => `https://www.edsm.net/en/system?systemName=${encodeURIComponent(system)}`;

/** Cached copy (or undefined: not asked yet). */
export const edsmCached = (system: string) => cache.get(system.toLowerCase());

async function get(path: string): Promise<any> {
  const reply = await httpFetch("GET", `https://www.edsm.net/${path}`);
  if (reply.status < 200 || reply.status >= 300) throw new Error(`EDSM a répondu ${reply.status}`);
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
    const [bodies, value] = await Promise.all([get(`api-system-v1/bodies?systemName=${q}`), get(`api-system-v1/estimated-value?systemName=${q}`)]);
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
        terraformable: /terraform/i.test(String(b.terraformingState ?? "")) && !/not/i.test(String(b.terraformingState ?? "")),
      })),
      value: typeof value?.estimatedValue === "number" ? value.estimatedValue : undefined,
      valueMapped: typeof value?.estimatedValueMapped === "number" ? value.estimatedValueMapped : undefined,
      valuable: (Array.isArray(value?.valuableBodies) ? value.valuableBodies : []).map((v: any) => ({ name: String(v.bodyName ?? ""), distance: typeof v.distance === "number" ? v.distance : undefined, value: Number(v.valueMax ?? 0) })),
      unknown: !bodies?.id && !list.length,
      fetched: Date.now(),
    };
    cache.set(key, out);
    log.debug("edsm", `${system}: ${out.unknown ? "unknown" : `${out.bodies.length}/${out.bodyCount ?? "?"} bodies, value ${out.value ?? "?"}`}`);
    return out;
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
