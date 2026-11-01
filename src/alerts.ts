// Problems found while EDCH starts (journal folder missing, local server port taken, unreadable
// history, unexpected error…): shown in a banner, like the update offer, so they aren't missed.

import { isRemote, isTauri, logsOpen } from "./bridge.js";
import { h, icon, replace, toast } from "./dom.js";
import { log } from "./logger.js";
import { notify } from "./notifier.js";
import type { Store } from "./store.js";

interface Alert {
  key: string;
  title: string;
  detail: string;
  action?: { label: string; run: () => void };
}

const alerts: Alert[] = [];
let bar: HTMLElement | null = null;
let store: Store | null = null;
let started = 0;

/** How long after start-up an unexpected error still counts as a start-up problem. */
const STARTUP_MS = 60_000;

export function bindAlerts(s: Store) {
  store = s;
  started = Date.now();
}

export const inStartup = () => Date.now() - started < STARTUP_MS;

/** Shows (or updates) a start-up problem. `key` avoids showing the same problem twice. */
export function startupAlert(key: string, title: string, detail: string, action?: Alert["action"]) {
  if (isRemote()) return;
  const existing = alerts.find((a) => a.key === key);
  if (existing) Object.assign(existing, { title, detail, action });
  else alerts.push({ key, title, detail, action });
  log.warn("startup", `${title}: ${detail}`);
  if (!existing) notify(title, { sound: false });
  render();
}

export function clearAlert(key: string) {
  const i = alerts.findIndex((a) => a.key === key);
  if (i < 0) return;
  alerts.splice(i, 1);
  render();
}

/** Opens a page from an alert's button. */
export const goTo = (view: string, label: string): Alert["action"] => ({ label, run: () => store?.setView(view) });

function render() {
  if (!bar) {
    bar = h("div#alert-bar", { role: "alert" });
    document.body.append(bar);
  }
  if (!alerts.length) {
    bar.classList.remove("show");
    replace(bar);
    return;
  }
  bar.classList.add("show");
  replace(
    bar,
    alerts.map((a) =>
      h(
        "div.alert-item",
        null,
        h("div.alert-text", null, h("strong", null, icon("warn"), " ", h("span", null, a.title)), h("span.sub", null, a.detail)),
        h(
          "div.row",
          null,
          isTauri()
            ? h("button.ghost.small", { onclick: () => logsOpen().catch((e) => toast(String(e))) }, "Logs")
            : null,
          a.action ? h("button.primary.small", { onclick: () => (a.action!.run(), clearAlert(a.key)) }, a.action.label) : null,
          h("button.ghost.small", { title: "Fermer", onclick: () => clearAlert(a.key) }, icon("close")),
        ),
      ),
    ),
  );
}
