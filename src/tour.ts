// The engineer tour: one stop per engineer picked for the wishlist, visited nearest first, each
// leg plotted by Spansh with the ship's jump range so the jumps really follow one another.
// Live: arriving in a system of the route can copy the next jump; an EngineerCraft event ticks
// the matching wishlist line.

import { copyText, spanshJob } from "./bridge.js";
import type { Ctx } from "./context.js";
import { ownedOf } from "./context.js";
import { toast } from "./dom.js";
import { gameName, t } from "./i18n.js";
import { jumpModel } from "./jump.js";
import { log } from "./logger.js";
import { notify } from "./notifier.js";
import { distance } from "./spansh.js";
import { blueprintGrades, defaultRolls, wishNeeds, type Store, type WishItem } from "./store.js";
import { origin, pickEngineer, type Pick } from "./engineerPick.js";

type Json = Record<string, any>;
type Vec3 = [number, number, number];

export interface Stop {
  pick: Pick;
  lines: WishItem[];
  /** Straight-line distance from the previous stop (or from you). */
  leg?: number;
  /** Materials missing for what is done at this stop, after the earlier stops used theirs. */
  missing: Record<string, number>;
}

export interface TourPlan {
  stops: Stop[];
  /** Sum of the straight lines, you → stop 1 → stop 2… */
  total: number;
  /** Lines with no known engineer (red box in the wishlist). */
  orphans: WishItem[];
}

/** The stops, nearest first from where you are, with what each one is for. */
export function planTour(ctx: Ctx): TourPlan {
  const byEngineer = new Map<string, Stop>();
  const orphans: WishItem[] = [];
  for (const item of ctx.store.state.wishlist) {
    const r = pickEngineer(ctx, item);
    if (r.pick) {
      const s = byEngineer.get(r.pick.engineer.name) ?? { pick: r.pick, lines: [], missing: {} };
      s.lines.push(item);
      byEngineer.set(r.pick.engineer.name, s);
    } else if (r.toMeet) orphans.push(item);
  }
  // Nearest neighbour: from you, always to the closest stop not visited yet.
  const left = [...byEngineer.values()];
  const stops: Stop[] = [];
  let at = origin(ctx);
  let total = 0;
  while (left.length) {
    let best = 0;
    left.forEach((s, i) => {
      if ((distance(at, s.pick.engineer.pos) ?? Infinity) < (distance(at, left[best].pick.engineer.pos) ?? Infinity)) best = i;
    });
    const s = left.splice(best, 1)[0];
    s.leg = distance(at, s.pick.engineer.pos);
    total += s.leg ?? 0;
    at = (s.pick.engineer.pos as Vec3 | null) ?? at;
    stops.push(s);
  }
  // Materials, stop by stop: what an earlier stop uses is no longer there for the next one.
  const pool: Record<string, number> = {};
  for (const s of stops) {
    for (const line of s.lines) {
      for (const [id, n] of Object.entries(wishNeeds(ctx.game, line))) {
        if (!(id in pool)) pool[id] = ownedOf(ctx, id);
        const use = Math.min(pool[id], n);
        pool[id] -= use;
        if (n > use) s.missing[id] = (s.missing[id] ?? 0) + (n - use);
      }
    }
  }
  return { stops, total, orphans };
}

/** Jump range for the tour: the ship's laden range from the journal (0 when unknown). */
export function tourRange(ctx: Ctx): number {
  const m = jumpModel(ctx.store.state.cmdr.loadout);
  if (!m) return 0;
  const cargo = ctx.store.state.cmdr.cargoMass ?? 0;
  return Math.floor(m.rangeAt(m.unladen + m.fuel + m.reserve + cargo) * 100) / 100;
}

// ---------------- the plotted route ----------------

export interface RouteJump {
  system: string;
  /** Engineer reached at this system, if it is a stop. */
  engineer?: string;
  neutron?: boolean;
}

export interface TourRoute {
  jumps: RouteJump[];
  range: number;
  totalJumps: number;
  distance: number;
  plottedAt: string;
}

const KEY = "edch.tour";
let route: TourRoute | null = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TourRoute) : null;
  } catch {
    return null;
  }
})();

export const currentRoute = () => route;

function saveRoute(r: TourRoute | null) {
  route = r;
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    /* kept in memory only */
  }
}

export const clearRoute = () => saveRoute(null);

/** Plots every leg with Spansh, one after the other. */
export async function plotTour(from: string, stops: Stop[], range: number, onProgress: (leg: number, of: number) => void, supercharge: 4 | 6 = 4): Promise<TourRoute> {
  const jumps: RouteJump[] = [{ system: from }];
  let total = 0;
  let dist = 0;
  let start = from;
  for (let i = 0; i < stops.length; i++) {
    const e = stops[i].pick.engineer;
    onProgress(i + 1, stops.length);
    if (start.toLowerCase() === e.system.toLowerCase()) {
      jumps[jumps.length - 1].engineer = e.name;
      continue;
    }
    const res: Json = await spanshJob("route", [
      ["from", start],
      ["to", e.system],
      ["range", String(range)],
      ["efficiency", "60"],
      ["supercharge_multiplier", String(supercharge)],
    ]);
    const legs: Json[] = res.system_jumps ?? [];
    for (const j of legs.slice(1)) jumps.push({ system: String(j.system), neutron: Boolean(j.neutron_star) });
    // Spansh ends on the destination; make sure the stop is marked even if the name differs in case.
    const last = jumps[jumps.length - 1];
    if (last.system.toLowerCase() !== e.system.toLowerCase()) jumps.push({ system: e.system });
    jumps[jumps.length - 1].engineer = e.name;
    total += legs.reduce((s, j) => s + Number(j.jumps ?? 0), 0) || Math.max(0, legs.length - 1);
    dist += Number(res.distance ?? 0);
    start = e.system;
  }
  const r: TourRoute = { jumps, range, totalJumps: total, distance: dist, plottedAt: new Date().toISOString() };
  saveRoute(r);
  log.info("tour", `Engineer tour plotted: ${stops.length} stop(s), ${total} jump(s)`);
  return r;
}

/** The jump after `system` on the route, if `system` is on it. */
export function nextJump(system: string): { next?: RouteJump; index: number } {
  if (!route) return { index: -1 };
  const i = route.jumps.findIndex((j) => j.system.toLowerCase() === system.toLowerCase());
  return { next: i >= 0 ? route.jumps[i + 1] : undefined, index: i };
}

// ---------------- Navigation page route ----------------

const NAV_KEY = "edch.navRoute";
/** The systems of the last ship route plotted on the Navigation page, in order. */
let navRoute: string[] = (() => {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
})();

export function setNavRoute(systems: string[]) {
  navRoute = systems;
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify(systems));
  } catch {
    /* kept in memory only */
  }
}

/** Copies `system` (the next one of a route) and says so. */
function copyNext(system: string, label: string) {
  void copyText(system).then((ok) => {
    if (!ok) return;
    toast(label);
    if (store?.state.settings.navNotifyCopy) notify(label, { sound: true });
  });
}

// ---------------- live ----------------

let store: Store | null = null;
let gameCtx: Ctx | null = null;
export function bindTour(ctx: Ctx) {
  gameCtx = ctx;
  store = ctx.store;
}

/** A live journal event (never the start-up replay). */
export function tourEvent(ev: Json) {
  if (!store) return;
  const s = store.state.settings.engineers;
  if ((ev.event === "FSDJump" || ev.event === "CarrierJump") && typeof ev.StarSystem === "string") {
    const here = ev.StarSystem.toLowerCase();
    // Navigation page route first: arriving at the end of a step copies the next system.
    const i = store.state.settings.navAutoCopy ? navRoute.findIndex((x) => x.toLowerCase() === here) : -1;
    if (i >= 0) {
      const next = navRoute[i + 1];
      if (next) copyNext(next, t("common.nextJumpCopied", { next }));
      else toast(t("tour.routeDestinationReached"));
    } else if (s.autoCopyNext && route) {
      const { next, index } = nextJump(ev.StarSystem);
      if (index >= 0) {
        if (next) copyNext(next.system, next.engineer ? t("tour.nextJumpCopied", { system: next.system, engineer: next.engineer }) : t("common.nextJumpCopied", { next: next.system }));
        else toast(t("tour.lastStopEngineerTour"));
      }
    }
  }
  if (ev.event === "EngineerCraft" && s.autoTick) tick(ev);
}

/** The game made a modification: move the matching wishlist line on. */
function tick(ev: Json) {
  if (!store || !gameCtx) return;
  const game = gameCtx.game;
  const list = store.state.wishlist;
  const effect = typeof ev.ApplyExperimentalEffect === "string" ? ev.ApplyExperimentalEffect.toLowerCase() : "";
  const blueprint = typeof ev.BlueprintName === "string" ? ev.BlueprintName.toLowerCase() : "";
  const level = Number(ev.Level ?? 0);
  const symbolsOf = (item: WishItem) => [...blueprintGrades(game, item.bp).values()].flatMap((b) => b.symbols ?? []);
  const kindOf = (item: WishItem) => [...blueprintGrades(game, item.bp).values()][0]?.kind;
  let next: WishItem[] | null = null;
  let message = "";
  if (effect) {
    const item = list.find((w) => kindOf(w) === "experimental" && symbolsOf(w).includes(effect));
    if (!item) return;
    const name = gameName(item.bp.split("|")[2] ?? "");
    if (item.count > 1) {
      next = list.map((w) => (w.id === item.id ? { ...w, count: w.count - 1 } : w));
      message = t("tour.effectAppliedGo", { name, value: item.count - 1 });
    } else {
      next = list.filter((w) => w.id !== item.id);
      message = t("tour.effectAppliedRemovedFromWishlist", { name });
    }
  } else if (blueprint && level) {
    const item =
      list.find((w) => kindOf(w) === "modification" && symbolsOf(w).includes(blueprint) && level >= w.gradeFrom && level <= w.gradeTo) ??
      list.find((w) => kindOf(w) === "modification" && symbolsOf(w).includes(blueprint));
    if (!item) return;
    const name = gameName(item.bp.split("|")[2] ?? "");
    const left = Math.max(0, (item.rolls[level] ?? defaultRolls(level)) - 1);
    let updated: WishItem | null = { ...item, rolls: { ...item.rolls, [level]: left } };
    if (left === 0 && level >= item.gradeTo) {
      // One module done at the top grade.
      if (item.count > 1) updated = { ...item, count: item.count - 1, rolls: { ...item.rolls, [level]: defaultRolls(level) } };
      else updated = null;
      message = updated ? t("tour.gDoneGo", { name, level, value: item.count - 1 }) : t("tour.gDoneRemovedFromWishlist", { name, level });
    } else {
      if (item.count === 1) updated = { ...updated, gradeFrom: left === 0 ? Math.min(level + 1, item.gradeTo) : Math.max(item.gradeFrom, level) };
      message = t("tour.gRollCounted", { name, level });
    }
    next = updated ? list.map((w) => (w.id === item.id ? updated! : w)) : list.filter((w) => w.id !== item.id);
  }
  if (next) {
    store.setWishlist(next);
    log.info("tour", "Wishlist line moved on after EngineerCraft");
    if (message) toast(message);
  }
}
