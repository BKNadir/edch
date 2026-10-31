import { gameName } from "./i18n.js";
// "Where to find" rules: each origin string from the data becomes a readable French
// hint and, when the condition can be searched, a Spansh query that lists real
// systems / bodies / stations near you.

import type { Material } from "./types.js";
import type { Settings } from "./store.js";

export type FinderType = "systems" | "bodies" | "stations" | "info";

export interface Finder {
  key: string;
  type: FinderType;
  title: string;
  hint?: string;
  filters?: Record<string, unknown>;
  /** Faction states to highlight in results. */
  states?: string[];
  /** For body searches: surface material to rank by percentage. */
  materialName?: string;
  /** Apply the BGS freshness filter (state-based searches). */
  fresh?: boolean;
  size?: number;
}

const BIG = "100000000000";
const choice = (...values: string[]) => ({ value: values });
const atLeast = (n: number) => ({ comparison: "<=>", value: [String(n), BIG] });
const states = (...values: string[]) => [{ state: { value: values } }];

const HGE_LABEL: Record<string, { fr: string; states?: string[]; allegiance?: string }> = {
  boom: { fr: "en Boom ou Expansion", states: ["Boom", "Expansion"] },
  "war/civil war": { fr: "en Guerre ou Guerre civile", states: ["War", "Civil War"] },
  "civil unrest": { fr: "en Troubles civils", states: ["Civil Unrest"] },
  outbreak: { fr: "en Épidémie", states: ["Outbreak"] },
  "federation systems": { fr: "de la Fédération", allegiance: "Federation" },
  "empire systems": { fr: "de l'Empire", allegiance: "Empire" },
};

/** Finders for one origin string; most give one, some none. */
function fromOrigin(origin: string, m: Material, s: Settings): Finder[] {
  const o = origin.toLowerCase();

  const hge = /high grade emissions, ([^)]+)\)/i.exec(origin);
  if (hge) {
    const rule = HGE_LABEL[hge[1].toLowerCase()];
    if (rule) {
      const filters: Record<string, unknown> = { population: atLeast(s.hgeMinPopulation) };
      if (rule.states) filters.minor_faction_presences = states(...rule.states);
      if (rule.allegiance) filters.allegiance = choice(rule.allegiance);
      return [
        {
          key: `hge:${hge[1].toLowerCase()}`,
          type: "systems",
          title: `Émissions de haute qualité (HGE) — systèmes peuplés ${rule.fr}`,
          hint:
            "Sources de signal « High Grade Emissions » en supercroisière. Plus fréquentes dans les systèmes très peuplés, surtout Alliance et Indépendants. Les HGE disparaissent après quelques minutes : reste en supercroisière et surveille le radar.",
          filters,
          states: rule.states,
          fresh: Boolean(rule.states),
        },
      ];
    }
  }

  if (o.startsWith("signal source (high security)") || o.startsWith("signal source (low security)") || o.startsWith("signal source (anarchy)")) {
    const level = o.includes("high") ? "High" : o.includes("low") ? "Low" : "Anarchy";
    const fr = level === "High" ? "haute" : level === "Low" ? "basse" : "anarchie";
    return [
      {
        key: `uss:${level}`,
        type: "systems",
        title: `Émissions encodées (USS) — systèmes à sécurité ${fr}`,
        hint: "Sources de signal « Encoded Emissions » : scanne les épaves et les balises dans le signal.",
        filters: { security: choice(level), population: atLeast(1) },
      },
    ];
  }

  if (o.startsWith("ship salvage (military")) {
    return [
      {
        key: "cz",
        type: "systems",
        title: "Zones de conflit — systèmes en Guerre / Guerre civile",
        hint: "Détruis des vaisseaux militaires ou d'autorité dans les zones de conflit et récupère leurs matériaux.",
        filters: { minor_faction_presences: states("War", "Civil War"), population: atLeast(1) },
        states: ["War", "Civil War"],
        fresh: true,
      },
    ];
  }

  if (o.startsWith("high wake scanning")) {
    if (o.includes("thargoid")) return [info("Scanner les sillages d'intercepteurs Thargoid", "Utilise un scanner de sillage sur un intercepteur Thargoid qui saute.")];
    return [
      {
        key: "wake",
        type: "systems",
        title: "Scanner les sillages haute énergie — systèmes très fréquentés",
        hint:
          "Installe un scanner de sillage (Frame Shift Wake Scanner) et scanne les sillages haute énergie près des stations. Les systèmes très peuplés (et ceux en Famine) ont beaucoup de trafic.",
        filters: { population: atLeast(1_000_000_000) },
      },
    ];
  }

  if (o.startsWith("surface prospecting")) {
    return [
      {
        key: `surface:${m.id}`,
        type: "bodies",
        title: `Prospection en surface — planètes riches en ${gameName(m.name)}`,
        hint: "Pose-toi, prends le SRV et tire sur les roches/affleurements (« Material Deposit »). Plus le % est élevé, plus le matériau sort souvent.",
        filters: { materials: { name: choice(m.name) }, is_landable: choice("true") },
        materialName: m.name,
        size: 60,
      },
    ];
  }

  if (o === "mining (ice rings)") {
    return [
      {
        key: "rings:icy",
        type: "bodies",
        title: "Minage — anneaux de glace",
        hint: "Mine les astéroïdes des anneaux glacés : les matériaux bruts tombent avec les fragments.",
        filters: { rings: choice("Icy") },
      },
    ];
  }

  if (o === "mining") {
    return [
      {
        key: "rings:pristine",
        type: "bodies",
        title: "Minage — anneaux vierges (Pristine)",
        hint: "Les anneaux « Pristine » donnent plus de fragments, donc plus de matériaux bruts.",
        filters: { reserve_level: choice("Pristine"), rings: choice("Metallic", "Metal Rich", "Rocky", "Icy") },
      },
    ];
  }

  if (o.startsWith("ancient/guardian")) {
    return [
      {
        key: "guardian",
        type: "bodies",
        title: "Sites Gardiens (ruines et structures)",
        hint: "Scanne les obélisques et tire sur les panneaux/sentinelles. Les sites sont surtout dans les nébuleuses Gardiennes (Regor, Vela…).",
        filters: { signals: { name: choice("Guardian") } },
      },
    ];
  }

  if (o.includes("thargoid")) {
    return [
      {
        key: "thargoid",
        type: "bodies",
        title: "Sites Thargoid au sol",
        hint:
          "Épaves, structures et barnacles Thargoid. Les intercepteurs et éclaireurs se rencontrent aussi autour des zones de guerre Thargoid.",
        filters: { signals: { name: choice("Thargoid") } },
      },
    ];
  }

  if (/^ship (salvage|scanning) \(combat/.test(o) || o === "ship scanning") {
    const scan = o.startsWith("ship scanning");
    return [
      {
        key: "res",
        type: "systems",
        title: scan ? "Scanner des vaisseaux de combat — systèmes à pirates (sécurité basse / anarchie)" : "Débris de vaisseaux de combat — RES des systèmes à pirates",
        hint: scan
          ? "Scanne les vaisseaux de combat (scanner de données / « Kill Warrant » non requis) dans les sites d'extraction de ressources (RES) des anneaux et en zones de conflit."
          : "Détruis des pirates dans les sites d'extraction de ressources (RES), autour des anneaux, puis ramasse les matériaux qu'ils lâchent.",
        filters: { security: choice("Low", "Anarchy"), population: atLeast(1) },
      },
    ];
  }

  if (/^ship (salvage|scanning) \(transport/.test(o)) {
    const scan = o.startsWith("ship scanning");
    return [
      {
        key: "traffic",
        type: "systems",
        title: scan ? "Scanner des cargos — systèmes très peuplés (beaucoup de trafic)" : "Débris de cargos — systèmes très peuplés (beaucoup de trafic)",
        hint: scan
          ? "Scanne les vaisseaux de transport près des stations et sur les routes commerciales."
          : "Les cargos détruits (missions, pirates, RES) lâchent ces matériaux.",
        filters: { population: atLeast(100_000_000) },
      },
    ];
  }

  if (o.startsWith("surface data point")) {
    return [
      {
        key: "settlements",
        type: "stations",
        title: "Installations planétaires — points de données à scanner",
        hint: "Pose-toi près d'une installation et scanne ses points de données (scanner de données du SRV ou à pied).",
        filters: { type: choice("Settlement", "Surface Settlement") },
        size: 6,
      },
    ];
  }

  // Not searchable: give a clear hint instead.
  const hints: [RegExp, string, string][] = [
    [/^mission reward/, "Récompense de mission", "Choisis ce matériau comme récompense de mission (tableau des missions)."],
    [/^surface poi/, "Points d'intérêt au sol", "Épaves et sites d'intérêt en surface."],
    [/^deep space data beacon/, "Balises de données en espace profond", "Balises dans les sources de signal en espace profond."],
    [/^signal source$/, "Sources de signal (USS)", "Sources de signal non identifiées en supercroisière."],
  ];
  for (const [re, title, hint] of hints) if (re.test(o)) return [info(title, hint)];
  return [info(origin, "")];
}

function info(title: string, hint: string): Finder {
  return { key: `info:${title}`, type: "info", title, hint };
}

const ECONOMY: Record<string, string> = {
  tourist: "Tourism",
  "high tech": "High Tech",
  industrial: "Industrial",
  research: "High Tech",
};

export const BUILDING_FR: Record<string, string> = {
  AGRI: "Agriculture",
  CMD: "Commandement",
  EXT: "Extraction",
  HAB: "Habitation",
  IND: "Industriel",
  LAB: "Laboratoire",
  MED: "Médical",
  PROC: "Traitement",
  PWR: "Centrale",
  RES: "Résidentiel",
  SEC: "Sécurité",
  STO: "Entrepôt",
};

function odysseyFinders(m: Material): Finder[] {
  const out: Finder[] = [];
  const eco = (m.settlements ?? []).map((s) => ECONOMY[s.toLowerCase()]).filter(Boolean);
  if (eco.length) {
    out.push({
      key: `settlement:${eco.join(",")}`,
      type: "stations",
      title: `Installations au sol (${[...new Set(m.settlements)].join(", ")})`,
      hint: "Fouille les casiers et terminaux des installations Odyssey de ce type.",
      filters: { type: choice("Settlement"), primary_economy: choice(...new Set(eco)) },
      size: 8,
    });
  } else if (m.origins.some((o) => /settlement/i.test(o))) {
    out.push({
      key: "settlement:any",
      type: "stations",
      title: "Installations au sol (Odyssey) les plus proches",
      hint: "Fouille les terminaux et casiers des bâtiments indiqués ci-dessous. Les installations abandonnées et celles en conflit n'ont pas besoin de permis.",
      filters: { type: choice("Settlement") },
      size: 8,
    });
  }
  const where: string[] = [];
  if (m.buildings?.length) where.push(`Bâtiments : ${m.buildings.map((b) => BUILDING_FR[b] ?? b).join(", ")}`);
  if (m.containers?.length) where.push(`Conteneurs : ${m.containers.join(", ")}`);
  if (where.length) out.push(info("Où chercher dans l'installation", where.join(" · ")));
  for (const origin of m.origins) {
    const o = origin.toLowerCase();
    if (o.includes("mission")) out.push(info("Récompense de mission", "Proposé en récompense de missions Odyssey."));
    else if (o.includes("bartender") || o.includes("bar")) out.push(info("Bar des stations (barman)", "Achetable chez le barman des stations Odyssey."));
    else if (!o.includes("settlement")) out.push(info(origin, ""));
  }
  return out;
}

/** Every finder for a material, searchable ones first, duplicates removed. */
export function findersFor(m: Material, settings: Settings): Finder[] {
  const list = m.ledger === "locker" ? odysseyFinders(m) : m.origins.flatMap((o) => fromOrigin(o, m, settings));
  if (!list.length) list.push(info("Source non documentée", "La communauté n'a pas encore de source fiable pour ce matériau (souvent lié aux Thargoids)."));
  const seen = new Set<string>();
  const unique = list.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  return unique.sort((a, b) => Number(a.type === "info") - Number(b.type === "info"));
}

/** Nearest material trader that deals in this category. */
export function traderFinder(m: Material, settings: Settings): Finder | null {
  if (m.ledger !== "ship" || !m.line) return null;
  const filters: Record<string, unknown> = { material_trader: choice(m.category) };
  if (settings.largePadOnly) filters.has_large_pad = choice("true");
  return {
    key: `trader:${m.category}${settings.largePadOnly ? ":L" : ""}`,
    type: "stations",
    title: `Trader de matériaux ${m.category === "Raw" ? "bruts" : m.category === "Encoded" ? "encodés" : "manufacturés"} le plus proche`,
    filters,
    size: 3,
  };
}
