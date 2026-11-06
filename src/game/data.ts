// Game data (public/data/game.json): materials, blueprints, engineers, modules and their
// categories, loaded once at start-up into a Game object with lookups.

import type { Blueprint, Engineer, GameData, Material } from "./types.js";
import { gameName, t } from "../platform/i18n.js";

/** Storage cap of a ship material by grade (game rule). */
export const CAPACITY: Record<number, number> = { 1: 300, 2: 250, 3: 200, 4: 150, 5: 100 };

export const CATEGORY_LABELS: Record<string, string> = {
  Raw: t("data.raw"),
  Manufactured: t("data.manufactured"),
  Encoded: t("data.encodedData"),
  Item: t("data.items"),
  Component: t("data.components"),
  Data: t("data.data"),
  Consumable: t("data.consumables"),
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
    return line ? (this.data.lines[line] ?? line) : "";
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

// ---------------- texts of the data, in the app's language ----------------

/** "Tod 'The Blaster' McQuinn" → "todTheBlasterMcQuinn" (key of the engineerData texts). */
function textKey(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1))).join("");
}

/** How to meet or unlock an engineer, or who tells you about them, in the app's language. */
export function engineerText(e: Engineer, field: "meeting" | "unlock" | "discovery"): string {
  const english = e[field];
  if (!english) return "";
  if (field === "discovery") {
    // "From Hera Tani (grade 3-4).", "From Kit Fowler", "Common knowledge.", "Public sources."…
    const from = /^From (.+?)(?: \(grade ([\d-]+)\))?\.?$/.exec(english);
    if (!from) return t("engineerData.discoveryPublic");
    return from[2]
      ? t("engineerData.discoveryFromGrade", { names: from[1], grade: from[2] })
      : t("engineerData.discoveryFrom", { names: from[1] });
  }
  const suffix = field === "meeting" ? "Meeting" : "Unlock";
  return t(`engineerData.${textKey(e.name)}${suffix}`, { defaultValue: english });
}

const SITE_TEXT_KEYS: Record<string, string> = {
  "Jameson Crash Site — relog to respawn": "engineerData.siteJamesonCrashSite",
  "Dav's Hope — relog to respawn": "engineerData.siteDavsHope",
  "Crashed Thargoid ship": "engineerData.siteCrashedThargoidShip",
  "Brain trees": "engineerData.siteBrainTrees",
};

/** What a farming site is, in the app's language. */
export function siteText(what: string): string {
  const shards = /^Crystalline shards \((.+)\)$/.exec(what);
  if (shards) return t("engineerData.siteCrystallineShards", { element: gameName(shards[1]) });
  const key = SITE_TEXT_KEYS[what];
  return key ? t(key) : what;
}
