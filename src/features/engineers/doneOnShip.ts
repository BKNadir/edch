// Is a wishlist line already engineered on the ship you fly? Read from the journal's Loadout: a
// modification counts when enough modules carry its blueprint at the wanted grade or higher, an
// experimental effect when enough modules carry that effect. Such lines need no engineer visit.

import type { Ctx } from "../../state/context.js";
import { blueprintGrades, type WishItem } from "../../state/store.js";

/** True when the current ship already has what `item` asks for (as many modules as its quantity). */
export function doneOnShip(ctx: Ctx, item: WishItem): boolean {
  const modules = ctx.store.state.cmdr.loadout?.modules ?? [];
  const blueprints = [...blueprintGrades(ctx.game, item.bp).values()];
  if (!modules.length || !blueprints.length) return false;
  const symbols = new Set(blueprints.flatMap((b) => b.symbols ?? []).map((s) => s.toLowerCase()));
  if (!symbols.size) return false;
  const kind = blueprints[0].kind;
  let matching = 0;
  for (const module of modules) {
    const engineering = module.engineering;
    if (!engineering) continue;
    if (kind === "experimental") {
      if (engineering.experimental && symbols.has(engineering.experimental.toLowerCase())) matching++;
    } else if (symbols.has(engineering.blueprint.toLowerCase()) && engineering.level >= item.gradeTo) matching++;
  }
  return matching >= Math.max(1, item.count);
}
