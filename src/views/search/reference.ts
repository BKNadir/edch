// The Search page's reference system: your position by default, or a system you type (to plan from
// somewhere else). Kept while the app runs, for every tab of the page.

import { t } from "../../platform/i18n.js";
import { referenceOf, type Ctx } from "../../state/context.js";
import type { Reference } from "../../services/spansh.js";
import { h } from "../../ui/dom.js";

/** The system typed, or "" for your position. */
let typed = "";

/** Where Search's distances are measured from. */
export function searchReference(ctx: Ctx): Reference {
  return typed ? { system: typed, label: typed } : referenceOf(ctx);
}

/** The "Reference system" field; `changed` runs when it changes (to redraw the "around" line). */
export function referenceField(ctx: Ctx, changed: () => void): HTMLElement {
  const input = h("input", {
    type: "text",
    value: typed,
    placeholder: referenceOf(ctx).label,
    onchange: () => {
      typed = input.value.trim();
      changed();
    },
  }) as HTMLInputElement;
  return h(
    "label.check.reference-field",
    null,
    t("search.referenceSystem") + " ",
    input,
    h(
      "button.ghost",
      {
        title: t("search.referenceHere"),
        onclick: () => {
          typed = "";
          input.value = "";
          changed();
        },
      },
      t("search.referenceHere"),
    ),
  );
}
