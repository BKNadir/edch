// Where a piece of information comes from (Spansh, Ardent, EDSM, the game's journal…), for the
// debug mode only: a small label in a colour of its own (--debug, picked to stand out from the
// theme's colours). It is always drawn but hidden by the stylesheet until debug mode is on, so
// turning debug mode on or off shows or hides every label at once, and the pages stay simple for
// everyone else.

import { t } from "../platform/i18n.js";
import { h } from "./dom.js";

/** Shows or hides every source label (Settings → Advanced → debug mode). */
export function setDebugSources(on: boolean) {
  document.documentElement.classList.toggle("debug-sources", on);
}

/** The game's journal, as a source. */
export const journalSource = () => t("debug.journal");

/**
 * A label naming where the information next to it comes from ("source: Spansh · 3 h ago"); empty
 * parts are left out, and nothing is drawn without any.
 */
export function debugSource(...parts: (string | undefined | null | false)[]): HTMLElement | null {
  const shown = parts.filter((part): part is string => Boolean(part));
  if (!shown.length) return null;
  return h("span.debug-source", { "data-no-tr": "" }, t("debug.source", { sources: shown.join(" · ") }));
}
