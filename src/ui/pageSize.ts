// How many lines a page of a long list shows (10, 50, 100, or "auto": as many as fit on the
// screen), the same choice for every list, and the measures behind it: the room a list has on
// screen and how many of its lines fit there. Used by the paged tables (ui/pagedTables.ts) and
// the other paged lists (views/shared/pagedList.ts).

import { t } from "../platform/i18n.js";
import { h } from "./dom.js";

/** How many lines a page shows: a fixed number, or "auto" to fill the screen. */
export type PageSize = "auto" | 10 | 50 | 100;

/** The choices offered, in the order shown. */
export const PAGE_SIZES: PageSize[] = ["auto", 10, 50, 100];

const PAGE_SIZE_KEY = "edch.pageSize";
/** Lines shown at least in auto mode, however small the window. */
const AUTO_MIN_LINES = 5;
/** Space kept free under a list (pixels). */
const BOTTOM_MARGIN = 16;

/** The number of lines chosen last ("auto" until one is chosen). */
export function savedPageSize(): PageSize {
  try {
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    const size = saved === "auto" ? "auto" : Number(saved);
    if (PAGE_SIZES.includes(size as PageSize)) return size as PageSize;
  } catch {
    // Storage unavailable: the default below.
  }
  return "auto";
}

/** Keeps the choice for every list. */
export function savePageSize(size: PageSize) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    // Storage unavailable: the choice lasts until the list is drawn again.
  }
}

/** The "Lines per page" select; `changed` runs with the new choice, already saved. */
export function pageSizeChoice(changed: (size: PageSize) => void): HTMLElement {
  return h(
    "label.check.page-size",
    null,
    t("pager.linesPerPage") + " ",
    h(
      "select",
      {
        onchange: (e: Event) => {
          const value = (e.target as HTMLSelectElement).value;
          const size: PageSize = value === "auto" ? "auto" : (Number(value) as PageSize);
          savePageSize(size);
          changed(size);
        },
      },
      PAGE_SIZES.map((choice) =>
        h(
          "option",
          { value: String(choice), selected: choice === savedPageSize() },
          choice === "auto" ? t("pager.auto") : String(choice),
        ),
      ),
    ),
  );
}

/** The height a list can take on screen: the window, less the top bar and the phone's bottom menu. */
export function screenSpace(): number {
  const topBar = document.querySelector<HTMLElement>(".topbar")?.offsetHeight ?? 0;
  const menu = document.querySelector<HTMLElement>(".sidebar");
  const bottomMenu = menu && getComputedStyle(menu).position === "fixed" ? menu.offsetHeight : 0;
  return window.innerHeight - topBar - bottomMenu - BOTTOM_MARGIN;
}

/**
 * How many lines of `lineHeight` pixels fit on screen under `above` pixels (the bar with the
 * page links, a table's header…); at least a few.
 */
export function linesThatFit(lineHeight: number, above: number): number {
  if (!(lineHeight > 0)) return AUTO_MIN_LINES;
  return Math.max(AUTO_MIN_LINES, Math.floor((screenSpace() - above) / lineHeight));
}
