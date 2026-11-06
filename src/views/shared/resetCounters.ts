// The "Reset counters" button of the pages with session counters (Session, Mining, Powerplay).

import { t } from "../../platform/i18n.js";
import { h, icon, toast } from "../../ui/dom.js";

/** A small button that runs `reset` (which zeroes the page's counters), then redraws through `redraw`. */
export function resetCountersButton(reset: () => void, redraw: () => void): HTMLElement {
  return h(
    "button.ghost.small",
    {
      title: t("session.resetCountersHelp"),
      onclick: () => {
        reset();
        redraw();
        toast(t("session.countersReset"));
      },
    },
    icon("close"),
    " " + t("session.resetCounters"),
  );
}
