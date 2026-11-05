// Sends live game data to EDDN, EDSM and Inara (what EDMC does), with each service's rules:
// only live events (never the start-up replay), no retry on EDDN 400/426, ≥ 60 s before a retry.
// This coordinator feeds every event to the three uploaders, flushes them every 10 s, and keeps
// the counters and log shown on the Sync page.

import { log as appLog } from "../../platform/logger.js";
import { t } from "../../platform/i18n.js";
import type { SyncSettings } from "../../state/syncSettings.js";
import { goTo, inStartup, startupAlert } from "../../ui/alerts.js";
import { trackSession, type GameSession } from "../eddn.js";
import type { Json, SyncLogEntry, SyncStats, UploadContext } from "./common.js";
import { EddnUploader } from "./eddnUploader.js";
import { EdsmUploader } from "./edsmUploader.js";
import { InaraUploader } from "./inaraUploader.js";

export type { SyncLogEntry, SyncStats } from "./common.js";

export class Uploaders {
  readonly session: GameSession = {};
  readonly stats: SyncStats = { sent: {}, failed: {}, log: [] };
  private eddn: EddnUploader;
  private edsm: EdsmUploader;
  private inara: InaraUploader;
  private timer?: number;

  constructor(
    private settings: () => SyncSettings,
    journalDir: () => string,
    materials: () => Record<string, number>,
    private onChange: () => void,
    fid: () => string | undefined,
  ) {
    const ctx: UploadContext = {
      settings,
      journalDir,
      materials,
      fid,
      session: this.session,
      log: (service, what, ok, detail) => this.log(service, what, ok, detail),
    };
    this.eddn = new EddnUploader(ctx);
    this.edsm = new EdsmUploader(ctx);
    this.inara = new InaraUploader(ctx);
  }

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.flush(), 10_000);
  }

  private log(service: SyncLogEntry["service"], what: string, ok: boolean, detail?: string) {
    if (ok) appLog.debug(service, `${what}: OK`);
    else {
      appLog.warn(service, `${what}: ${detail ?? "error"}`);
      // A refused key or a service down right at start-up: say so.
      if (inStartup())
        startupAlert(
          `sync-${service}`,
          t("uploaders.uploadRefused", { service }),
          detail ?? "",
          goTo("sync", t("common.sync")),
        );
    }
    const key = service;
    if (ok) this.stats.sent[key] = (this.stats.sent[key] ?? 0) + 1;
    else this.stats.failed[key] = (this.stats.failed[key] ?? 0) + 1;
    this.stats.log.unshift({ at: Date.now(), service, what, ok, detail });
    this.stats.log.length = Math.min(this.stats.log.length, 60);
    this.onChange();
  }

  /** Every event goes through here; `live` is false during the start-up replay. */
  async handle(ev: Json, live: boolean) {
    const s = this.settings();
    // EDDN: build with the session *before* this event, then track it.
    if (live && s.eddn) {
      try {
        await this.eddn.fromEvent(ev);
      } catch (e) {
        this.log("EDDN", ev.event, false, String(e));
      }
    }
    trackSession(this.session, ev);
    this.edsm.track(ev);
    if (live && s.edsm && s.edsmKey && s.edsmCommander) this.edsm.queue(ev);
    if (live && s.inara && s.inaraKey) this.inara.queue(ev);
  }

  private async flush() {
    await this.eddn.send();
    await this.edsm.flush();
    await this.inara.flush();
  }
}
