// Application logs (written by the Rust side into the logs folder). Standard lines always;
// DEBUG lines only reach the debug log, which exists while debug mode is on in Settings.

import { isRemote, isTauri, logSetDebug, logWrite, setCallLogging } from "./bridge.js";
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
  setCallLogging(on);
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
  if (e === "CargoDepot")
    return `${e} ${pick("MissionID", "UpdateType", "CargoType", "Count", "ItemsCollected", "ItemsDelivered", "TotalItemsToDeliver", "EndMarketID")}`;
  if (e === "Missions") return `${e} active=${(ev.Active ?? []).map((m: any) => m.MissionID).join(",")}`;
  if (e.startsWith("Mission"))
    return `${e} ${pick("MissionID", "Name", "Wing", "Faction", "DestinationSystem", "DestinationStation", "KillCount", "Count", "Expiry")}`;
  if (e.startsWith("Wing")) return `${e} ${pick("Name", "Others")}`;
  if (e === "Docked" || e === "Market") return `${e} ${pick("StationName", "StationType", "MarketID", "StarSystem")}`;
  if (e === "MarketBuy" || e === "MarketSell")
    return `${e} ${pick("MarketID", "Type", "Count", "BuyPrice", "SellPrice")}`;
  if (e === "CargoTransfer") return `${e} ${JSON.stringify(ev.Transfers ?? [])}`;
  if (e === "CarrierStats")
    return `${e} ${pick("CarrierID", "CarrierType", "Callsign")} cargo=${ev.SpaceUsage?.Cargo ?? "?"}`;
  if (e.startsWith("Colonisation")) return `${e} ${pick("MarketID", "ConstructionProgress")}`;
  if (e === "Bounty" || e === "FactionKillBond")
    return `${e} ${pick("VictimFaction", "Faction", "AwardingFaction", "TotalReward", "Reward")}`;
  return null;
}

// ---------------- what the user does, what the user is shown ----------------

const clean = (raw: string | null | undefined) => (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

/** A readable name for a control: its text, label, title or placeholder. */
function controlName(el: Element): string {
  const own = clean((el as HTMLElement).innerText);
  if (own) return own;
  const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
  return (
    clean(label?.textContent) ||
    clean(el.getAttribute("aria-label")) ||
    clean(el.getAttribute("title")) ||
    clean(el.getAttribute("placeholder")) ||
    clean(el.getAttribute("name")) ||
    el.tagName.toLowerCase()
  );
}

const view = () => {
  try {
    return localStorage.getItem("edc.view") ?? "";
  } catch {
    return "";
  }
};

/**
 * Debug mode: every click and every setting change is logged (what was clicked, on which page).
 * Typed text is never logged, only that a field was edited: it can be an API key.
 */
export function captureActions() {
  document.addEventListener(
    "click",
    (e) => {
      if (!debugOn) return;
      const el = (e.target as Element | null)?.closest("button, a, [role=button], summary, .chip, .mat, tr[data-id]");
      if (!el) return;
      log.debug("action", `[${view()}] click "${controlName(el)}"`);
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      if (!debugOn) return;
      const el = e.target as HTMLInputElement | HTMLSelectElement | null;
      if (!el || !("value" in el)) return;
      const name = controlName(el);
      let value: string;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio"))
        value = el.checked ? "on" : "off";
      else if (
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLInputElement && ["number", "range", "color"].includes(el.type))
      )
        value = el.value;
      else value = "(edited)";
      log.debug("action", `[${view()}] set "${name}" = ${value}`);
    },
    true,
  );
}

/**
 * Errors shown on screen (red lines, red callouts, warning badges, toasts) also go to the logs:
 * a user who reports "it showed an error" then has it in the error log.
 */
export function captureShownErrors(root: HTMLElement = document.body) {
  const recent = new Map<string, number>();
  const report = (level: "WARN" | "INFO", source: string, text: string) => {
    const cleaned = clean(text);
    if (!cleaned) return;
    const now = Date.now();
    if ((recent.get(cleaned) ?? 0) > now - 10_000) return;
    recent.set(cleaned, now);
    if (recent.size > 200) recent.clear();
    write(level, source, `[${view()}] ${cleaned}`);
  };
  const scan = (node: Node) => {
    if (!(node instanceof Element)) return;
    const hits = node.matches(".error, .callout.danger, .badge.warn")
      ? [node]
      : [...node.querySelectorAll(".error, .callout.danger, .badge.warn")];
    for (const el of hits) report("WARN", "shown", el.textContent ?? "");
    if (node.id === "toast" || node.closest?.("#toast")) report("INFO", "toast", node.textContent ?? "");
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData" || (r.target as Element).id === "toast") {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        if (el?.closest("#toast")) report("INFO", "toast", el.closest("#toast")!.textContent ?? "");
      }
      r.addedNodes.forEach(scan);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
