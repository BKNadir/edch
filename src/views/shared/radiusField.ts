// "Range" field of a search: how far around the reference system it looks, in light years. Empty,
// it uses the default set in Settings (General); a value typed here is for this page while EDCH
// runs.

import { t } from "../../platform/i18n.js";
import { h } from "../../ui/dom.js";

/** The range of a page: its own value, or the Settings default. */
export const rangeOf = (own: number | undefined, fallback: number) => (own && own > 0 ? own : fallback);

/** The field; `changed(range)` gets the new value, undefined for the default. */
export function radiusField(
  own: number | undefined,
  fallback: number,
  changed: (range: number | undefined) => void,
): HTMLElement {
  return h(
    "label.check",
    { title: t("search.rangeHelp", { distance: fallback }) },
    t("search.range") + " ",
    h("input.num-small", {
      type: "number",
      min: "10",
      max: "5000",
      step: "10",
      value: own ? String(own) : "",
      placeholder: String(fallback),
      onchange: (e: Event) => {
        const value = Math.round(Number((e.target as HTMLInputElement).value));
        changed(value >= 10 ? Math.min(value, 5000) : undefined);
      },
    }),
    " " + t("search.rangeUnit"),
  );
}
