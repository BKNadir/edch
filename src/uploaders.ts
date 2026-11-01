import { log as appLog } from "./logger.js";
// Sends live game data to EDDN, EDSM and Inara (what EDMC does), with each service's rules:
// only live events (never the startup replay), no retry on EDDN 400/426, ≥ 60 s before a retry.

import { httpFetch, readAuxFile } from "./bridge.js";
import {
  EDDN_URL,
  SOFTWARE_NAME,
  SOFTWARE_VERSION,
  commodityMessage,
  fssMessage,
  isBeta,
  journalMessage,
  navrouteMessage,
  outfittingMessage,
  shipyardMessage,
  trackSession,
  type EddnMessage,
  type GameSession,
} from "./eddn.js";

type Json = Record<string, any>;

export interface SyncSettings {
  eddn: boolean;
  edsm: boolean;
  edsmCommander: string;
  edsmKey: string;
  inara: boolean;
  inaraKey: string;
}

export const DEFAULT_SYNC: SyncSettings = { eddn: true, edsm: false, edsmCommander: "", edsmKey: "", inara: false, inaraKey: "" };

export interface SyncLogEntry {
  at: number;
  service: "EDDN" | "EDSM" | "Inara";
  what: string;
  ok: boolean;
  detail?: string;
}

export interface SyncStats {
  sent: Record<string, number>;
  failed: Record<string, number>;
  log: SyncLogEntry[];
}

interface Pending {
  msg: EddnMessage;
  tries: number;
  notBefore: number;
}

export class Uploaders {
  readonly session: GameSession = {};
  readonly stats: SyncStats = { sent: {}, failed: {}, log: [] };
  private eddnQueue: Pending[] = [];
  private lastMarketPayload = new Map<string, string>();
  private edsmPending: Json[] = [];
  private edsmDiscard?: Set<string>;
  private inaraEvents: Json[] = [];
  private inaraMaterials = false;
  private transient: Json = {};
  private timer?: number;

  constructor(
    private settings: () => SyncSettings,
    private journalDir: () => string,
    private materials: () => Record<string, number>,
    private onChange: () => void,
    private fid: () => string | undefined,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.flush(), 10_000);
  }

  private log(service: SyncLogEntry["service"], what: string, ok: boolean, detail?: string) {
    if (ok) appLog.debug(service, `${what}: OK`);
    else appLog.warn(service, `${what}: ${detail ?? "error"}`);
    const key = service;
    if (ok) this.stats.sent[key] = (this.stats.sent[key] ?? 0) + 1;
    else this.stats.failed[key] = (this.stats.failed[key] ?? 0) + 1;
    this.stats.log.unshift({ at: Date.now(), service, what, ok, detail });
    this.stats.log.length = Math.min(this.stats.log.length, 60);
    this.onChange();
  }

  /** Every event goes through here; `live` is false during the startup replay. */
  async handle(ev: Json, live: boolean) {
    const s = this.settings();
    // EDDN: build with the session *before* this event, then track it.
    if (live && s.eddn) {
      try {
        await this.eddnFromEvent(ev);
      } catch (e) {
        this.log("EDDN", ev.event, false, String(e));
      }
    }
    trackSession(this.session, ev);
    this.trackTransient(ev);
    if (live && s.edsm && s.edsmKey && s.edsmCommander) this.queueEdsm(ev);
    if (live && s.inara && s.inaraKey) this.queueInara(ev);
  }

  // ---------------- EDDN ----------------

  private async aux(name: string): Promise<Json | null> {
    const dir = this.journalDir();
    if (!dir) return null;
    try {
      return JSON.parse(await readAuxFile(dir, name));
    } catch {
      return null;
    }
  }

  private async eddnFromEvent(ev: Json) {
    const s = this.session;
    let msg: EddnMessage | null = null;
    switch (ev.event) {
      case "Market": {
        const data = await this.aux("Market.json");
        if (data && data.MarketID === ev.MarketID) msg = commodityMessage(s, data);
        break;
      }
      case "Outfitting": {
        const data = await this.aux("Outfitting.json");
        if (data && data.MarketID === ev.MarketID) msg = outfittingMessage(s, data);
        break;
      }
      case "Shipyard": {
        const data = await this.aux("Shipyard.json");
        if (data && data.MarketID === ev.MarketID) msg = shipyardMessage(s, data);
        break;
      }
      case "NavRoute": {
        const data = await this.aux("NavRoute.json");
        if (data) msg = navrouteMessage(s, data);
        break;
      }
      case "FSSDiscoveryScan":
      case "FSSAllBodiesFound":
        msg = fssMessage(s, ev);
        break;
      default:
        msg = journalMessage(s, ev);
    }
    if (!msg) return;
    // Don't resend an unchanged market/outfitting/shipyard for the same station.
    if (msg.message.marketId) {
      const key = `${msg.$schemaRef}|${msg.message.marketId}`;
      const { timestamp: _t, ...rest } = msg.message;
      const body = JSON.stringify(rest);
      if (this.lastMarketPayload.get(key) === body) return;
      this.lastMarketPayload.set(key, body);
    }
    this.eddnQueue.push({ msg, tries: 0, notBefore: 0 });
    void this.sendEddn();
  }

  private sending = false;
  private async sendEddn() {
    if (this.sending) return;
    this.sending = true;
    try {
      const now = Date.now();
      const ready = this.eddnQueue.filter((p) => p.notBefore <= now);
      for (const p of ready) {
        const schema = p.msg.$schemaRef.replace("https://eddn.edcd.io/schemas/", "");
        const what = `${schema}${p.msg.message.event ? ` · ${p.msg.message.event}` : ""}`;
        let status = 0;
        let detail = "";
        try {
          const reply = await httpFetch("POST", EDDN_URL, JSON.stringify(p.msg));
          status = reply.status;
          detail = reply.body.slice(0, 200);
        } catch (e) {
          detail = String(e);
        }
        if (status === 200) {
          this.eddnQueue = this.eddnQueue.filter((x) => x !== p);
          this.log("EDDN", what, true);
        } else if (status === 400 || status === 426 || p.tries >= 2) {
          // Never retry a rejected message: no data is better than bad data.
          this.eddnQueue = this.eddnQueue.filter((x) => x !== p);
          this.log("EDDN", what, false, `${status || "réseau"} ${detail}`.trim());
        } else {
          p.tries += 1;
          p.notBefore = Date.now() + 90_000;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  // ---------------- EDSM ----------------

  /** Context EDSM wants added to each event (as EDMC does). */
  private trackTransient(ev: Json) {
    const t = this.transient;
    switch (ev.event) {
      case "Location":
      case "FSDJump":
      case "CarrierJump":
        t._systemAddress = ev.SystemAddress;
        t._systemName = ev.StarSystem;
        t._systemCoordinates = ev.StarPos;
        if (ev.event !== "FSDJump" && ev.Docked) {
          t._marketId = ev.MarketID;
          t._stationName = ev.StationName;
        } else {
          delete t._marketId;
          delete t._stationName;
        }
        break;
      case "Docked":
        t._marketId = ev.MarketID;
        t._stationName = ev.StationName;
        break;
      case "Undocked":
        delete t._marketId;
        delete t._stationName;
        break;
      case "LoadGame":
      case "Loadout":
      case "ShipyardSwap":
        if (ev.ShipID !== undefined) t._shipId = ev.ShipID;
        break;
    }
  }

  private queueEdsm(ev: Json) {
    if (this.edsmDiscard?.has(ev.event)) return;
    this.edsmPending.push({ ...ev, ...this.transient });
  }

  private async flushEdsm() {
    const s = this.settings();
    if (!this.edsmPending.length || !s.edsm) return;
    if (!this.edsmDiscard) {
      try {
        const reply = await httpFetch("GET", "https://www.edsm.net/api-journal-v1/discard");
        if (reply.status === 200) {
          const list: string[] = JSON.parse(reply.body);
          this.edsmDiscard = new Set(list.filter((e) => e !== "Docked"));
          this.edsmPending = this.edsmPending.filter((e) => !this.edsmDiscard!.has(e.event));
        } else return;
      } catch {
        return; // try again next flush
      }
    }
    const batch = this.edsmPending.splice(0, 50);
    if (!batch.length) return;
    const form = new URLSearchParams({
      commanderName: s.edsmCommander,
      apiKey: s.edsmKey,
      fromSoftware: SOFTWARE_NAME,
      fromSoftwareVersion: SOFTWARE_VERSION,
      fromGameVersion: this.session.gameversion ?? "",
      fromGameBuild: this.session.gamebuild ?? "",
      message: JSON.stringify(batch),
    });
    try {
      const reply = await httpFetch("POST", "https://www.edsm.net/api-journal-v1", form.toString(), "application/x-www-form-urlencoded");
      const res = JSON.parse(reply.body || "{}");
      const ok = reply.status === 200 && Math.floor(Number(res.msgnum) / 100) === 1;
      this.log("EDSM", `${batch.length} événement(s)`, ok, ok ? undefined : `${res.msgnum ?? reply.status} ${res.msg ?? ""}`);
      // 2xx msgnum = bad credentials or fatal: don't keep hammering.
      if (!ok && Math.floor(Number(res.msgnum) / 100) === 2) this.edsmPending = [];
    } catch (e) {
      this.edsmPending.unshift(...batch);
      this.log("EDSM", `${batch.length} événement(s)`, false, String(e));
    }
  }

  // ---------------- Inara ----------------

  private ship: Json = {};

  private queueInara(ev: Json) {
    const add = (eventName: string, eventData: unknown) => !this.inaraRefused && this.inaraEvents.push({ eventName, eventTimestamp: ev.timestamp, eventData });
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
        add("addCommanderTravelFSDJump", { starsystemName: ev.StarSystem, starsystemCoords: ev.StarPos, jumpDistance: ev.JumpDist, ...ship });
        break;
      case "CarrierJump":
        add("addCommanderTravelCarrierJump", { starsystemName: ev.StarSystem, starsystemCoords: ev.StarPos, stationName: ev.StationName, marketID: ev.MarketID, ...ship });
        break;
      case "Docked":
        add("addCommanderTravelDock", { starsystemName: ev.StarSystem, stationName: ev.StationName, marketID: ev.MarketID, ...ship });
        break;
      case "Location":
        add("setCommanderTravelLocation", { starsystemName: ev.StarSystem, starsystemCoords: ev.StarPos, ...(ev.Docked ? { stationName: ev.StationName, marketID: ev.MarketID } : {}) });
        break;
      case "EngineerProgress": {
        const list: Json[] = Array.isArray(ev.Engineers) ? ev.Engineers : [ev];
        const data = list
          .filter((e) => e.Engineer)
          .map((e) => (e.Rank ? { engineerName: e.Engineer, rankValue: e.Rank } : { engineerName: e.Engineer, rankStage: e.Progress }));
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
        this.inaraMaterials = true; // sent as one full snapshot at the next flush
        break;
    }
  }

  private async flushInara() {
    const s = this.settings();
    if (!s.inara || !s.inaraKey || !this.session.commander || this.inaraRefused) return;
    if (this.inaraMaterials) {
      this.inaraMaterials = false;
      const mats = Object.entries(this.materials()).map(([itemName, itemCount]) => ({ itemName, itemCount }));
      this.inaraEvents.push({ eventName: "setCommanderInventoryMaterials", eventTimestamp: new Date().toISOString().slice(0, 19) + "Z", eventData: mats });
    }
    if (!this.inaraEvents.length) return;
    const events = this.inaraEvents.splice(0, 100);
    const body = {
      header: {
        appName: SOFTWARE_NAME,
        appVersion: SOFTWARE_VERSION,
        isBeingDeveloped: isBeta(this.session),
        APIkey: s.inaraKey,
        commanderName: this.session.commander,
        ...(this.fid() ? { commanderFrontierID: this.fid() } : {}),
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
        this.inaraRefused = true;
        this.inaraEvents = [];
        this.log("Inara", `${events.length} événement(s)`, false, "Inara n'a pas encore autorisé EDCH (validation de l'application en attente). Envoi vers Inara suspendu jusqu'au prochain démarrage.");
        return;
      }
      this.log("Inara", `${events.length} événement(s)`, ok && !bad.length, ok && !bad.length ? undefined : `${status} ${res?.header?.eventStatusText ?? bad[0]?.eventStatusText ?? ""}`);
    } catch (e) {
      this.inaraEvents.unshift(...events);
      this.log("Inara", `${events.length} événement(s)`, false, String(e));
    }
  }

  private async flush() {
    await this.sendEddn();
    await this.flushEdsm();
    // Inara asks for calm sending: every 30 s at most.
    const now = Date.now();
    if (!this.lastInara || now - this.lastInara > 30_000) {
      this.lastInara = now;
      await this.flushInara();
    }
  }
  private lastInara = 0;
  private inaraRefused = false;
}
