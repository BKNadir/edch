// Inara: travel, ship, engineer ranks and the materials inventory, as Inara API events, sent at
// most every 30 s. Inara only accepts whitelisted applications: when it refuses EDCH, sending stops
// for the session.

import { httpFetch } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "../../platform/version.js";
import { isBeta } from "../eddn.js";
import type { Json, UploadContext } from "./common.js";

export class InaraUploader {
  private events: Json[] = [];
  /** The materials changed: send a full inventory snapshot at the next flush. */
  private materialsChanged = false;
  private ship: Json = {};
  private refused = false;
  private lastSent = 0;

  constructor(private ctx: UploadContext) {}

  queue(ev: Json) {
    const add = (eventName: string, eventData: unknown) =>
      !this.refused && this.events.push({ eventName, eventTimestamp: ev.timestamp, eventData });
    const ship = { shipType: this.ship.type, shipGameID: this.ship.id };
    switch (ev.event) {
      case "LoadGame":
      case "Loadout":
        this.ship = { type: ev.Ship, id: ev.ShipID };
        if (ev.event === "Loadout") {
          add("setCommanderShip", {
            shipType: ev.Ship,
            shipGameID: ev.ShipID,
            shipName: ev.ShipName,
            shipIdent: ev.ShipIdent,
            isCurrentShip: true,
            shipMaxJumpRange: ev.MaxJumpRange,
            shipCargoCapacity: ev.CargoCapacity,
            shipHullValue: ev.HullValue,
            shipModulesValue: ev.ModulesValue,
            shipRebuyCost: ev.Rebuy,
          });
        }
        break;
      case "FSDJump":
        add("addCommanderTravelFSDJump", {
          starsystemName: ev.StarSystem,
          starsystemCoords: ev.StarPos,
          jumpDistance: ev.JumpDist,
          ...ship,
        });
        break;
      case "CarrierJump":
        add("addCommanderTravelCarrierJump", {
          starsystemName: ev.StarSystem,
          starsystemCoords: ev.StarPos,
          stationName: ev.StationName,
          marketID: ev.MarketID,
          ...ship,
        });
        break;
      case "Docked":
        add("addCommanderTravelDock", {
          starsystemName: ev.StarSystem,
          stationName: ev.StationName,
          marketID: ev.MarketID,
          ...ship,
        });
        break;
      case "Location":
        add("setCommanderTravelLocation", {
          starsystemName: ev.StarSystem,
          starsystemCoords: ev.StarPos,
          ...(ev.Docked ? { stationName: ev.StationName, marketID: ev.MarketID } : {}),
        });
        break;
      case "EngineerProgress": {
        const list: Json[] = Array.isArray(ev.Engineers) ? ev.Engineers : [ev];
        const data = list
          .filter((e) => e.Engineer)
          .map((e) =>
            e.Rank
              ? { engineerName: e.Engineer, rankValue: e.Rank }
              : { engineerName: e.Engineer, rankStage: e.Progress },
          );
        if (data.length) add("setCommanderRankEngineer", data);
        break;
      }
      case "Materials":
      case "MaterialCollected":
      case "MaterialDiscarded":
      case "MaterialTrade":
      case "EngineerCraft":
      case "Synthesis":
      case "TechnologyBroker":
      case "MissionCompleted":
        this.materialsChanged = true; // sent as one full snapshot at the next flush
        break;
    }
  }

  /** Sends what is queued, if the last send was more than 30 s ago. */
  async flush() {
    const now = Date.now();
    if (this.lastSent && now - this.lastSent <= 30_000) return;
    this.lastSent = now;
    const s = this.ctx.settings();
    if (!s.inara || !s.inaraKey || !this.ctx.session.commander || this.refused) return;
    if (this.materialsChanged) {
      this.materialsChanged = false;
      const mats = Object.entries(this.ctx.materials()).map(([itemName, itemCount]) => ({ itemName, itemCount }));
      this.events.push({
        eventName: "setCommanderInventoryMaterials",
        eventTimestamp: new Date().toISOString().slice(0, 19) + "Z",
        eventData: mats,
      });
    }
    if (!this.events.length) return;
    const events = this.events.splice(0, 100);
    const body = {
      header: {
        appName: SOFTWARE_NAME,
        appVersion: SOFTWARE_VERSION,
        isBeingDeveloped: isBeta(this.ctx.session),
        APIkey: s.inaraKey,
        commanderName: this.ctx.session.commander,
        ...(this.ctx.fid() ? { commanderFrontierID: this.ctx.fid() } : {}),
      },
      events,
    };
    try {
      const reply = await httpFetch("POST", "https://inara.cz/inapi/v1/", JSON.stringify(body));
      const res = JSON.parse(reply.body || "{}");
      const status = Number(res?.header?.eventStatus ?? reply.status);
      const ok = status === 200 || status === 204;
      const bad = (res.events ?? []).filter((e: Json) => Number(e.eventStatus) >= 300);
      // Inara only accepts applications it has whitelisted: until EDCH is, every request is
      // refused. Stop for this session instead of piling up errors on Inara's side.
      if (status === 400 && /no access allowed/i.test(String(res?.header?.eventStatusText ?? ""))) {
        this.refused = true;
        this.events = [];
        this.ctx.log(
          "Inara",
          t("uploaders.events", { count: events.length }),
          false,
          t("uploaders.inaraHasnTAuthorisedEdchYet"),
        );
        return;
      }
      this.ctx.log(
        "Inara",
        t("uploaders.events", { count: events.length }),
        ok && !bad.length,
        ok && !bad.length ? undefined : `${status} ${res?.header?.eventStatusText ?? bad[0]?.eventStatusText ?? ""}`,
      );
    } catch (e) {
      this.events.unshift(...events);
      this.ctx.log("Inara", t("uploaders.events", { count: events.length }), false, String(e));
    }
  }
}
