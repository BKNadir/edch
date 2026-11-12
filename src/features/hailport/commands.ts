// What EDCH offers Hailport's voice assistant: the commands (open a page, copy the next system,
// plot a route, find the nearest service, count a material, sum up missions or colonisation,
// change what is shared…) and how each one runs. Spoken texts are in Hailport's language when
// EDCH has it (see platform/i18n.ts: useTextsOf), else English.

import { copyText } from "../../platform/bridge.js";
import { gameNameIn, resolveGameName, tIn } from "../../platform/i18n.js";
import type { CommandAnswer, CommandDeclaration } from "../../services/hailport/protocol.js";
import { fmtLy, runFinder } from "../../services/spansh.js";
import type { Ctx } from "../../state/context.js";
import { referenceOf } from "../../state/context.js";
import type { ShareMode } from "../../state/syncSettings.js";
import { NAV } from "../../ui/menu/pages.js";
import { clearAlerts } from "../../ui/notifier.js";
import { navRouteSystems, nextSystemToEnter, setNavRoute } from "../engineers/tour.js";
import { defaultSupercharge, plotGalaxy, shipParams } from "../navigation/galaxyRoute.js";

/** A text in the language being spoken (named "t" so the translation check sees the keys). */
type Speak = (key: string, variables?: Record<string, unknown>) => string;
const speaker =
  (language: string): Speak =>
  (key, variables) =>
    tIn(language, key, variables);

/** Services the assistant can look for, and what Spansh calls them (stations only, no carriers). */
const SERVICES: Record<string, Record<string, unknown>> = {
  material_trader_raw: { material_trader: { value: ["Raw"] } },
  material_trader_manufactured: { material_trader: { value: ["Manufactured"] } },
  material_trader_encoded: { material_trader: { value: ["Encoded"] } },
  interstellar_factors: { services: [{ name: { value: ["Interstellar Factors Contact"] } }] },
  technology_broker: { services: [{ name: { value: ["Technology Broker"] } }] },
  universal_cartographics: { services: [{ name: { value: ["Universal Cartographics"] } }] },
  vista_genomics: { services: [{ name: { value: ["Vista Genomics"] } }] },
  black_market: { services: [{ name: { value: ["Black Market"] } }] },
  shipyard: { services: [{ name: { value: ["Shipyard"] } }] },
  outfitting: { services: [{ name: { value: ["Outfitting"] } }] },
  refuel: { services: [{ name: { value: ["Refuel"] } }] },
  repair: { services: [{ name: { value: ["Repair"] } }] },
  restock: { services: [{ name: { value: ["Restock"] } }] },
  search_and_rescue: { services: [{ name: { value: ["Search and Rescue"] } }] },
  pioneer_supplies: { services: [{ name: { value: ["Pioneer Supplies"] } }] },
  apex_interstellar: { services: [{ name: { value: ["Apex Interstellar"] } }] },
};

/** Station types for the service search: real stations, not fleet carriers (they move). */
const STATION_TYPES = [
  "Asteroid base",
  "Coriolis Starport",
  "Dodec Starport",
  "Mega ship",
  "Ocellus Starport",
  "Orbis Starport",
  "Outpost",
  "Planetary Outpost",
  "Planetary Port",
  "Settlement",
];

const SHARE_MODES: ShareMode[] = ["normal", "bgs", "invisible"];

/** The pages a voice command may open. */
const pageIds = () => NAV.map((page) => page.id).filter((id) => id !== "mobile");

/** The commands, described in `language` (the model reads the descriptions). */
export function hailportCommands(language: string): CommandDeclaration[] {
  const t = speaker(language);
  return [
    {
      name: "open_page",
      description: t("hailport.openPageDescription"),
      params: { page: { type: "string", enum: pageIds(), description: t("hailport.pageParameter") } },
      required: ["page"],
    },
    { name: "copy_next_system", description: t("hailport.copyNextSystemDescription"), params: {} },
    {
      name: "plot_route",
      description: t("hailport.plotRouteDescription"),
      params: { destination: { type: "string", maxLength: 80, description: t("hailport.destinationParameter") } },
      required: ["destination"],
    },
    {
      name: "find_nearest",
      description: t("hailport.findNearestDescription"),
      params: { service: { type: "string", enum: Object.keys(SERVICES), description: t("hailport.serviceParameter") } },
      required: ["service"],
    },
    {
      name: "material_count",
      description: t("hailport.materialCountDescription"),
      params: { material: { type: "string", maxLength: 60, description: t("hailport.materialParameter") } },
      required: ["material"],
    },
    { name: "missions_summary", description: t("hailport.missionsSummaryDescription"), params: {} },
    { name: "colonisation_needs", description: t("hailport.colonisationNeedsDescription"), params: {} },
    {
      name: "set_share_mode",
      description: t("hailport.setShareModeDescription"),
      params: { mode: { type: "string", enum: SHARE_MODES, description: t("hailport.modeParameter") } },
      required: ["mode"],
      confirm: true,
    },
    { name: "clear_notifications", description: t("hailport.clearNotificationsDescription"), params: {} },
  ];
}

/** Runs a command Hailport asked for (its arguments already checked against the declaration). */
export async function runHailportCommand(
  ctx: Ctx,
  command: string,
  args: Record<string, unknown>,
  language: string,
): Promise<CommandAnswer> {
  const t = speaker(language);
  const fail = (code: string, message: string): CommandAnswer => ({ ok: false, error: { code, message } });
  switch (command) {
    case "open_page": {
      const page = NAV.find((p) => p.id === args.page);
      if (!page) return fail("not_found", t("hailport.pageUnknown"));
      ctx.store.setView(page.id);
      return { ok: true, say: t("hailport.pageOpened", { page: page.label }) };
    }
    case "copy_next_system": {
      const next = nextSystemToEnter();
      if (!next) return fail("invalid_state", t("hailport.noRouteInProgress"));
      const copied = await copyText(next.system);
      return copied
        ? { ok: true, say: t("hailport.systemCopied", { system: next.system }), data: { next_system: next.system } }
        : fail("not_available", t("hailport.copyFailed"));
    }
    case "plot_route":
      return plotRoute(ctx, String(args.destination), t);
    case "find_nearest":
      return findNearest(ctx, String(args.service), t);
    case "material_count":
      return materialCount(ctx, String(args.material), language, t);
    case "missions_summary":
      return missionsSummary(ctx, t);
    case "colonisation_needs":
      return colonisationNeeds(ctx, t);
    case "set_share_mode": {
      const mode = args.mode as ShareMode;
      const sync = ctx.store.state.settings.sync;
      if (sync.shareMode !== mode) ctx.store.updateSettings({ sync: { ...sync, shareMode: mode } });
      const said = {
        normal: t("hailport.shareModeNormal"),
        bgs: t("hailport.shareModeBgs"),
        invisible: t("hailport.shareModeInvisible"),
      };
      return { ok: true, say: said[mode] };
    }
    case "clear_notifications":
      clearAlerts();
      return { ok: true, say: t("hailport.notificationsCleared") };
    default:
      return fail("not_found", t("hailport.commandUnknown"));
  }
}

/** Plots the exact route to `destination` with Spansh (a long command: the answer comes later). */
function plotRoute(ctx: Ctx, destination: string, t: Speak): CommandAnswer {
  const { cmdr } = ctx.store.state;
  const from = cmdr.location?.system;
  const { params } = shipParams(cmdr.loadout);
  if (!from || !params) return { ok: false, error: { code: "invalid_state", message: t("hailport.shipUnknown") } };
  const later = plotGalaxy(params, {
    from,
    to: destination,
    cargo: cmdr.cargoMass ?? 0,
    algorithm: "optimistic",
    useSupercharge: true,
    isSupercharged: false,
    useInjections: false,
    excludeSecondary: false,
    refuelEveryScoopable: false,
    supercharge: defaultSupercharge(cmdr.loadout),
  }).then(
    (route) => {
      const systems = route.jumps.map((jump) => jump.system);
      setNavRoute(systems);
      const jumps = Math.max(0, systems.length - 1);
      const next = systems[1];
      return {
        say: next
          ? t("hailport.routeReady", { destination, count: jumps, next })
          : t("hailport.routeAlreadyThere", { destination }),
        data: { destination, jumps, next_system: next ?? null },
      };
    },
    (error) => ({
      say: /unable to find route|could not find/i.test(String((error as Error)?.message ?? error))
        ? t("hailport.routeNotFound", { destination })
        : t("hailport.routeFailed"),
    }),
  );
  return { ok: true, say: t("hailport.routeComputing", { destination }), later };
}

/** The nearest station with `service` (a long command: Spansh answers in a few seconds). */
function findNearest(ctx: Ctx, service: string, t: Speak): CommandAnswer {
  const settings = ctx.store.state.settings;
  const filters: Record<string, unknown> = { ...SERVICES[service], type: { value: STATION_TYPES } };
  if (settings.largePadOnly) filters.has_large_pad = { value: ["true"] };
  const later = runFinder(
    { key: `hailport:${service}`, type: "stations", title: service, filters, size: 3 },
    referenceOf(ctx),
    settings,
  ).then(
    (result) => {
      const [first] = result.rows;
      if (!first) return { say: t("hailport.nothingNearby", { distance: settings.maxDistance }) };
      const [station] = first.title.split(" | ");
      return {
        say: t("hailport.nearestFound", { station, system: first.system, distance: fmtLy(first.distance) }),
        data: {
          results: result.rows.map((row) => ({
            station: row.title.split(" | ")[0],
            system: row.system,
            distance_ly: Math.round((row.distance ?? 0) * 10) / 10,
          })),
        },
      };
    },
    () => ({ say: t("hailport.searchFailed") }),
  );
  return { ok: true, say: t("hailport.searching"), later };
}

/** How many of a material the commander has (ship materials and Odyssey items). */
function materialCount(ctx: Ctx, typed: string, language: string, t: Speak): CommandAnswer {
  const materials = ctx.game.data.materials;
  const { name, suggestions } = resolveGameName(
    typed,
    materials.map((m) => m.name),
  );
  if (!name)
    return {
      ok: false,
      error: {
        code: "not_found",
        message: suggestions.length
          ? t("hailport.materialAmbiguous", {
              names: suggestions
                .slice(0, 4)
                .map((n) => gameNameIn(language, n))
                .join(", "),
            })
          : t("hailport.materialUnknown", { name: typed }),
      },
    };
  const material = materials.find((m) => m.name === name)!;
  const { cmdr } = ctx.store.state;
  const count = (material.ledger === "ship" ? cmdr.materials : cmdr.locker)[material.id] ?? 0;
  const shown = gameNameIn(language, material.name);
  return { ok: true, say: t("hailport.materialCount", { count, name: shown }), data: { material: shown, count } };
}

/** The missions in progress: how many, how many end within the hour, the next one to end. */
function missionsSummary(ctx: Ctx, t: Speak): CommandAnswer {
  const { activity } = ctx.store.state;
  const now = Date.now();
  const active = Object.values(activity.missions).filter((m) => !activity.finished[m.id]);
  if (!active.length) return { ok: true, say: t("hailport.noMissions"), data: { missions: 0 } };
  const ending = active
    .filter((m) => m.expiry && Date.parse(m.expiry) > now)
    .sort((a, b) => Date.parse(a.expiry!) - Date.parse(b.expiry!));
  const soon = ending.filter((m) => Date.parse(m.expiry!) - now < 3_600_000).length;
  const reward = active.reduce((sum, m) => sum + (m.reward ?? 0), 0);
  return {
    ok: true,
    say: t("hailport.missionsSummary", { count: active.length, soon, reward: reward.toLocaleString() }),
    data: {
      missions: active.length,
      ending_within_an_hour: soon,
      total_reward_cr: reward,
      next_to_end: ending[0] ? { title: ending[0].title, destination: ending[0].destSystem ?? null } : null,
    },
  };
}

/** What the colonisation sites still need, biggest first. */
function colonisationNeeds(ctx: Ctx, t: Speak): CommandAnswer {
  const depots = Object.values(ctx.store.state.activity.depots).filter((d) => !d.complete && !d.failed);
  if (!depots.length) return { ok: true, say: t("hailport.noConstruction") };
  const needs = new Map<string, number>();
  for (const depot of depots)
    for (const r of depot.resources) {
      const left = r.required - r.provided;
      if (left > 0) needs.set(r.label, (needs.get(r.label) ?? 0) + left);
    }
  const biggest = [...needs].sort((a, b) => b[1] - a[1]);
  const total = biggest.reduce((sum, [, left]) => sum + left, 0);
  const top = biggest
    .slice(0, 3)
    .map(([label, left]) => `${left.toLocaleString()} t ${label}`)
    .join(", ");
  return {
    ok: true,
    say: t("hailport.colonisationNeeds", { count: depots.length, total: total.toLocaleString(), top }),
    data: {
      sites: depots.map((d) => ({ station: d.station ?? null, system: d.system ?? null, progress: d.progress })),
      remaining_tonnes: Object.fromEntries(biggest.slice(0, 20)),
    },
  };
}

/** The route's jumps left from `system` (null when no route goes through it). */
export function jumpsLeftFrom(system: string | undefined): number | null {
  const route = navRouteSystems();
  const at = system ? route.indexOf(system) : -1;
  return at < 0 ? null : route.length - 1 - at;
}
