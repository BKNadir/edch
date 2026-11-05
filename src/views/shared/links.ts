// Clickable references: a system, a module or an item mentioned anywhere opens the page that
// deals with it. A system is also copied to the clipboard (and to the PC's clipboard when the
// click comes from a phone), ready to paste in the galaxy map.

import { copyText, isRemote } from "../../platform/bridge.js";
import { h, icon, toast } from "../../ui/dom.js";
import { gameEnglish, gameName, t } from "../../platform/i18n.js";
import { log } from "../../platform/logger.js";
import type { Store } from "../../state/store.js";
import { focusModule } from "../engineering/index.js";
import { setDestination } from "../navigation/index.js";
import { presetSearch } from "../search/index.js";

let store: Store | null = null;
/** Engineer → the system of their workshop. */
const engineerSystems = new Map<string, string>();
export function bindLinks(s: Store, engineers: { name: string; system: string }[] = []) {
  store = s;
  for (const e of engineers) engineerSystems.set(e.name, e.system);
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
  toast(ok ? (isRemote() ? t("links.copiedPcPasteGalaxyMap", { system }) : t("links.copiedPasteGalaxyMap", { system })) : isRemote() ? t("links.pcUnreachableNothingWasCopied") : t("common.couldnTCopy"));
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
  name ? h("button.sys", { title: opts.title ?? t("common.copy", { name }), onclick: () => openSystem(name, opts) }, icon("copy"), h("span", null, opts.text ?? name)) : null;

/** An engineer was clicked: copy the system of their workshop (like a system link). */
export function openEngineer(name: string) {
  const system = engineerSystems.get(name);
  log.debug("link", `engineer "${name}"`);
  if (system) void openSystem(system);
}

/** An engineer's name that copies their system when clicked. */
export const engineerLink = (name: string) => {
  const system = engineerSystems.get(name);
  return system
    ? h("button.inline-link.ref-link", { title: t("common.copySSystem", { name, system }), "data-no-tr": "", onclick: (e: Event) => (e.stopPropagation(), openEngineer(name)) }, name)
    : h("span", { "data-no-tr": "" }, name);
};

/** Several engineers, comma separated, each clickable. */
export const engineerLinks = (names: string[]) => names.flatMap((n, i) => [i ? ", " : "", engineerLink(n)]);

export const moduleLink = (module: string, label = gameName(module)) =>
  h("button.inline-link.ref-link", { title: t("links.seeModuleSModifications"), onclick: (e: Event) => (e.stopPropagation(), openModule(module)) }, label);

export const commodityLink = (name: string, label = gameName(name)) =>
  h("button.inline-link.ref-link", { title: t("common.whereBuy"), onclick: (e: Event) => (e.stopPropagation(), openCommodity(name)) }, label);
