import type { Blueprint, GameData, Material } from "./types.js";

/** Storage cap of a ship material by grade (game rule). */
export const CAPACITY: Record<number, number> = { 1: 300, 2: 250, 3: 200, 4: 150, 5: 100 };

export const CATEGORY_FR: Record<string, string> = {
  Raw: "Brut",
  Manufactured: "Manufacturé",
  Encoded: "Données encodées",
  Item: "Objets",
  Component: "Composants",
  Data: "Données",
  Consumable: "Consommables",
};

export class Game {
  readonly data: GameData;
  readonly byId = new Map<string, Material>();
  readonly byLine = new Map<string, Material[]>();
  /** Blueprints that use a given material. */
  readonly usedIn = new Map<string, Blueprint[]>();

  constructor(data: GameData) {
    this.data = data;
    for (const m of data.materials) {
      this.byId.set(m.id, m);
      if (m.line) {
        const list = this.byLine.get(m.line) ?? [];
        list.push(m);
        this.byLine.set(m.line, list);
      }
    }
    for (const list of this.byLine.values()) list.sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0));
    for (const bp of data.blueprints) {
      for (const id of Object.keys(bp.ingredients)) {
        const list = this.usedIn.get(id) ?? [];
        list.push(bp);
        this.usedIn.set(id, list);
      }
    }
  }

  material(id: string): Material | undefined {
    return this.byId.get(id.toLowerCase());
  }

  /** Display name for an ingredient symbol, including commodities we have no record of. */
  nameOf(id: string): string {
    const m = this.material(id);
    if (m) return m.name;
    return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  capacityOf(id: string): number | undefined {
    const m = this.material(id);
    return m?.ledger === "ship" && m.grade ? CAPACITY[m.grade] : undefined;
  }

  lineName(line?: string): string {
    return line ? this.data.lines[line] ?? line : "";
  }

  /** Trader lines of one ship category, in a stable order. */
  linesOf(category: string): string[] {
    return [...this.byLine.keys()]
      .filter((line) => this.byLine.get(line)![0].category === category)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  }
}

export async function loadGame(): Promise<Game> {
  const response = await fetch("data/game.json");
  if (!response.ok) throw new Error(`game.json: HTTP ${response.status}`);
  return new Game((await response.json()) as GameData);
}
