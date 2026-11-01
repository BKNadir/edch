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
