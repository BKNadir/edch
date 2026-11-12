// EDSM: live journal events (except those EDSM says to discard), each with the context EDSM
// wants (system, station, ship), sent in batches of 50 with the commander's API key.

import { httpFetch } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "../../platform/version.js";
import type { Json, UploadContext } from "./common.js";

export class EdsmUploader {
  private pending: Json[] = [];
  /** Events EDSM doesn't want (asked once). */
  private discard?: Set<string>;
  /** Context added to each event (as EDMC does). */
  private transient: Json = {};

  constructor(private ctx: UploadContext) {}

  /** Follows the current system, station and ship (every event, replay included). */
  track(ev: Json) {
    const transient = this.transient;
    switch (ev.event) {
      case "Location":
      case "FSDJump":
      case "CarrierJump":
        transient._systemAddress = ev.SystemAddress;
        transient._systemName = ev.StarSystem;
        transient._systemCoordinates = ev.StarPos;
        if (ev.event !== "FSDJump" && ev.Docked) {
          transient._marketId = ev.MarketID;
          transient._stationName = ev.StationName;
        } else {
          delete transient._marketId;
          delete transient._stationName;
        }
        break;
      case "Docked":
        transient._marketId = ev.MarketID;
        transient._stationName = ev.StationName;
        break;
      case "Undocked":
        delete transient._marketId;
        delete transient._stationName;
        break;
      case "LoadGame":
      case "Loadout":
      case "ShipyardSwap":
        if (ev.ShipID !== undefined) transient._shipId = ev.ShipID;
        break;
    }
  }

  /** Forgets the events waiting to be sent (the share mode changed). */
  clear() {
    this.pending = [];
  }

  queue(ev: Json) {
    if (this.discard?.has(ev.event)) return;
    this.pending.push({ ...ev, ...this.transient });
  }

  async flush() {
    const s = this.ctx.settings();
    if (!this.pending.length || !s.edsm) return;
    if (!this.discard) {
      try {
        const reply = await httpFetch("GET", "https://www.edsm.net/api-journal-v1/discard");
        if (reply.status === 200) {
          const list: string[] = JSON.parse(reply.body);
          this.discard = new Set(list.filter((e) => e !== "Docked"));
          this.pending = this.pending.filter((e) => !this.discard!.has(e.event));
        } else return;
      } catch {
        return; // try again next flush
      }
    }
    const batch = this.pending.splice(0, 50);
    if (!batch.length) return;
    const form = new URLSearchParams({
      commanderName: s.edsmCommander,
      apiKey: s.edsmKey,
      fromSoftware: SOFTWARE_NAME,
      fromSoftwareVersion: SOFTWARE_VERSION,
      fromGameVersion: this.ctx.session.gameversion ?? "",
      fromGameBuild: this.ctx.session.gamebuild ?? "",
      message: JSON.stringify(batch),
    });
    try {
      const reply = await httpFetch(
        "POST",
        "https://www.edsm.net/api-journal-v1",
        form.toString(),
        "application/x-www-form-urlencoded",
      );
      const res = JSON.parse(reply.body || "{}");
      const ok = reply.status === 200 && Math.floor(Number(res.msgnum) / 100) === 1;
      this.ctx.log(
        "EDSM",
        t("uploaders.events", { count: batch.length }),
        ok,
        ok ? undefined : `${res.msgnum ?? reply.status} ${res.msg ?? ""}`,
      );
      // 2xx msgnum = bad credentials or fatal: don't keep hammering.
      if (!ok && Math.floor(Number(res.msgnum) / 100) === 2) this.pending = [];
    } catch (e) {
      this.pending.unshift(...batch);
      this.ctx.log("EDSM", t("uploaders.events", { count: batch.length }), false, String(e));
    }
  }
}
