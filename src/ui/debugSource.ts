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
 * A small badge naming where the information next to it comes from ("Spansh", "Inara",
 * "Journal"…); `details` (the journal event, a limit…) only go in its tooltip. Nothing is drawn
 * without a source.
 */
export function debugSource(
  source: string | undefined | null | false,
  ...details: (string | undefined | null | false)[]
): HTMLElement | null {
  if (!source) return null;
  const extra = details.filter((part): part is string => Boolean(part));
  return h(
    "span.debug-source",
    { "data-no-tr": "", title: t("debug.source", { sources: [source, ...extra].join(" · ") }) },
    source,
  );
}
