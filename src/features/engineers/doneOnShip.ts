// Is a wishlist line already engineered on the ship you fly? Read from the journal's Loadout: a
// modification counts when enough modules of its type carry its blueprint at the wanted grade or
// higher, an experimental effect when enough modules of its type carry that effect. Such lines
// need no engineer visit. The journal's blueprint names are shared by every weapon
// ("Weapon_Overcharged"), so the module type is checked too. A line imported from a build of the
// ship type you fly is checked on its own slots (the very modules of the build).

import type { Ctx } from "../../state/context.js";
import { blueprintGrades, type WishItem } from "../../state/store.js";
import { moduleOf } from "../materials/buildImporter.js";

/** Does the current ship's type match the build `item` was imported from (so its slots apply)? */
export function slotsApply(ctx: Ctx, item: WishItem): boolean {
  const ship = ctx.store.state.cmdr.loadout?.ship;
  return Boolean(item.slots?.length && item.shipType && ship && ship.toLowerCase() === item.shipType);
}

/**
 * True when the current ship already has what `item` asks for (as many modules as its quantity).
 * `grade`: the grade to check instead of the line's (the best one reachable in your region).
 */
export function doneOnShip(ctx: Ctx, item: WishItem, grade = item.gradeTo): boolean {
  const all = ctx.store.state.cmdr.loadout?.modules ?? [];
  // The build's own slots when they apply, else any module of the line's type.
  const slots = slotsApply(ctx, item) ? new Set(item.slots) : null;
  const modules = slots ? all.filter((m) => slots.has(m.slot.toLowerCase())) : all;
  const blueprints = [...blueprintGrades(ctx.game, item.bp).values()];
  if (!modules.length || !blueprints.length) return false;
  const symbols = new Set(blueprints.flatMap((b) => b.symbols ?? []).map((s) => s.toLowerCase()));
  if (!symbols.size) return false;
  const kind = blueprints[0].kind;
  const wantedModule = (item.bp.split("|")[1] ?? "").toLowerCase();
  let matching = 0;
  let ofType = 0;
  for (const module of modules) {
    const type = moduleOf(module.item ?? "");
    if (type && type.toLowerCase() !== wantedModule) continue;
    if (type) ofType++;
    const engineering = module.engineering;
    if (!engineering) continue;
    if (kind === "experimental") {
      if (engineering.experimental && symbols.has(engineering.experimental.toLowerCase())) matching++;
    } else if (symbols.has(engineering.blueprint.toLowerCase()) && engineering.level >= grade) matching++;
  }
  // As many as wanted; a line asking more modules than the ship has of that type (older imports
  // merged other modules into it) is done once all of them are.
  const wanted = slots ? slots.size : Math.max(1, item.count);
  return matching >= Math.max(1, ofType ? Math.min(wanted, ofType) : wanted);
}
