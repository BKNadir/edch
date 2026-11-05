// EDDN, the community data network: journal events, market, outfitting, shipyard and route data
// turned into EDDN messages (services/eddn.ts) and sent in order. A rejected message (400, 426)
// is never retried; other failures are retried twice, 90 s apart.

import { httpFetch, readAuxFile } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import {
  commodityMessage,
  EDDN_URL,
  fssMessage,
  journalMessage,
  navrouteMessage,
  outfittingMessage,
  shipyardMessage,
  type EddnMessage,
} from "../eddn.js";
import type { Json, UploadContext } from "./common.js";

interface Pending {
  msg: EddnMessage;
  tries: number;
  notBefore: number;
}

export class EddnUploader {
  private queue: Pending[] = [];
  /** Last market / outfitting / shipyard sent per station: an unchanged one isn't sent again. */
  private lastMarketPayload = new Map<string, string>();
  private sending = false;

  constructor(private ctx: UploadContext) {}

  /** A companion file of the journal folder (Market.json…), or null. */
  private async companionFile(name: string): Promise<Json | null> {
    const dir = this.ctx.journalDir();
    if (!dir) return null;
    try {
      return JSON.parse(await readAuxFile(dir, name));
    } catch {
      return null;
    }
  }

  /** Builds the message for a live event (with the session before this event) and queues it. */
  async fromEvent(ev: Json) {
    const s = this.ctx.session;
    let msg: EddnMessage | null = null;
    switch (ev.event) {
      case "Market": {
        const data = await this.companionFile("Market.json");
        if (data && data.MarketID === ev.MarketID) msg = commodityMessage(s, data);
        break;
      }
      case "Outfitting": {
        const data = await this.companionFile("Outfitting.json");
        if (data && data.MarketID === ev.MarketID) msg = outfittingMessage(s, data);
        break;
      }
      case "Shipyard": {
        const data = await this.companionFile("Shipyard.json");
        if (data && data.MarketID === ev.MarketID) msg = shipyardMessage(s, data);
        break;
      }
      case "NavRoute": {
        const data = await this.companionFile("NavRoute.json");
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
    this.queue.push({ msg, tries: 0, notBefore: 0 });
    void this.send();
  }

  /** Sends the queued messages that are due. */
  async send() {
    if (this.sending) return;
    this.sending = true;
    try {
      const now = Date.now();
      const ready = this.queue.filter((p) => p.notBefore <= now);
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
          this.queue = this.queue.filter((x) => x !== p);
          this.ctx.log("EDDN", what, true);
        } else if (status === 400 || status === 426 || p.tries >= 2) {
          // Never retry a rejected message: no data is better than bad data.
          this.queue = this.queue.filter((x) => x !== p);
          this.ctx.log("EDDN", what, false, `${status || t("uploaders.network")} ${detail}`.trim());
        } else {
          p.tries += 1;
          p.notBefore = Date.now() + 90_000;
        }
      }
    } finally {
      this.sending = false;
    }
  }
}
