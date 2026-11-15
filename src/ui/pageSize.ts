// How many lines a page of a long list shows (10, 50, 100, or "auto": as many as fit on the
// screen, under what is above the list, without scrolling), the same choice for every list, and
// the measures behind it: the room a list has on screen and how many of its lines fit there. Used by the paged tables (ui/pagedTables.ts) and
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
/** Height of a line assumed before one is measured (pixels). */
const MIN_LINE_HEIGHT = 24;

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

/** Height of the bar at the top of the window (pixels). */
function topBarHeight(): number {
  return document.querySelector<HTMLElement>(".topbar")?.offsetHeight ?? 0;
}

/** The height a list can take on screen: the window, less the top bar and the phone's bottom menu. */
export function screenSpace(): number {
  const menu = document.querySelector<HTMLElement>(".sidebar");
  const bottomMenu = menu && getComputedStyle(menu).position === "fixed" ? menu.offsetHeight : 0;
  return window.innerHeight - topBarHeight() - bottomMenu - BOTTOM_MARGIN;
}

/**
 * Where `el` is when its page is scrolled to the top: its distance from the top of the area that
 * scrolls (the page's frame on a computer, the whole page under the top bar on a phone).
 */
function offsetFromTop(el: HTMLElement): number {
  // The page's own frame, when its content is taller than it (a frame that only scrolls sideways,
  // around a wide table, doesn't count); the whole document is the case below.
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && parent.scrollHeight > parent.clientHeight)
      return el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop;
  }
  const pageScroll = window.scrollY || document.body.scrollTop || document.documentElement.scrollTop;
  return el.getBoundingClientRect().top + pageScroll - topBarHeight();
}

/**
 * The room a list starting at `el` has on screen without scrolling: from `el` down to the bottom
 * of the screen, the page being at its top. A list starting too low for a few lines of
 * `lineHeight` is scrolled to anyway: it gets a whole screen.
 */
export function roomFrom(el: HTMLElement, lineHeight = 0): number {
  const room = screenSpace() - offsetFromTop(el);
  return room >= AUTO_MIN_LINES * Math.max(lineHeight, MIN_LINE_HEIGHT) ? room : screenSpace();
}

/** How many lines of `lineHeight` pixels fit in the room a list starting at `el` has (at least a few). */
export function linesFrom(el: HTMLElement, lineHeight: number): number {
  if (!(lineHeight > 0)) return AUTO_MIN_LINES;
  return Math.max(AUTO_MIN_LINES, Math.floor(roomFrom(el, lineHeight) / lineHeight));
}
