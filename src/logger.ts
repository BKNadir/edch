// Application logs (written by the Rust side into the logs folder). Standard lines always;
// DEBUG lines only reach the debug log, which exists while debug mode is on in Settings.

import { isRemote, isTauri, logSetDebug, logWrite } from "./bridge.js";

type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

let debugOn = false;

function write(level: Level, source: string, message: string) {
  if (!isTauri() || isRemote()) return;
  if (level === "DEBUG" && !debugOn) return;
  logWrite(level, source, message).catch(() => undefined);
}

export const log = {
  debug: (source: string, message: string) => write("DEBUG", source, message),
  info: (source: string, message: string) => write("INFO", source, message),
  warn: (source: string, message: string) => write("WARN", source, message),
  error: (source: string, message: string) => write("ERROR", source, message),
  get debugOn() {
    return debugOn;
  },
};

/** Applies the Settings choice; returns the debug log's path while on. */
export async function setDebugLog(on: boolean): Promise<string | null> {
  debugOn = on;
  if (!isTauri() || isRemote()) return null;
  return logSetDebug(on).catch(() => null);
}

/** Uncaught errors always go to the standard log. */
export function captureErrors() {
  window.addEventListener("error", (e) => log.error("ui", `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as Error | string | undefined;
    log.error("ui", `Unhandled promise: ${typeof r === "string" ? r : (r?.stack ?? r?.message ?? String(r))}`);
  });
}

/** Debug detail for the events that matter when testing missions and wings. */
export function eventDetail(ev: Record<string, any>): string | null {
  const e = String(ev.event ?? "");
  const pick = (...keys: string[]) =>
    keys
      .filter((k) => ev[k] !== undefined && ev[k] !== "")
      .map((k) => `${k}=${typeof ev[k] === "object" ? JSON.stringify(ev[k]) : ev[k]}`)
      .join(" ");
  if (e === "CargoDepot") return `${e} ${pick("MissionID", "UpdateType", "CargoType", "Count", "ItemsCollected", "ItemsDelivered", "TotalItemsToDeliver", "EndMarketID")}`;
  if (e === "Missions") return `${e} active=${(ev.Active ?? []).map((m: any) => m.MissionID).join(",")}`;
  if (e.startsWith("Mission")) return `${e} ${pick("MissionID", "Name", "Wing", "Faction", "DestinationSystem", "DestinationStation", "KillCount", "Count", "Expiry")}`;
  if (e.startsWith("Wing")) return `${e} ${pick("Name", "Others")}`;
  if (e === "Bounty" || e === "FactionKillBond") return `${e} ${pick("VictimFaction", "Faction", "AwardingFaction", "TotalReward", "Reward")}`;
  return null;
}
