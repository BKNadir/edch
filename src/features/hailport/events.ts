// What EDCH tells Hailport: the game events worth announcing (docked, jumps of a route, missions,
// colonisation) and the context the assistant reads to answer questions. Nothing personal: no
// commander name, no wing members, no keys (Hailport may send this to an online model).

import { tIn } from "../../platform/i18n.js";
import type { EventDeclaration } from "../../services/hailport/protocol.js";
import type { Ctx } from "../../state/context.js";
import { nextSystemToEnter } from "../engineers/tour.js";
import { jumpsLeftFrom } from "./commands.js";

type Json = Record<string, any>;

/** A protocol event: its name, details, and the sentence to speak if the user announces it. */
export interface HailportEvent {
  name: string;
  data?: Record<string, unknown>;
  say?: string;
}

/** The events, described in `language`. */
export function hailportEvents(language: string): EventDeclaration[] {
  const t = (key: string) => tIn(language, key);
  return [
    { name: "docked", description: t("hailport.dockedDescription"), announce: true },
    { name: "undocked", description: t("hailport.undockedDescription") },
    { name: "jump_completed", description: t("hailport.jumpCompletedDescription") },
    { name: "route_finished", description: t("hailport.routeFinishedDescription"), announce: true },
    { name: "mission_completed", description: t("hailport.missionCompletedDescription") },
    { name: "mission_expiring", description: t("hailport.missionExpiringDescription"), announce: true },
    { name: "construction_complete", description: t("hailport.constructionCompleteDescription"), announce: true },
  ];
}

/** Journal events (live, already applied to the store) → the events to send, in `language`. */
export function eventsFromJournal(ctx: Ctx, events: Json[], language: string): HailportEvent[] {
  const t = (key: string, variables?: Record<string, unknown>) => tIn(language, key, variables);
  const out: HailportEvent[] = [];
  for (const ev of events) {
    switch (ev.event) {
      case "Docked": {
        const station = String(ev.StationName_Localised ?? ev.StationName ?? "");
        out.push({
          name: "docked",
          data: { station, system: String(ev.StarSystem ?? ""), station_type: String(ev.StationType ?? "") },
          say: t("hailport.dockedAt", { station }),
        });
        break;
      }
      case "Undocked":
        out.push({ name: "undocked", data: { station: String(ev.StationName ?? "") } });
        break;
      case "FSDJump":
      case "CarrierJump": {
        const system = String(ev.StarSystem ?? "");
        const left = jumpsLeftFrom(system);
        if (left === 0)
          out.push({ name: "route_finished", data: { system }, say: t("hailport.routeFinished", { system }) });
        else
          out.push({
            name: "jump_completed",
            data: { system, jumps_left: left },
            say:
              left === null
                ? t("hailport.arrivedIn", { system })
                : t("hailport.jumpsLeft", { system, count: left, next: nextSystemToEnter()?.system ?? "" }),
          });
        break;
      }
      case "MissionCompleted": {
        const title = String(ev.LocalisedName ?? ev.Name ?? "");
        out.push({
          name: "mission_completed",
          data: { title, reward_cr: Number(ev.Reward) || 0 },
          say: t("hailport.missionCompleted", { title }),
        });
        break;
      }
      case "ColonisationConstructionDepot": {
        const depot = ctx.store.state.activity.depots[Number(ev.MarketID)];
        // The journal repeats this event: only the one that finishes the site is told.
        if (ev.ConstructionComplete && depot && !announcedSites.has(depot.marketId)) {
          announcedSites.add(depot.marketId);
          const site = depot.station ?? depot.system ?? "";
          out.push({
            name: "construction_complete",
            data: { site },
            say: t("hailport.constructionComplete", { site }),
          });
        }
        break;
      }
    }
  }
  return out;
}

/** Construction sites already told as complete, this session. */
const announcedSites = new Set<number>();
/** Missions already told as ending soon, this session. */
const announcedEnding = new Set<number>();
/** "Ending soon": less than this before the mission expires. */
const ENDING_SOON_MS = 30 * 60_000;

/** Missions that end within half an hour (each told once), checked every minute or so. */
export function missionsEndingSoon(ctx: Ctx, language: string, now = Date.now()): HailportEvent[] {
  const t = (key: string, variables?: Record<string, unknown>) => tIn(language, key, variables);
  const { activity } = ctx.store.state;
  const out: HailportEvent[] = [];
  for (const mission of Object.values(activity.missions)) {
    if (activity.finished[mission.id] || !mission.expiry || announcedEnding.has(mission.id)) continue;
    const left = Date.parse(mission.expiry) - now;
    if (left <= 0 || left > ENDING_SOON_MS) continue;
    announcedEnding.add(mission.id);
    const minutes = Math.max(1, Math.round(left / 60_000));
    out.push({
      name: "mission_expiring",
      data: { title: mission.title, minutes_left: minutes, destination: mission.destSystem ?? null },
      say: t("hailport.missionEnding", { title: mission.title, count: minutes }),
    });
  }
  return out;
}

/** What the assistant knows of the game right now (small: Hailport takes 4 KB at most). */
export function hailportContext(ctx: Ctx): Record<string, unknown> {
  const { cmdr, activity, settings, game } = ctx.store.state;
  const location = cmdr.location;
  const missions = Object.values(activity.missions).filter((m) => !activity.finished[m.id]);
  const cargo = Object.values(cmdr.cargo).reduce((sum, n) => sum + n, 0);
  const next = nextSystemToEnter();
  return {
    game_running: game === "game",
    system: location?.system ?? null,
    station: location?.docked ? (location.station ?? null) : null,
    docked: Boolean(location?.docked),
    body: location?.body ?? null,
    ship: cmdr.ship ? (cmdr.ship.type ?? null) : null,
    jump_range_ly: cmdr.loadout?.maxJumpRange ? Math.round(cmdr.loadout.maxJumpRange * 100) / 100 : null,
    fuel_t: cmdr.fuel ? Math.round(cmdr.fuel.main * 10) / 10 : null,
    cargo_t: cargo,
    cargo_capacity_t: cmdr.loadout?.cargoCapacity ?? null,
    next_system: next?.system ?? null,
    route_jumps_left: jumpsLeftFrom(location?.system),
    missions_in_progress: missions.length,
    construction_sites: Object.values(activity.depots).filter((d) => !d.complete && !d.failed).length,
    data_sharing: settings.sync.shareMode,
  };
}
