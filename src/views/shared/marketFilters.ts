// The "where to sell" settings in words: the minimum demand and the age of prices, shown above
// results (Mining, Search) and in Settings.

import { fmt } from "../../ui/dom.js";
import { t } from "../../platform/i18n.js";
import type { Settings } from "../../state/store.js";
import { ARDENT_MAX_DISTANCE } from "../../services/ardent.js";

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

/** "Prices up to 1 month old (Spansh and Ardent, the most recent), demand of at least 100 t." */
export function sellFiltersNote(settings: Settings, range = settings.maxDistance): string {
  const note = t("market.sellFiltersNote", {
    age: priceAgeLabel(settings.maxAgeDays),
    demand: fmt(Math.max(1, settings.minSellDemand)),
  });
  // Ardent answers up to 500 ly: say so when the search radius is wider.
  return range > ARDENT_MAX_DISTANCE
    ? `${note} ${t("market.ardentRadius", { distance: fmt(ARDENT_MAX_DISTANCE) })}`
    : note;
}
