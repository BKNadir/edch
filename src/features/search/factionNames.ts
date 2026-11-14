// The game's minor factions offered while typing a faction's name (Search → Faction): matched
// without caring about capitals or accents, names starting with what was typed first, then those
// with a word starting with it, then the others containing it.

import { fold } from "../../platform/i18n.js";

/** The faction names, with their folded form, ready to be searched. */
export interface FactionIndex {
  names: string[];
  folded: string[];
}

/** Builds the index of `names` (the journal's factions first, then the full list, without twins). */
export function factionIndex(...lists: string[][]): FactionIndex {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const list of lists)
    for (const name of list) {
      const clean = name.trim();
      const key = fold(clean);
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      names.push(clean);
    }
  return { names, folded: names.map((n) => fold(n)) };
}

/** Up to `limit` names matching `typed`, best first (see the header). */
export function matchFactions(index: FactionIndex, typed: string, limit = 12): string[] {
  const wanted = fold(typed);
  if (!wanted) return [];
  const starts: string[] = [];
  const words: string[] = [];
  const inside: string[] = [];
  for (let i = 0; i < index.names.length; i++) {
    const name = index.folded[i];
    const at = name.indexOf(wanted);
    if (at < 0) continue;
    if (at === 0) starts.push(index.names[i]);
    else if (name[at - 1] === " " || name[at - 1] === "'") words.push(index.names[i]);
    else inside.push(index.names[i]);
    if (starts.length >= limit) break;
  }
  return [...starts, ...words, ...inside].slice(0, limit);
}

/** The game's spelling of `typed` when a faction has that name, capitals and accents aside. */
export function exactFaction(index: FactionIndex, typed: string): string | undefined {
  const wanted = fold(typed);
  const at = index.folded.indexOf(wanted);
  return at >= 0 ? index.names[at] : undefined;
}
