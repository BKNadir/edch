// Search → Modules: several modules at once, to find a station that sells all of them.

/** A module wanted: its outfitting name (Spansh's), and its class and rating ("" for any). */
export interface WantedModule {
  name: string;
  cls: string;
  rating: string;
}

export const sameModule = (a: WantedModule, b: WantedModule) =>
  a.name === b.name && a.cls === b.cls && a.rating === b.rating;

/** Whether a station's outfitting (Spansh's list) has `wanted`, under its name or an alias. */
export function stationSells(
  outfitting: { name?: unknown; class?: unknown; rating?: unknown }[],
  wanted: WantedModule,
  aliases: Record<string, string[]>,
): boolean {
  const names = [wanted.name, ...(aliases[wanted.name] ?? [])].map((n) => n.toLowerCase());
  return outfitting.some(
    (m) =>
      names.includes(String(m.name ?? "").toLowerCase()) &&
      (!wanted.cls || String(m.class ?? "") === wanted.cls) &&
      (!wanted.rating || String(m.rating ?? "").toUpperCase() === wanted.rating),
  );
}
