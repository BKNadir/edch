// Search → Auto: what a name typed in the single search box is — a commodity, a ship, a module, a
// station service or a minor faction — so the search can switch to the right tab. Names match in
// the app's language only (the names the suggestions show), whatever the capitals or accents: a
// name close to another one in a second language can't be taken for it. Anything else is taken
// for a system name.

import { fold, gameName } from "../../platform/i18n.js";
import { exactFaction, type FactionIndex } from "./factionNames.js";

/** What a typed name can be. */
export type AutoKind = "commodity" | "ship" | "module" | "service" | "faction" | "system";

/** What was typed, and the name to search for (the game's English name, or the system typed). */
export interface AutoTarget {
  kind: AutoKind;
  name: string;
}

/** The names Auto knows, by kind (English game names; services as [value, label]). */
export interface AutoNames {
  commodities: string[];
  ships: string[];
  modules: string[];
  services: [string, string][];
  factions?: FactionIndex;
}

/** How a name is shown in the app's language. */
type Label = (name: string) => string;

/** The English name in `names` whose name in the app's language is `typed`, if any. */
function findName(names: string[], typed: string, label: Label = gameName): string | undefined {
  const wanted = fold(typed);
  return names.find((name) => fold(label(name)) === wanted);
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
