// Sending the member's BGS work to the squadron's Discord bot (EDCH-Discord): only when the member
// pasted their key and ticked "Send BGS reports" (Sync page). A minute after a new action or
// arrival, every 15 minutes, and on request,
// the actions since the last report that concern the factions the squadron follows go out, one
// report per faction, with the systems visited where one of them is (features/bgs/report.ts);
// the bot counts an action sent twice once, so a retry is harmless. Then what the squadron's
// members saw comes back (state/bgsShared.ts) for the BGS page.
// This is the only place BGS data leaves the PC in BGS or Invisible mode: the member chose this
// bot, which writes to their squadron's own Discord channel.

import { SOFTWARE_VERSION } from "../../platform/version.js";
import { log } from "../../platform/logger.js";
import { trustBot } from "../../platform/bridge.js";
import { BotError, botFactions, botSystems, readBotKey, sendBotReport } from "../../services/discordBot.js";
import { recordShared } from "../../state/bgsShared.js";
import type { Store } from "../../state/store.js";
import { isHistoryRead } from "../missions/live.js";
import { bgsReport, systemsSeen } from "./report.js";

const EVERY_MS = 15 * 60_000;
/** After an arrival or a BGS action, the report goes this soon (several in a row: one report). */
const SOON_MS = 60_000;
/** The first report goes back this far at most (the journal holds 60 days). */
const FIRST_REPORT_DAYS = 7;
/** Actions per call: the bot accepts up to 2000. */
const CHUNK = 1500;
/** Systems per report: the bot accepts up to 200. */
const MAX_SYSTEMS = 200;
const SENT_KEY = "edch.discord.sent";

/** What the Sync page shows. */
export interface BotSyncStatus {
  state: "off" | "sending" | "ok" | "error";
  /** The factions the squadron follows (its own and allies), the default first, as the bot told. */
  factions?: string[];
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
    const factions = await botFactions(settings.discordKey);
    const now = Date.now();
    const to = new Date(now).toISOString();
    const oldest = new Date(now - FIRST_REPORT_DAYS * 86_400_000).toISOString();
    const last = lastSentFor(id);
    const from = last && last > oldest ? last : oldest;
    let sent = 0;
    // The systems seen go once, with the first faction's report (the bot keeps those where any
    // followed faction is). Only the journal's own visits: never what others shared.
    let systems = systemsSeen(store.state.activity.bgs.observed, factions, from, to).slice(-MAX_SYSTEMS);
    for (const faction of factions) {
      const report = bgsReport(store.state.activity.bgs.actions, faction, from, to, SOFTWARE_VERSION);
      for (let start = 0; start < report.actions.length || systems.length; start += CHUNK) {
        sent += await sendBotReport(settings.discordKey, {
          ...report,
          actions: report.actions.slice(start, start + CHUNK),
          ...(systems.length ? { systems } : {}),
        });
        systems = [];
      }
    }
    // What the squadron saw, for the BGS page (kept between sessions).
    recordShared(await botSystems(settings.discordKey));
    // Only once every faction went out: after a failure, the next try covers the same period.
    setLastSent(id, to);
    Object.assign(botSync, { state: "ok", factions, lastSent: to, lastCount: sent, error: undefined });
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

/**
 * What the journal added for the BGS since the last look: an action, or an arrival somewhere.
 * Compared by count and newest arrival, so redrawing the page for other reasons does nothing.
 */
function bgsMark(store: Store): string {
  const bgs = store.state.activity.bgs;
  let newest = "";
  for (const seen of Object.values(bgs.observed)) if (seen.at > newest) newest = seen.at;
  return `${bgs.actions.length}|${newest}`;
}

/** Starts the reports; called once the journal is read. */
export function startBotSync(store: Store) {
  void trustBot(store.state.settings.sync.discordBot || null).catch(() => undefined);
  // The first report once the journal archive is read (it takes a few seconds at start-up).
  const first = setInterval(() => {
    if (!isHistoryRead()) return;
    clearInterval(first);
    void sendBgsNow(store);
  }, 10_000);
  setInterval(() => void sendBgsNow(store), EVERY_MS);
  // Soon after a new action or arrival, rather than at the next quarter of an hour, so the
  // squadron sees it while it matters.
  let mark = "";
  let soon: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    const settings = store.state.settings.sync;
    if (!isHistoryRead() || !settings.discord || !settings.discordKey) return;
    const next = bgsMark(store);
    if (!mark) mark = next;
    if (next === mark) return;
    mark = next;
    clearTimeout(soon);
    soon = setTimeout(() => void sendBgsNow(store), SOON_MS);
  });
}
