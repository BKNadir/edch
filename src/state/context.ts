// What every page receives (Ctx: game data, store, sync), the View interface pages implement,
// and helpers on the commander's position and owned materials.

import type { Game } from "../game/data.js";
import type { Reference } from "../services/spansh.js";
import { totalNeeds, type Store } from "./store.js";
import type { Uploaders } from "../services/sync.js";
import { t } from "../platform/i18n.js";

export interface Ctx {
  game: Game;
  store: Store;
  sync?: Uploaders;
}

export interface View {
  mount(root: HTMLElement): void;
  update(): void;
}

/** Where searches are measured from: the current system, else the fallback in settings. */
export function referenceOf(ctx: Ctx): Reference {
  const loc = ctx.store.state.cmdr.location;
  if (loc?.pos) return { coords: loc.pos, system: loc.system, label: loc.system };
  const fallback = ctx.store.state.settings.fallbackSystem || "Sol";
  return { system: fallback, label: t("context.gameLocationUnknown", { fallback }) };
}

let needsMemo: { list: unknown; value: Record<string, number> } | undefined;

/** Materials reserved by the wishlist (memoised on the wishlist array). */
export function reserved(ctx: Ctx): Record<string, number> {
  const list = ctx.store.state.wishlist;
  if (needsMemo?.list !== list) needsMemo = { list, value: totalNeeds(ctx.game, list) };
  return needsMemo.value;
}

export function ownedOf(ctx: Ctx, id: string): number {
  const m = ctx.game.material(id);
  const s = ctx.store.state.cmdr;
  return (m?.ledger === "locker" ? s.locker[id] : s.materials[id]) ?? 0;
}
