// What the squadron's members saw in the game, received from the squadron's Discord bot (GET
// /v1/systems): each system's newest factions, influence and conflicts, with the influence
// samples gathered over the last days (for the trend). The BGS page shows it as private data
// (yours and your squadron's, not public), marked as coming from Discord. Only filled when the
// member linked the bot (Sync page). Saved in localStorage under one key, bounded, checked when
// read back.

import type { FactionConflict, FactionPresence, InfluenceSample } from "../game/activity/bgs.js";
import { HISTORY_KEEP_DAYS, sampleOf, validFaction, validSample } from "./bgsHistory.js";

const STORAGE_KEY = "edch.bgs.shared";
const MAX_SYSTEMS = 400;
const MAX_SAMPLES = 60;
const MAX_FACTIONS = 40;
const MAX_CONFLICTS = 10;
const DAY = 86_400_000;

/** A system as a member of the squadron last saw it. */
export interface SharedSystem {
  system: string;
  /** When it was seen. */
  at: string;
  controlling?: string;
  factions: FactionPresence[];
  conflicts: FactionConflict[];
  /** Influence samples of the snapshots received, oldest first, last HISTORY_KEEP_DAYS days. */
  history: InfluenceSample[];
}

/** By system name in lower case. */
export type BgsShared = Record<string, SharedSystem>;

const isDate = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const text = (value: unknown, max = 120) => (typeof value === "string" ? value.slice(0, max) : "");

function validConflict(raw: any): FactionConflict | null {
  if (!raw || !Array.isArray(raw.sides)) return null;
  return {
    type: text(raw.type, 40),
    status: text(raw.status, 40),
    sides: raw.sides.slice(0, 2).map((side: any) => ({
      name: text(side?.name),
      stake: text(side?.stake),
      wonDays: Number.isInteger(side?.wonDays) ? Math.max(0, Math.min(10, side.wonDays)) : 0,
    })),
  };
}

/** A system snapshot (from the bot, or as saved), checked; null when unusable. */
export function validSharedSystem(raw: any): SharedSystem | null {
  const system = text(raw?.system);
  if (!system || !isDate(raw.at) || !Array.isArray(raw.factions)) return null;
  const factions = raw.factions
    .slice(0, MAX_FACTIONS)
    .map(validFaction)
    .filter((f: FactionPresence | null): f is FactionPresence => f !== null);
  if (!factions.length) return null;
  const conflicts = (Array.isArray(raw.conflicts) ? raw.conflicts : [])
    .slice(0, MAX_CONFLICTS)
    .map(validConflict)
    .filter((c: FactionConflict | null): c is FactionConflict => c !== null);
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .slice(-MAX_SAMPLES)
    .map(validSample)
    .filter((s: InfluenceSample | null): s is InfluenceSample => s !== null);
  return {
    system,
    at: new Date(Date.parse(raw.at)).toISOString(),
    controlling: text(raw.controlling) || undefined,
    factions,
    conflicts,
    history,
  };
}

function load(): BgsShared {
  const shared: BgsShared = {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw))
      for (const value of Object.values(raw).slice(0, MAX_SYSTEMS)) {
        const system = validSharedSystem(value);
        if (system) shared[system.system.toLowerCase()] = system;
      }
  } catch {
    // Nothing saved, or unreadable: the next answer of the bot fills it again.
  }
  return shared;
}

let shared: BgsShared = load();

/** What the squadron saw, by system name in lower case. */
export const bgsShared = (): BgsShared => shared;

/**
 * Records what the bot gave: each system's snapshot when newer than the one kept, its influences
 * as a sample, then drops what is too old or too many, and saves.
 */
export function recordShared(snapshots: SharedSystem[], now = Date.now()) {
  const oldest = new Date(now - HISTORY_KEEP_DAYS * DAY).toISOString();
  for (const snapshot of snapshots) {
    const key = snapshot.system.toLowerCase();
    const known = shared[key];
    const samples = new Map((known?.history ?? []).map((sample) => [sample.at, sample]));
    const sample = sampleOf(snapshot.at, snapshot.factions);
    if (sample) samples.set(sample.at, sample);
    const newest = !known || snapshot.at >= known.at ? snapshot : known;
    shared[key] = {
      ...newest,
      history: [...samples.values()]
        .filter((s) => s.at >= oldest)
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-MAX_SAMPLES),
    };
  }
  for (const [key, system] of Object.entries(shared)) if (system.at < oldest) delete shared[key];
  const keys = Object.keys(shared);
  if (keys.length > MAX_SYSTEMS)
    for (const key of keys.sort((a, b) => shared[a].at.localeCompare(shared[b].at)).slice(0, keys.length - MAX_SYSTEMS))
      delete shared[key];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
  } catch {
    // Storage full or unavailable: kept for this session.
  }
}

/** Forgets what the squadron shared (the member unlinked the bot). */
export function clearShared() {
  shared = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to remove.
  }
}
