// Search → Auto: what a name typed in the single search box is — a commodity, a ship, a module, a
// station service or a minor faction — so the search can switch to the right tab. Names match in
// English or in the app's language, whatever the capitals or accents. Anything else is taken for
// a system name.

import { fold, gameName } from "../../platform/i18n.js";
import { exactFaction, type FactionIndex } from "./factionNames.js";

/** What was typed, and the game's English name to search for. */
export type AutoTarget =
  | { kind: "commodity" | "ship" | "module" | "service" | "faction"; name: string }
  | { kind: "system"; name: string };

/** The names Auto knows, by kind (English game names; services as [value, label]). */
export interface AutoNames {
  commodities: string[];
  ships: string[];
  modules: string[];
  services: [string, string][];
  factions?: FactionIndex;
}

/** The English name in `names` that `typed` stands for (in English or translated), if any. */
function findName(names: string[], typed: string, label: (name: string) => string = gameName): string | undefined {
  const wanted = fold(typed);
  return names.find((name) => fold(name) === wanted || fold(label(name)) === wanted);
}

/** What `typed` is (see the header), or null when nothing was typed. */
export function guessSearch(typed: string, names: AutoNames): AutoTarget | null {
  const text = typed.trim();
  if (!text) return null;
  const commodity = findName(names.commodities, text);
  if (commodity) return { kind: "commodity", name: commodity };
  const ship = findName(names.ships, text);
  if (ship) return { kind: "ship", name: ship };
  const module = findName(names.modules, text);
  if (module) return { kind: "module", name: module };
  const labels = new Map(names.services);
  const service = findName(
    names.services.map(([value]) => value),
    text,
    (value) => labels.get(value) ?? value,
  );
  if (service) return { kind: "service", name: service };
  const faction = names.factions ? exactFaction(names.factions, text) : undefined;
  if (faction) return { kind: "faction", name: faction };
  return { kind: "system", name: text };
}
