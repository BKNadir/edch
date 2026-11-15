// A text field for a minor faction's name, suggesting names as they are typed: the factions seen in
// the journal first, then every faction of the game (public/data/factions.txt, loaded the first
// time a field needs it). Used by Search → Faction, Search → Auto and the BGS page.

import { log } from "../../platform/logger.js";
import { factionIndex, matchFactions, type FactionIndex } from "../../features/search/factionNames.js";
import type { Ctx } from "../../state/context.js";
import { suggestBox } from "../../ui/suggestBox.js";

/** Every faction of the game, loaded once. */
let allFactions: Promise<string[]> | undefined;

function loadFactions(): Promise<string[]> {
  return (allFactions ??= fetch("data/factions.txt")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((text) => text.split("\n").filter(Boolean))
    .catch((error) => {
      log.warn("search", `Faction list unavailable, journal factions only: ${String(error?.message ?? error)}`);
      return [];
    }));
}

/** The journal's factions first, then the game's; rebuilt when the journal knows new ones. */
let index: { known: string[]; value: FactionIndex } | undefined;

/** The names suggested, ready to be matched (see features/search/factionNames.ts). */
export async function factionsOf(ctx: Ctx): Promise<FactionIndex> {
  const known = ctx.store.state.cmdr.knownFactions ?? [];
  const all = await loadFactions();
  if (index?.known !== known) index = { known, value: factionIndex(known, all) };
  return index.value;
}

/**
 * Wraps `input` (a text field for a faction's name) with the suggestions; `picked(name)` runs when
 * one is chosen. Returns the wrapper to put in the page.
 */
export function factionField(ctx: Ctx, input: HTMLInputElement, picked: (name: string) => void): HTMLElement {
  // The game's list is ready by the time a name is typed; until then, the journal's factions.
  let ready: FactionIndex = factionIndex(ctx.store.state.cmdr.knownFactions ?? []);
  void factionsOf(ctx).then((value) => (ready = value));
  return suggestBox(input, (text) => matchFactions(ready, text), picked);
}
