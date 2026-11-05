// Small pieces of the Wishlist page: the grade selects, an item's label, and the two-click "clear".

import { gameName, t } from "../../platform/i18n.js";
import type { Ctx } from "../../state/context.js";
import type { WishItem } from "../../state/store.js";
import { h, toast } from "../../ui/dom.js";

// A single "are you sure" without a blocking browser dialog: second click within 3 s confirms.
let clearArmed = 0;

export function confirmClear(): boolean {
  if (Date.now() - clearArmed < 3000) return true;
  clearArmed = Date.now();
  toast(t("wishlist.clickClearAgainConfirm"));
  return false;
}

export function select(options: number[], value: number, onChange: (v: number) => void): HTMLSelectElement {
  return h(
    "select",
    { onchange: (e: Event) => onChange(Number((e.target as HTMLSelectElement).value)) },
    options.map((o) => h("option", { value: String(o), selected: o === value }, `G${o}`)),
  );
}

export function lineLabel(ctx: Ctx, item: WishItem): string {
  const [kind, module, name] = item.bp.split("|");
  return kind === "modification"
    ? `${gameName(module)} — ${gameName(name)} G${item.gradeTo}`
    : `${gameName(module)} — ${gameName(name)}`;
}
