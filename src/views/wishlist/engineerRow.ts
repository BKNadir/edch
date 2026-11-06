// The engineer line of a wishlist item: the nearest engineer who can do it (click to copy their
// system), and how to unlock them when they are not known yet.

import type { Pick } from "../../features/engineers/engineerPick.js";
import { engineerText } from "../../game/data.js";
import type { Engineer } from "../../game/types.js";
import { t } from "../../platform/i18n.js";
import { fmtLy } from "../../services/spansh.js";
import { h, icon } from "../../ui/dom.js";
import { openSystem } from "../shared/links.js";

/** An engineer's name: copies the system of the workshop. */
export function engineerButton(e: Engineer): HTMLElement {
  return h(
    "button.inline-link.ref-link.eng-link",
    {
      title: t("common.copySSystem", { name: e.name, system: e.system }),
      "data-no-tr": "",
      onclick: () => openSystem(e.system),
    },
    e.name,
  );
}

/** "To unlock" (or "to meet"): a click shows what the game asks for. */
export function unlockBadge(e: Engineer, known: boolean): HTMLElement {
  const how = known
    ? engineerText(e, "unlock") || engineerText(e, "meeting")
    : engineerText(e, "meeting") || engineerText(e, "discovery");
  return h(
    "details.unlock-badge",
    null,
    h("summary.badge.warn", null, known ? t("wishlist.unlock") : t("wishlist.meet")),
    h(
      "div.unlock-how",
      null,
      e.referredBy ? h("p", null, t("common.referredBy", { name: e.referredBy })) : null,
      how ? h("p", null, how) : h("p", null, t("wishlist.seeEngineersPage")),
    ),
  );
}

/** The engineer chosen for a wishlist line, or the red notice when nobody you know can do it. */
export function engineerRow(pick: Pick | undefined, toMeet: Pick | undefined, want: number): HTMLElement {
  if (pick) {
    const e = pick.engineer;
    return h(
      "div.wish-eng",
      null,
      icon("pin"),
      " ",
      engineerButton(e),
      want ? h("span.badge.muted", { title: t("wishlist.highestGradeEngineerCanDo") }, `G${pick.grade}`) : null,
      want && pick.grade < want ? h("span.sub", null, " " + t("wishlist.gNoKnownEngineerDoesAround", { want })) : null,
      h("span.sub", null, ` · ${e.system} — ${e.station}`, pick.dist !== undefined ? ` · ${fmtLy(pick.dist)}` : ""),
      pick.unlocked ? null : unlockBadge(e, Boolean(pick.status)),
    );
  }
  const e = toMeet?.engineer;
  return h(
    "div.wish-eng.alert",
    null,
    icon("warn"),
    " " + t("wishlist.noKnownEngineerModuleUnlock"),
    e
      ? [
          h("span.sub", null, " " + t("wishlist.nearest") + " "),
          engineerButton(e),
          h("span.sub", null, ` · ${e.system}${toMeet!.dist !== undefined ? ` · ${fmtLy(toMeet!.dist)}` : ""}`),
          unlockBadge(e, false),
        ]
      : null,
  );
}
