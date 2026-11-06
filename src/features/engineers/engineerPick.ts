// Which engineers can do a wishlist line: those you know who reach the wanted grade (or the best
// grade available), for an experimental effect any of them; the nearest one when a line stands
// alone. The tour groups lines (tour.ts). The Bubble and Colonia are 22 000 ly apart: engineers
// of the other region are left out.

import { referenceOf, type Ctx } from "../../state/context.js";
import type { EngineerStatus } from "../../game/journal/state.js";
import { distance } from "../../services/spansh.js";
import { blueprintGrades, type WishItem } from "../../state/store.js";
import type { Blueprint, Engineer } from "../../game/types.js";

type Vec3 = [number, number, number];

const SOL: Vec3 = [0, 0, 0];
const COLONIA: Vec3 = [-9530.5, -910.28125, 19808.125];

export type Region = "bubble" | "colonia";
export const regionOf = (pos: Vec3): Region =>
  (distance(pos, COLONIA) ?? Infinity) < (distance(pos, SOL) ?? Infinity) ? "colonia" : "bubble";

/** Where distances are measured from (the commander, or Sol when the position is unknown). */
export function origin(ctx: Ctx): Vec3 | undefined {
  const ref = referenceOf(ctx);
  if (ref.coords) return ref.coords as Vec3;
  return (ref.system ?? "").toLowerCase() === "sol" ? SOL : undefined;
}

export interface Pick {
  engineer: Engineer;
  /** Highest grade this engineer can do for the line (0 for effects without grades). */
  grade: number;
  status?: EngineerStatus;
  unlocked: boolean;
  dist?: number;
}

export interface PickResult {
  pick?: Pick;
  /** Nothing known for this line: the nearest engineer to meet (shown in the red box). */
  toMeet?: Pick;
  /** The line has no engineer at all (synthesis, tech broker…). */
  none?: boolean;
}

const isKnown = (st?: EngineerStatus) => Boolean(st && st.progress !== "Barred");

/** Engineers able to do `item`, with the best grade each can reach. */
function candidates(ctx: Ctx, item: WishItem): { e: Engineer; grade: number }[] {
  const grades = blueprintGrades(ctx.game, item.bp);
  const best = new Map<string, number>();
  for (const [g, bp] of grades) for (const name of bp.engineers ?? []) best.set(name, Math.max(best.get(name) ?? 0, g));
  return ctx.game.data.engineers.filter((e) => best.has(e.name)).map((e) => ({ e, grade: best.get(e.name)! }));
}

export function lineBlueprint(ctx: Ctx, item: WishItem): Blueprint | undefined {
  return [...blueprintGrades(ctx.game, item.bp).values()][0];
}

/**
 * Every engineer able to do `item` as wanted, nearest first: for a modification those reaching
 * the wanted grade (else those with the best grade available), for an experimental effect any of
 * them. Empty with `toMeet` or `none` when nobody you can visit does it.
 */
export function engineerChoices(ctx: Ctx, item: WishItem): { choices: Pick[]; toMeet?: Pick; none?: boolean } {
  const s = ctx.store.state.settings.engineers;
  const bp = lineBlueprint(ctx, item);
  const all = candidates(ctx, item);
  if (!bp || !all.length) return { choices: [], none: true };
  const here = origin(ctx);
  const region = here ? regionOf(here) : undefined;
  const statuses = ctx.store.state.cmdr.engineers;
  const pool = all
    .filter(({ e }) => !s.regionLimit || !region || !e.pos || regionOf(e.pos as Vec3) === region)
    .map(({ e, grade }): Pick => {
      const status = statuses[e.name];
      return { engineer: e, grade, status, unlocked: status?.progress === "Unlocked", dist: distance(here, e.pos) };
    });
  const byDist = (a: Pick, b: Pick) => (a.dist ?? Infinity) - (b.dist ?? Infinity);
  const known = pool.filter((p) => isKnown(p.status));
  const usable = s.knownOnly ? known : pool;
  if (!usable.length) return { choices: [], toMeet: [...pool].sort(byDist)[0] };
  // A modification: those reaching the wanted grade, else the best grade available. An
  // engineer's own maximum counts, even if your rank with them is lower for now.
  if (bp.kind === "modification") {
    const want = item.gradeTo;
    const enough = usable.filter((p) => p.grade >= want);
    if (enough.length) return { choices: enough.sort(byDist) };
    const top = Math.max(...usable.map((p) => p.grade));
    return { choices: usable.filter((p) => p.grade === top).sort(byDist) };
  }
  // An experimental effect (or anything without grades): the grade doesn't matter.
  return { choices: [...usable].sort(byDist) };
}

/** The nearest engineer to visit for `item` alone (the tour may group it with another one). */
export function pickEngineer(ctx: Ctx, item: WishItem): PickResult {
  const r = engineerChoices(ctx, item);
  return r.choices.length ? { pick: r.choices[0] } : { toMeet: r.toMeet, none: r.none };
}
