import { gameName, t } from "../../platform/i18n.js";
// "Where to find" rules: each origin string from the data becomes a readable French
// hint and, when the condition can be searched, a Spansh query that lists real
// systems / bodies / stations near you.

import type { Material } from "../../game/types.js";
import type { Settings } from "../../state/store.js";

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
  boom: { fr: t("sources.boomExpansion"), states: ["Boom", "Expansion"] },
  "war/civil war": { fr: t("sources.warCivilWar"), states: ["War", "Civil War"] },
  "civil unrest": { fr: t("sources.civilUnrest"), states: ["Civil Unrest"] },
  outbreak: { fr: t("sources.outbreak"), states: ["Outbreak"] },
  "federation systems": { fr: t("sources.federation"), allegiance: "Federation" },
  "empire systems": { fr: t("sources.empire"), allegiance: "Empire" },
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
          title: t("sources.highGradeEmissionsPopulatedSystems", { fr: rule.fr }),
          hint: t("sources.highGradeEmissionsSignalSourcesSupercruise"),
          filters,
          states: rule.states,
          fresh: Boolean(rule.states),
        },
      ];
    }
  }

  if (
    o.startsWith("signal source (high security)") ||
    o.startsWith("signal source (low security)") ||
    o.startsWith("signal source (anarchy)")
  ) {
    const level = o.includes("high") ? "High" : o.includes("low") ? "Low" : "Anarchy";
    const fr = level === "High" ? t("sources.high") : level === "Low" ? t("sources.low") : t("sources.anarchy");
    return [
      {
        key: `uss:${level}`,
        type: "systems",
        title: t("sources.encodedEmissionsSecuritySystems", { fr }),
        hint: t("sources.encodedEmissionsSignalSourcesScanWrecks"),
        filters: { security: choice(level), population: atLeast(1) },
      },
    ];
  }

  if (o.startsWith("ship salvage (military")) {
    return [
      {
        key: "cz",
        type: "systems",
        title: t("sources.conflictZonesSystemsWarCivilWar"),
        hint: t("sources.destroyMilitaryAuthorityShipsConflictZones"),
        filters: { minor_faction_presences: states("War", "Civil War"), population: atLeast(1) },
        states: ["War", "Civil War"],
        fresh: true,
      },
    ];
  }

  if (o.startsWith("high wake scanning")) {
    if (o.includes("thargoid"))
      return [info(t("sources.scanThargoidInterceptorWakes"), t("sources.useWakeScannerThargoidInterceptorJumps"))];
    return [
      {
        key: "wake",
        type: "systems",
        title: t("sources.scanHighEnergyWakesBusySystems"),
        hint: t("sources.fitFrameShiftWakeScannerScan"),
        filters: { population: atLeast(1_000_000_000) },
      },
    ];
  }

  if (o.startsWith("surface prospecting")) {
    return [
      {
        key: `surface:${m.id}`,
        type: "bodies",
        title: t("sources.surfaceProspectingPlanetsRich", { name: gameName(m.name) }),
        hint: t("sources.landTakeSrvShootMineralRocks"),
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
        title: t("sources.miningIcyRings"),
        hint: t("sources.mineAsteroidsIcyRingsRawMaterials"),
        filters: { rings: choice("Icy") },
      },
    ];
  }

  if (o === "mining") {
    return [
      {
        key: "rings:pristine",
        type: "bodies",
        title: t("sources.miningPristineRings"),
        hint: t("sources.ringsPristineReservesGiveMoreFragments"),
        filters: { reserve_level: choice("Pristine"), rings: choice("Metallic", "Metal Rich", "Rocky", "Icy") },
      },
    ];
  }

  if (o.startsWith("ancient/guardian")) {
    return [
      {
        key: "guardian",
        type: "bodies",
        title: t("sources.guardianSitesRuinsStructures"),
        hint: t("sources.scanObelisksShootPanelsSentinelsSites"),
        filters: { signals: { name: choice("Guardian") } },
      },
    ];
  }

  if (o.includes("thargoid")) {
    return [
      {
        key: "thargoid",
        type: "bodies",
        title: t("sources.thargoidSurfaceSites"),
        hint: t("sources.thargoidWrecksStructuresBarnaclesInterceptorsSco"),
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
        title: scan ? t("sources.scanCombatShipsPirateSystemsLow") : t("sources.combatShipSalvageResPirateSystems"),
        hint: scan
          ? t("sources.scanShipsCombatRingResourceExtraction")
          : t("sources.destroyPiratesResourceExtractionSitesRes"),
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
        title: scan
          ? t("sources.scanHaulersHighlyPopulatedSystemsLots")
          : t("sources.haulerSalvageHighlyPopulatedSystemsLots"),
        hint: scan
          ? t("sources.scanTransportShipsNearStationsTrade")
          : t("sources.destroyedHaulersMissionsPiratesResDrop"),
        filters: { population: atLeast(100_000_000) },
      },
    ];
  }

  if (o.startsWith("surface data point")) {
    return [
      {
        key: "settlements",
        type: "stations",
        title: t("sources.planetarySettlementsDataPointsScan"),
        hint: t("sources.landNearSettlementScanDataPoints"),
        filters: { type: choice("Settlement", "Surface Settlement") },
        size: 6,
      },
    ];
  }

  // Not searchable: give a clear hint instead.
  const hints: [RegExp, string, string][] = [
    [/^mission reward/, t("sources.missionReward"), t("sources.pickMaterialMissionRewardMissionBoard")],
    [/^surface poi/, t("sources.surfacePointsInterest"), t("sources.wrecksPointsInterestSurface")],
    [/^deep space data beacon/, t("sources.deepSpaceDataBeacons"), t("sources.beaconsDeepSpaceSignalSources")],
    [/^signal source$/, t("sources.unidentifiedSignalSources"), t("sources.unidentifiedSignalSourcesSupercruise")],
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
  AGRI: t("sources.agriculture"),
  CMD: t("sources.command"),
  EXT: t("sources.extraction"),
  HAB: t("sources.habitation"),
  IND: t("sources.industrial"),
  LAB: t("sources.laboratory"),
  MED: t("sources.medical"),
  PROC: t("sources.processing"),
  PWR: t("sources.power"),
  RES: t("sources.residential"),
  SEC: t("common.security"),
  STO: t("sources.storage"),
};

function odysseyFinders(m: Material): Finder[] {
  const out: Finder[] = [];
  const eco = (m.settlements ?? []).map((s) => ECONOMY[s.toLowerCase()]).filter(Boolean);
  if (eco.length) {
    out.push({
      key: `settlement:${eco.join(",")}`,
      type: "stations",
      title: t("sources.surfaceSettlements", { value: [...new Set(m.settlements)].join(", ") }),
      hint: t("sources.searchLockersTerminalsOdysseySettlementsType"),
      filters: { type: choice("Settlement"), primary_economy: choice(...new Set(eco)) },
      size: 8,
    });
  } else if (m.origins.some((o) => /settlement/i.test(o))) {
    out.push({
      key: "settlement:any",
      type: "stations",
      title: t("sources.nearestSurfaceSettlementsOdyssey"),
      hint: t("sources.searchTerminalsLockersBuildingsListedBelow"),
      filters: { type: choice("Settlement") },
      size: 8,
    });
  }
  const where: string[] = [];
  if (m.buildings?.length)
    where.push(t("sources.buildings", { value: m.buildings.map((b) => BUILDING_FR[b] ?? b).join(", ") }));
  if (m.containers?.length) where.push(t("sources.containers", { value: m.containers.join(", ") }));
  if (where.length) out.push(info(t("sources.whereLookSettlement"), where.join(" · ")));
  for (const origin of m.origins) {
    const o = origin.toLowerCase();
    if (o.includes("mission")) out.push(info(t("sources.missionReward"), t("sources.offeredOdysseyMissionReward")));
    else if (o.includes("bartender") || o.includes("bar"))
      out.push(info(t("sources.stationBarBartender"), t("sources.canBoughtFromBartenderOdysseyStations")));
    else if (!o.includes("settlement")) out.push(info(origin, ""));
  }
  return out;
}

/** Every finder for a material, searchable ones first, duplicates removed. */
export function findersFor(m: Material, settings: Settings): Finder[] {
  const list = m.ledger === "locker" ? odysseyFinders(m) : m.origins.flatMap((o) => fromOrigin(o, m, settings));
  if (!list.length) list.push(info(t("sources.undocumentedSource"), t("sources.communityHasNoReliableSourceMaterial")));
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
    title: t("sources.nearestMaterialTrader", {
      value:
        m.category === "Raw"
          ? t("sources.raw")
          : m.category === "Encoded"
            ? t("sources.encoded")
            : t("sources.manufactured"),
    }),
    filters,
    size: 3,
  };
}
