// Exobiology catalogue (public/data/exobio.json, built by tools/gen_exobio.py): species values,
// colony distances and the planet conditions each species grows on.

import type { BodyInfo } from "./activity/state.js";

export interface Species {
  n: string;
  g: string;
  v: number;
  pt: string[];
  at: string[];
  vo: string[];
  gl: number;
  gh: number;
  tl: number;
  th: number;
  pl: number;
  ph: number;
}

interface ExobioData {
  genera: Record<string, number>;
  genusSymbols: Record<string, string>;
  symbols: Record<string, string>;
  species: Species[];
}

let data: ExobioData | null = null;
let byName = new Map<string, Species>();

export async function loadExobio(): Promise<void> {
  if (data) return;
  try {
    const res = await fetch("data/exobio.json");
    data = (await res.json()) as ExobioData;
    byName = new Map(data.species.map((s) => [s.n.toLowerCase(), s]));
  } catch {
    data = { genera: {}, genusSymbols: {}, symbols: {}, species: [] };
  }
}

/** Genus (as the catalogue spells it) from a journal genus symbol. */
export function genusOf(genusSymbol: string): string | undefined {
  return data?.genusSymbols[genusSymbol.toLowerCase()];
}

/** Catalogue entry for a journal species symbol, else its English name. */
export function speciesOf(symbol: string, englishName?: string): Species | undefined {
  const name = data?.symbols[symbol.toLowerCase()];
  return (
    (name ? byName.get(name.toLowerCase()) : undefined) ??
    (englishName ? byName.get(englishName.toLowerCase()) : undefined)
  );
}

/** Base value; for a species the catalogue doesn't know, the genus value when all its species share it. */
export function speciesValue(symbol: string, genusSymbol: string, englishName?: string): number | undefined {
  const sp = speciesOf(symbol, englishName);
  if (sp) return sp.v;
  const genus = genusOf(genusSymbol);
  if (!genus || !data) return undefined;
  const values = new Set(data.species.filter((s) => s.g === genus).map((s) => s.v));
  return values.size === 1 ? [...values][0] : undefined;
}

/** Minimum distance between two samples of a genus, metres. */
export function colonyDistance(genusSymbol: string): number | undefined {
  const genus = genusOf(genusSymbol);
  return genus ? data?.genera[genus] : undefined;
}

const letters = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];
const planetType = (raw?: string) =>
  letters(raw ?? "")
    .map((w) => (w === "world" ? "body" : w))
    .join("");
function atmosphere(raw?: string): string {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized || normalized === "no atmosphere") return "none";
  return letters(normalized.replace(/sulphur/g, "sulfur"))
    .filter((w) => !["thin", "thick", "hot", "atmosphere"].includes(w))
    .join("");
}
function volcanism(raw?: string): string {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized || normalized === "no volcanism") return "none";
  return letters(normalized)
    .filter((w) => w !== "volcanism")
    .join("");
}
const within = (v: number, lo: number, hi: number) => {
  const m = (hi - lo) * 0.02;
  return v >= lo - m && v <= hi + m;
};

/**
 * Species whose known conditions match this body, best value first. `genera` (genus symbols from a
 * surface scan) narrows the list when known. Galactic region isn't checked, so this is "possible".
 */
export function possibleSpecies(b: BodyInfo, genera: string[] = []): Species[] {
  if (!data || b.gravity === undefined || b.temperature === undefined) return [];
  const pt = planetType(b.planetClass);
  const at = atmosphere(b.atmosphere);
  const vo = volcanism(b.volcanism);
  const wanted = new Set(genera.map((g) => genusOf(g)).filter(Boolean) as string[]);
  return data.species
    .filter(
      (s) =>
        (!wanted.size || wanted.has(s.g)) &&
        s.pt.includes(pt) &&
        s.at.includes(at) &&
        s.vo.includes(vo) &&
        within(b.gravity!, s.gl, s.gh) &&
        within(b.temperature!, s.tl, s.th) &&
        within(b.pressure ?? 0, s.pl, s.ph),
    )
    .sort((a, b2) => b2.v - a.v);
}

/** Every genus has a fixed colony distance; handy for the "what to expect" list. */
export const genusDistance = (genus: string) => data?.genera[genus];
