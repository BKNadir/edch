// Sending the member's BGS work to the squadron's Discord bot (EDCH-Discord): only when the member
// pasted their key and ticked "Send BGS reports" (Sync page). Every 15 minutes, and on request,
// the actions since the last report that concern the squadron's faction go out (features/bgs/
// report.ts); the bot counts an action sent twice once, so a retry is harmless.
// This is the only place BGS data leaves the PC in BGS or Invisible mode: the member chose this
// bot, which writes to their squadron's own Discord channel.

import { SOFTWARE_VERSION } from "../../platform/version.js";
import { log } from "../../platform/logger.js";
import { trustBot } from "../../platform/bridge.js";
import { BotError, botFaction, readBotKey, sendBotReport } from "../../services/discordBot.js";
import type { Store } from "../../state/store.js";
import { isHistoryRead } from "../missions/live.js";
import { bgsReport } from "./report.js";

const EVERY_MS = 15 * 60_000;
/** The first report goes back this far at most (the journal holds 60 days). */
const FIRST_REPORT_DAYS = 7;
/** Actions per call: the bot accepts up to 2000. */
const CHUNK = 1500;
const SENT_KEY = "edch.discord.sent";

/** What the Sync page shows. */
export interface BotSyncStatus {
  state: "off" | "sending" | "ok" | "error";
  /** The squadron's faction, as the bot told. */
  faction?: string;
  /** When the last report went out. */
  lastSent?: string;
  /** Actions sent by the last report. */
  lastCount?: number;
  /** The bot's refusal or "unavailable" (translated as `discordError.<code>`). */
  error?: string;
}

export const botSync: BotSyncStatus = { state: "off" };

/** When the last report for this member and server ended (per key's server and member). */
function lastSentFor(id: string): string | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}");
    return typeof all[id] === "string" && Number.isFinite(Date.parse(all[id])) ? all[id] : undefined;
  } catch {
    return undefined;
  }
}

function setLastSent(id: string, at: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}");
    all[id] = at;
    localStorage.setItem(SENT_KEY, JSON.stringify(all));
  } catch {
    // Not saved: the next report starts further back, the bot skips what it already has.
  }
}

let running = false;

/** Sends what is new now (does nothing when the option is off). */
export async function sendBgsNow(store: Store): Promise<void> {
  const settings = store.state.settings.sync;
  if (!settings.discord || !settings.discordKey) {
    Object.assign(botSync, { state: "off", error: undefined });
    return;
  }
  // Not before the journal archive is read: the report would miss actions and skip them for good.
  if (running || !isHistoryRead()) return;
  const claims = readBotKey(settings.discordKey);
  if (!claims) {
    Object.assign(botSync, { state: "error", error: "badKey" });
    store.notify();
    return;
  }
  running = true;
  Object.assign(botSync, { state: "sending" });
  store.notify();
  const id = `${claims.guildId}:${claims.userId}`;
  try {
    const faction = await botFaction(settings.discordKey);
    const now = Date.now();
    const to = new Date(now).toISOString();
    const oldest = new Date(now - FIRST_REPORT_DAYS * 86_400_000).toISOString();
    const last = lastSentFor(id);
    const from = last && last > oldest ? last : oldest;
    const report = bgsReport(store.state.activity.bgs.actions, faction, from, to, SOFTWARE_VERSION);
    let sent = 0;
    for (let start = 0; start < report.actions.length; start += CHUNK)
      sent += await sendBotReport(settings.discordKey, {
        ...report,
        actions: report.actions.slice(start, start + CHUNK),
      });
    setLastSent(id, to);
    Object.assign(botSync, { state: "ok", faction, lastSent: to, lastCount: sent, error: undefined });
    if (sent) log.info("discord", `BGS report sent: ${sent} actions`);
  } catch (error) {
    const code = error instanceof BotError ? error.code : "unavailable";
    Object.assign(botSync, { state: "error", error: code });
    log.warn("discord", `BGS report not sent: ${code}`);
  } finally {
    running = false;
    store.notify();
  }
}

/** Starts the periodic reports; called once the journal is read. */
export function startBotSync(store: Store) {
  void trustBot(store.state.settings.sync.discordBot || null).catch(() => undefined);
  // The first report once the journal archive is read (it takes a few seconds at start-up).
  const first = setInterval(() => {
    if (!isHistoryRead()) return;
    clearInterval(first);
    void sendBgsNow(store);
  }, 10_000);
  setInterval(() => void sendBgsNow(store), EVERY_MS);
}
