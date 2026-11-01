// Clickable references: a system, a module or an item mentioned anywhere opens the page that
// deals with it. A system is also copied to the clipboard (and to the PC's clipboard when the
// click comes from a phone), ready to paste in the galaxy map.

import { copyText, isRemote } from "./bridge.js";
import { h, icon, toast } from "./dom.js";
import { gameEnglish, gameName } from "./i18n.js";
import { log } from "./logger.js";
import type { Store } from "./store.js";
import { focusModule } from "./views/engineering.js";
import { setDestination } from "./views/navigation.js";
import { presetSearch } from "./views/search.js";

let store: Store | null = null;
export function bindLinks(s: Store) {
  store = s;
}

/** Copies on the PC, where the game runs (from a phone, only the PC's clipboard is used). */
export async function copyEverywhere(text: string): Promise<boolean> {
  return copyText(text);
}

/**
 * A system was clicked: copy its name and, when chosen in Settings, open Navigation with it as
 * the destination. `navigate: false` for the system you are in (a route to it makes no sense).
 */
export async function openSystem(system: string, opts: { navigate?: boolean } = {}) {
  const ok = await copyEverywhere(system);
  const toNav = (opts.navigate ?? true) && Boolean(store?.state.settings.systemOpensNav);
  log.debug("link", `system "${system}"${toNav ? " → navigation" : ""}`);
  toast(ok ? (isRemote() ? `« ${system} » copié sur le PC — colle-le dans la carte galactique` : `« ${system} » copié — colle-le dans la carte galactique`) : isRemote() ? "PC injoignable : rien n'a été copié" : "Copie impossible");
  if (toNav && store) {
    setDestination(system);
    store.setView("navigation");
  }
}

/** A module was clicked: open Engineering on its modifications. */
export function openModule(module: string) {
  if (!store) return;
  log.debug("link", `module "${module}"`);
  focusModule(gameEnglish(module));
  store.setView("engineering");
}

/** A commodity was clicked: search where to buy it. */
export function openCommodity(name: string) {
  if (!store) return;
  log.debug("link", `commodity "${name}"`);
  presetSearch("buy", gameEnglish(name));
  store.setView("search");
}

/** A material was clicked: its detail panel (where to find it, what uses it). */
export function openMaterial(id: string) {
  if (!store) return;
  log.debug("link", `material ${id}`);
  store.select(id);
}

export const systemLink = (name?: string, opts: { navigate?: boolean; title?: string; text?: string } = {}) =>
  name ? h("button.sys", { title: opts.title ?? `Copier « ${name} »`, onclick: () => openSystem(name, opts) }, icon("copy"), h("span", null, opts.text ?? name)) : null;

export const moduleLink = (module: string, label = gameName(module)) =>
  h("button.inline-link.ref-link", { title: "Voir les modifications de ce module", onclick: (e: Event) => (e.stopPropagation(), openModule(module)) }, label);

export const commodityLink = (name: string, label = gameName(name)) =>
  h("button.inline-link.ref-link", { title: "Où l'acheter", onclick: (e: Event) => (e.stopPropagation(), openCommodity(name)) }, label);
