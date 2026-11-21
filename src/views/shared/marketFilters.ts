// The "where to sell" settings in words: the minimum demand and the age of prices, shown with
// the Mining results.

import { fmt, h } from "../../ui/dom.js";
import { debugSource } from "../../ui/debugSource.js";
import { t } from "../../platform/i18n.js";
import type { Settings } from "../../state/store.js";
import { ARDENT_MAX_DISTANCE } from "../../services/ardent.js";
import { edcnTurnedOn } from "../../services/edcn.js";

/** "1 week", "1 month", "Any age"… for a number of days (the "data age" setting). */
export function priceAgeLabel(days: number): string {
  if (days === 1) return t("market.oneDay");
  if (days === 3) return t("market.threeDays");
  if (days === 7) return t("market.oneWeek");
  if (days === 14) return t("market.twoWeeks");
  if (days === 30) return t("market.oneMonth");
  if (days === 90) return t("market.threeMonths");
  return t("market.daysShort", { days });
}

/**
 * "Prices up to 1 month old; demand of at least 100 t." In debug mode, where the prices come from
 * (the most recent of Spansh, Ardent and EDCN; Ardent only up to 500 ly, EDCN when turned on).
 */
export function sellFiltersNote(settings: Settings, range = settings.maxDistance): HTMLElement {
  return h(
    "p.sub",
    null,
    t("market.sellFiltersNote", {
      age: priceAgeLabel(settings.maxAgeDays),
      demand: fmt(Math.max(1, settings.minSellDemand)),
    }),
    debugSource("Spansh"),
    debugSource("Ardent", range > ARDENT_MAX_DISTANCE ? `≤ ${fmt(ARDENT_MAX_DISTANCE)} ly` : null),
    debugSource(edcnTurnedOn(settings.sync) && "EDCN"),
  );
}
