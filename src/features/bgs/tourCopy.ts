// The BGS refresh tour as a route: once a system of the tour is clicked (copied), arriving there
// copies the next one, and going back to the game copies the one you are heading to, like the
// engineer tour and the Navigation route (the same two settings: navAutoCopy, copyOnGameFocus).
// Kept in memory only: a tour isn't "in progress" after a restart.

import { copyText } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import type { Store } from "../../state/store.js";
import { toast } from "../../ui/dom.js";
import { notify } from "../../ui/notifier.js";

/** The tour's systems in visiting order, as the BGS page last drew them. */
let stops: string[] = [];
/** The system you are heading to, once the tour is started (null: no tour in progress). */
let target: string | null = null;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The BGS page's current tour (a stop whose data got fresh drops out of it). */
export function setBgsTourStops(systems: string[]) {
  stops = systems;
}

/** A system of the tour was clicked: the tour is in progress, heading there. */
export function startBgsTour(system: string) {
  target = system;
}

/** The system to copy when you go back to the game, while the tour is in progress. */
export function bgsTourTarget(): { system: string; label: string } | null {
  return target ? { system: target, label: t("bgs.tourNextCopied", { system: target }) } : null;
}

/** The stop after `system`: the next one in the order, else the first other one left. */
function stopAfter(system: string): string | null {
  const at = stops.findIndex((s) => same(s, system));
  const rest = at >= 0 ? [...stops.slice(at + 1), ...stops.slice(0, at)] : stops;
  return rest.find((s) => !same(s, system)) ?? null;
}

/** A live arrival (FSDJump, CarrierJump): at the tour's target, the next stop is copied. */
export function bgsTourArrival(store: Store, system: string) {
  if (!target || !same(target, system)) return;
  const next = stopAfter(system);
  target = next;
  const settings = store.state.settings;
  if (!next) {
    toast(t("bgs.tourDone"));
    return;
  }
  if (!settings.navAutoCopy) return;
  const label = t("bgs.tourNextCopied", { system: next });
  void copyText(next).then((ok) => {
    if (!ok) return;
    toast(label);
    if (settings.navNotifyCopy) notify(label, { sound: true });
  });
}
