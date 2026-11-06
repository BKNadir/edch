// The engineer tour: one stop per engineer picked for the wishlist, nearest first from you, then
// nearest from the previous stop. No route is plotted: you plot each leg in the game.
// Live, stop by stop: the current stop's system is copied; arriving there is noted; once every
// line of that stop is done (EngineerCraft ticks them, or the ship already has them), the next
// engineer's system is copied. Lines already on the current ship are left out of the tour.

import { copyText } from "../../platform/bridge.js";
import type { Ctx } from "../../state/context.js";
import { ownedOf } from "../../state/context.js";
import { toast } from "../../ui/dom.js";
import { gameName, t } from "../../platform/i18n.js";
import { log } from "../../platform/logger.js";
import { notify } from "../../ui/notifier.js";
import { distance } from "../../services/spansh.js";
import { blueprintGrades, defaultRolls, wishNeeds, type Store, type WishItem } from "../../state/store.js";
import { doneOnShip } from "./doneOnShip.js";
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
  /** Lines the current ship already has: no visit needed. */
  doneOnShip: WishItem[];
}

/**
 * The stops with what each one is for: the current stop of a started tour first, then nearest
 * first from there (or from you), the stops you passed last.
 */
export function planTour(ctx: Ctx): TourPlan {
  const byEngineer = new Map<string, Stop>();
  const orphans: WishItem[] = [];
  const shipDone: WishItem[] = [];
  for (const item of ctx.store.state.wishlist) {
    if (doneOnShip(ctx, item)) {
      shipDone.push(item);
      continue;
    }
    const r = pickEngineer(ctx, item);
    if (r.pick) {
      const s = byEngineer.get(r.pick.engineer.name) ?? { pick: r.pick, lines: [], missing: {} };
      s.lines.push(item);
      byEngineer.set(r.pick.engineer.name, s);
    } else if (r.toMeet) orphans.push(item);
  }
  const all = [...byEngineer.values()];
  const stops: Stop[] = [];
  let at = origin(ctx);
  let total = 0;
  const visit = (s: Stop) => {
    s.leg = distance(at, s.pick.engineer.pos);
    total += s.leg ?? 0;
    at = (s.pick.engineer.pos as Vec3 | null) ?? at;
    stops.push(s);
  };
  const current = all.find((s) => s.pick.engineer.name === tour?.engineer);
  if (current) visit(current);
  // Nearest neighbour: always to the closest stop not visited yet; stops you passed come last.
  const passed = new Set(tour?.passed ?? []);
  for (const group of [
    all.filter((s) => s !== current && !passed.has(s.pick.engineer.name)),
    all.filter((s) => s !== current && passed.has(s.pick.engineer.name)),
  ]) {
    while (group.length) {
      let best = 0;
      group.forEach((s, i) => {
        if ((distance(at, s.pick.engineer.pos) ?? Infinity) < (distance(at, group[best].pick.engineer.pos) ?? Infinity))
          best = i;
      });
      visit(group.splice(best, 1)[0]);
    }
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
  return { stops, total, orphans, doneOnShip: shipDone };
}

// ---------------- the tour in progress ----------------

/** A started tour: the engineer you are heading to, and the stops you chose to pass. */
export interface TourProgress {
  engineer: string;
  system: string;
  /** You are in the engineer's system. */
  arrived: boolean;
  /** Engineers passed with "Next engineer": visited after the others. */
  passed: string[];
}

const KEY = "edch.tour";
let tour: TourProgress | null = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw ? JSON.parse(raw) : null;
    // Up to v0.10.6 this key held a plotted route (no "engineer"): forget it.
    return value && typeof value.engineer === "string" ? (value as TourProgress) : null;
  } catch {
    return null;
  }
})();

export const tourProgress = () => tour;

function saveTour(value: TourProgress | null) {
  tour = value;
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    /* kept in memory only */
  }
}

const hereIs = (ctx: Ctx, system: string) =>
  (ctx.store.state.cmdr.location?.system ?? "").toLowerCase() === system.toLowerCase();

/** Makes `stop` the current one and copies its system. */
export function goToStop(ctx: Ctx, stop: Stop) {
  const e = stop.pick.engineer;
  const passed = (tour?.passed ?? []).filter((name) => name !== e.name);
  saveTour({ engineer: e.name, system: e.system, arrived: hereIs(ctx, e.system), passed });
  log.info("tour", "Engineer tour: next stop set");
  copyNext(e.system, t("tour.engineerSystemCopied", { system: e.system, engineer: e.name }));
  ctx.store.notify();
}

/** "Next engineer": the current stop goes to the end of the tour, the next one is copied. */
export function passStop(ctx: Ctx) {
  if (!tour) return;
  saveTour({ ...tour, passed: [...tour.passed.filter((name) => name !== tour!.engineer), tour.engineer] });
  const name = tour.engineer;
  const next = planTour(ctx).stops.find((s) => s.pick.engineer.name !== name);
  if (next) goToStop(ctx, next);
  else ctx.store.notify();
}

export function stopTour(ctx: Ctx) {
  saveTour(null);
  ctx.store.notify();
}

/** The current stop has nothing left to do: move on to the next engineer, or end the tour. */
function advanceIfDone(ctx: Ctx) {
  if (!tour) return;
  const plan = planTour(ctx);
  if (plan.stops.some((s) => s.pick.engineer.name === tour!.engineer)) return;
  const done = tour.engineer;
  const next = plan.stops[0];
  if (next) {
    toast(t("tour.stopDone", { engineer: done }));
    goToStop(ctx, next);
  } else {
    saveTour(null);
    const message = t("tour.tourFinished");
    toast(message);
    if (ctx.store.state.settings.navNotifyCopy) notify(message, { sound: true });
    ctx.store.notify();
  }
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

/**
 * The next system to enter of the route plotted in this session (null: no route in progress).
 * Not kept across restarts: an old route isn't "in progress".
 */
let navTarget: string | null = null;

export function setNavRoute(systems: string[]) {
  navRoute = systems;
  navTarget = systems[1] ?? null;
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify(systems));
  } catch {
    /* kept in memory only */
  }
}

/**
 * The system to copy when you go back to the game: the next system of the route in progress,
 * else the engineer of the tour you are heading to. Null when there is nothing to enter.
 */
export function nextSystemToEnter(): { system: string; label: string } | null {
  if (navTarget) return { system: navTarget, label: t("common.nextJumpCopied", { next: navTarget }) };
  if (tour && !tour.arrived)
    return {
      system: tour.system,
      label: t("tour.engineerSystemCopied", { system: tour.system, engineer: tour.engineer }),
    };
  return null;
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
  if (!store || !gameCtx) return;
  if ((ev.event === "FSDJump" || ev.event === "CarrierJump") && typeof ev.StarSystem === "string") {
    const here = ev.StarSystem.toLowerCase();
    // Navigation page route: arriving at the end of a step copies the next system.
    const i = store.state.settings.navAutoCopy ? navRoute.findIndex((x) => x.toLowerCase() === here) : -1;
    const at = navRoute.findIndex((x) => x.toLowerCase() === here);
    if (at >= 0) navTarget = navRoute[at + 1] ?? null;
    if (i >= 0) {
      const next = navRoute[i + 1];
      if (next) copyNext(next, t("common.nextJumpCopied", { next }));
      else toast(t("tour.routeDestinationReached"));
    }
    if (tour && !tour.arrived && tour.system.toLowerCase() === here) {
      saveTour({ ...tour, arrived: true });
      toast(t("tour.arrivedAtEngineer", { engineer: tour.engineer }));
      store.notify();
    }
  }
  if (ev.event === "EngineerCraft" && store.state.settings.engineers.autoTick) tick(ev);
  // A modification made, or the ship changed: the current stop may have nothing left to do.
  if (ev.event === "EngineerCraft" || ev.event === "Loadout") advanceIfDone(gameCtx);
}

/** The game made a modification: move the matching wishlist line on. */
/** Modules already counted done at their line's top grade ("<line id>|<slot>"), this session. */
const doneSlots = new Set<string>();

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
      list.find(
        (w) =>
          kindOf(w) === "modification" &&
          symbolsOf(w).includes(blueprint) &&
          level >= w.gradeFrom &&
          level <= w.gradeTo,
      ) ?? list.find((w) => kindOf(w) === "modification" && symbolsOf(w).includes(blueprint));
    if (!item) return;
    const name = gameName(item.bp.split("|")[2] ?? "");
    const left = Math.max(0, (item.rolls[level] ?? defaultRolls(level)) - 1);
    let updated: WishItem | null = { ...item, rolls: { ...item.rolls, [level]: left } };
    // A module that reaches the wanted grade is done, whatever the rolls planned (the game may
    // complete a grade in fewer). Rolls on the same module after that don't count twice.
    const slot = typeof ev.Slot === "string" ? `${item.id}|${ev.Slot}` : "";
    if (level >= item.gradeTo && slot && doneSlots.has(slot)) return;
    if (level >= item.gradeTo) {
      if (slot) doneSlots.add(slot);
      // One module done at the top grade.
      if (item.count > 1)
        updated = { ...item, count: item.count - 1, rolls: { ...item.rolls, [level]: defaultRolls(level) } };
      else updated = null;
      message = updated
        ? t("tour.gDoneGo", { name, level, value: item.count - 1 })
        : t("tour.gDoneRemovedFromWishlist", { name, level });
    } else {
      if (item.count === 1)
        updated = {
          ...updated,
          gradeFrom: left === 0 ? Math.min(level + 1, item.gradeTo) : Math.max(item.gradeFrom, level),
        };
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
