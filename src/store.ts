import type { Game } from "./data.js";
import { emptyState, type CommanderState } from "./journal.js";
import type { Blueprint } from "./types.js";
import type { WatchStatus } from "./bridge.js";
import { DEFAULT_SYNC, type SyncSettings } from "./uploaders.js";

export interface Settings {
  journalDir: string;
  /** Minimum population for "high population" HGE searches. */
  hgeMinPopulation: number;
  /** Search radius around you, light years. */
  maxDistance: number;
  /** Ignore Spansh BGS data older than this many days for state-based searches. */
  maxAgeDays: number;
  /** Used when the game hasn't told us where we are yet. */
  fallbackSystem: string;
  largePadOnly: boolean;
  sync: SyncSettings;
  remote: RemoteSettings;
  /** Look for a new release on GitHub at start-up and every few hours. */
  autoUpdate: boolean;
  /** A version the user chose to skip ("Plus tard" hides it until the next one). */
  skippedVersion: string;
}

export interface RemoteSettings {
  enabled: boolean;
  port: number;
  /** Secret carried by the QR code; replacing it disconnects every paired device. */
  token: string;
  /** Address put in the QR code; "" = first detected LAN address. */
  host: string;
}

export const DEFAULT_REMOTE: RemoteSettings = { enabled: false, port: 47800, token: "", host: "" };

export function newRemoteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface WishItem {
  id: string;
  /** `${kind}|${module}|${name}` */
  bp: string;
  gradeFrom: number;
  gradeTo: number;
  /** Rolls per grade for modifications. */
  rolls: Record<number, number>;
  /** How many times (e.g. 4 thrusters, 2 synthesis runs). */
  count: number;
  note?: string;
}

export interface AppState {
  cmdr: CommanderState;
  watch: WatchStatus;
  settings: Settings;
  wishlist: WishItem[];
  view: string;
  selected?: string; // material id in the detail panel
}

const DEFAULT_SETTINGS: Settings = {
  journalDir: "",
  hgeMinPopulation: 1_000_000,
  maxDistance: 300,
  maxAgeDays: 3,
  fallbackSystem: "Sol",
  largePadOnly: false,
  sync: DEFAULT_SYNC,
  remote: DEFAULT_REMOTE,
  autoUpdate: true,
  skippedVersion: "",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

type Listener = (state: AppState) => void;

export class Store {
  state: AppState;
  private listeners = new Set<Listener>();
  private scheduled = false;

  constructor() {
    this.state = {
      // Last known state is shown instantly at startup, then the journal replay overwrites it.
      cmdr: { ...emptyState(), ...load<CommanderState>("edc.cmdr", emptyState()) },
      watch: { state: "idle" },
      settings: (() => {
        const loaded = load<Settings>("edc.settings", DEFAULT_SETTINGS);
        return { ...loaded, sync: { ...DEFAULT_SYNC, ...(loaded.sync ?? {}) }, remote: { ...DEFAULT_REMOTE, ...(loaded.remote ?? {}) } };
      })(),
      wishlist: loadArray<WishItem>("edc.wishlist"),
      view: (() => {
        try {
          return localStorage.getItem("edc.view") ?? "materials";
        } catch {
          return "materials";
        }
      })(),
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Coalesces bursts (journal replay) into one render per frame. */
  notify() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      for (const fn of this.listeners) fn(this.state);
    });
  }

  persistCmdr() {
    save("edc.cmdr", this.state.cmdr);
  }

  setView(view: string) {
    this.state.view = view;
    save("edc.view", view);
    this.notify();
  }

  select(id?: string) {
    this.state.selected = id;
    this.notify();
  }

  updateSettings(patch: Partial<Settings>) {
    this.state.settings = { ...this.state.settings, ...patch };
    save("edc.settings", this.state.settings);
    this.notify();
  }

  /** Called after a local wishlist change (the phone forwards it to the PC). */
  onWishlistChange?: (items: WishItem[]) => void;

  setWishlist(items: WishItem[], fromRemote = false) {
    this.state.wishlist = items;
    save("edc.wishlist", items);
    this.notify();
    if (!fromRemote) this.onWishlistChange?.(items);
  }
}

export const bpKey = (bp: Blueprint) => `${bp.kind}|${bp.module}|${bp.name}`;

/** Grades of one blueprint, keyed by grade (0 for blueprints without grades). */
export function blueprintGrades(game: Game, key: string): Map<number, Blueprint> {
  const map = new Map<number, Blueprint>();
  for (const bp of game.data.blueprints) if (bpKey(bp) === key) map.set(bp.grade ?? 0, bp);
  return map;
}

/** Default rolls for a modification grade: one per grade level is a fair average with a max-rank engineer. */
export const defaultRolls = (grade: number) => Math.max(1, grade);

/** Materials needed by one wishlist line. */
export function wishNeeds(game: Game, item: WishItem): Record<string, number> {
  const grades = blueprintGrades(game, item.bp);
  const needs: Record<string, number> = {};
  const addAll = (bp: Blueprint, times: number) => {
    for (const [id, n] of Object.entries(bp.ingredients)) needs[id] = (needs[id] ?? 0) + n * times;
  };
  if (grades.has(0) || grades.size === 1) {
    const bp = grades.get(0) ?? [...grades.values()][0];
    if (bp) addAll(bp, item.count);
    return needs;
  }
  for (let g = item.gradeFrom; g <= item.gradeTo; g++) {
    const bp = grades.get(g);
    if (!bp) continue;
    const rolls = bp.kind === "modification" ? item.rolls[g] ?? defaultRolls(g) : 1;
    addAll(bp, rolls * item.count);
  }
  return needs;
}

export function totalNeeds(game: Game, items: WishItem[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const item of items) {
    for (const [id, n] of Object.entries(wishNeeds(game, item))) total[id] = (total[id] ?? 0) + n;
  }
  return total;
}
