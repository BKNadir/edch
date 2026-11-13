// What Spansh and EDSM told about the systems of the BGS page, kept between sessions: each
// system's newest factions and the influence samples of the last days (for the trend). The
// journal's own visits are not stored here: they are rebuilt from the journal at start-up.
// Saved in localStorage under one key, bounded (systems and days), checked when read back.

import type { FactionPresence, InfluenceSample } from "../game/activity/bgs.js";
import type { Vec3 } from "../game/journal/state.js";

const STORAGE_KEY = "edch.bgs.history";
/** Influence samples older than this are dropped. */
export const HISTORY_KEEP_DAYS = 7;
const MAX_SYSTEMS = 400;
const MAX_SAMPLES = 60;
const MAX_FACTIONS = 30;
const DAY = 86_400_000;

/** Where the newest data of a system came from. */
export type RemoteSource = "spansh" | "edsm";

/** A system as Spansh or EDSM last showed it. */
export interface RemoteSnapshot {
  /** When the data was observed (by whoever reported it to Spansh or EDSM). */
  at: string;
  source: RemoteSource;
  controlling?: string;
  factions: FactionPresence[];
}

export interface KnownSystem {
  system: string;
  coords?: Vec3;
  /** The newest of what Spansh and EDSM gave. */
  latest?: RemoteSnapshot;
  /** Influence samples from Spansh and EDSM, oldest first, last HISTORY_KEEP_DAYS days. */
  history: InfluenceSample[];
  /** When EDCH last asked EDSM about this system (to not ask again too soon). */
  edsmCheckedAt?: string;
}

/** By system name in lower case. */
export type BgsHistory = Record<string, KnownSystem>;

const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const text = (value: unknown, max = 120) => (typeof value === "string" ? value.slice(0, max) : "");
const names = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((s) => text(s, 60))
        .filter(Boolean)
        .slice(0, 10)
    : [];
const percentOrNaN = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : NaN;

function validFaction(raw: any): FactionPresence | null {
  const name = text(raw?.name);
  if (!name) return null;
  return {
    name,
    influence: percentOrNaN(raw.influence),
    state: text(raw.state, 60) || "None",
    active: names(raw.active),
    pending: names(raw.pending),
    recovering: names(raw.recovering),
  };
}

function validSample(raw: any): InfluenceSample | null {
  if (!isDate(raw?.at) || !raw.influences || typeof raw.influences !== "object") return null;
  const influences: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw.influences).slice(0, MAX_FACTIONS)) {
    const influence = percentOrNaN(value);
    if (name && Number.isFinite(influence)) influences[name.slice(0, 120)] = influence;
  }
  return Object.keys(influences).length ? { at: raw.at, influences } : null;
}

function validSystem(raw: any): KnownSystem | null {
  const system = text(raw?.system);
  if (!system) return null;
  const coords =
    Array.isArray(raw.coords) && raw.coords.length === 3 && raw.coords.every(Number.isFinite)
      ? (raw.coords as Vec3)
      : undefined;
  const latest =
    raw.latest && isDate(raw.latest.at) && (raw.latest.source === "spansh" || raw.latest.source === "edsm")
      ? {
          at: raw.latest.at,
          source: raw.latest.source as RemoteSource,
          controlling: text(raw.latest.controlling) || undefined,
          factions: (Array.isArray(raw.latest.factions) ? raw.latest.factions : [])
            .slice(0, MAX_FACTIONS)
            .map(validFaction)
            .filter((f: FactionPresence | null): f is FactionPresence => f !== null),
        }
      : undefined;
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .slice(-MAX_SAMPLES)
    .map(validSample)
    .filter((s: InfluenceSample | null): s is InfluenceSample => s !== null);
  return { system, coords, latest, history, edsmCheckedAt: isDate(raw.edsmCheckedAt) ? raw.edsmCheckedAt : undefined };
}

/** The saved history, checked entry by entry (anything malformed is dropped). */
export function validBgsHistory(raw: unknown): BgsHistory {
  const history: BgsHistory = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return history;
  for (const value of Object.values(raw).slice(0, MAX_SYSTEMS)) {
    const system = validSystem(value);
    if (system) history[system.system.toLowerCase()] = system;
  }
  return history;
}

export function loadBgsHistory(): BgsHistory {
  try {
    return validBgsHistory(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveBgsHistory(history: BgsHistory) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage full or unavailable: the page still works for this session.
  }
}

/**
 * Records what Spansh or EDSM gave for a system: the snapshot when it is newer than the one kept,
 * the samples (merged by date), then drops what is too old or too many.
 */
export function recordSystem(
  history: BgsHistory,
  system: string,
  update: { coords?: Vec3; snapshot?: RemoteSnapshot; samples?: InfluenceSample[]; edsmCheckedAt?: string },
  now = Date.now(),
) {
  const key = system.toLowerCase();
  const known = history[key] ?? { system, history: [] };
  if (update.coords) known.coords = update.coords;
  if (update.snapshot && (!known.latest || update.snapshot.at >= known.latest.at)) known.latest = update.snapshot;
  if (update.edsmCheckedAt) known.edsmCheckedAt = update.edsmCheckedAt;
  const byDate = new Map(known.history.map((sample) => [sample.at, sample]));
  for (const sample of update.samples ?? []) byDate.set(sample.at, { ...byDate.get(sample.at), ...sample });
  const oldest = new Date(now - HISTORY_KEEP_DAYS * DAY).toISOString();
  known.history = [...byDate.values()]
    .filter((sample) => sample.at >= oldest)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_SAMPLES);
  history[key] = known;
  const keys = Object.keys(history);
  if (keys.length > MAX_SYSTEMS) {
    const age = (k: string) => history[k].latest?.at ?? history[k].history.at(-1)?.at ?? "";
    for (const k of keys.sort((a, b) => age(a).localeCompare(age(b))).slice(0, keys.length - MAX_SYSTEMS))
      delete history[k];
  }
}

/** A snapshot's influences as a sample (the factions whose influence is known). */
export function sampleOf(at: string, factions: FactionPresence[]): InfluenceSample | null {
  const influences = Object.fromEntries(
    factions.filter((f) => Number.isFinite(f.influence)).map((f) => [f.name, f.influence]),
  );
  return Object.keys(influences).length ? { at, influences } : null;
}
