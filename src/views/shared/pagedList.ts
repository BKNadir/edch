// A long list shown a page at a time (Search results…). Above the list: how many lines there are,
// the page links and how many lines a page shows (10, 50, 100, or "auto": as many as fit on the
// screen). Below the list: the page links again, but only when the page is taller than the screen,
// so they are never more than a screen away. The choice of lines is the same for every list.

import { t } from "../../platform/i18n.js";
import { h, icon, replace } from "../../ui/dom.js";
import { pager } from "./pager.js";

/** How many lines a page shows: a fixed number, or "auto" to fill the screen. */
export type PageSize = "auto" | 10 | 50 | 100;

/** The choices offered, in the order shown. */
export const PAGE_SIZES: PageSize[] = ["auto", 10, 50, 100];

const PAGE_SIZE_KEY = "edch.pageSize";
/** Lines shown at least in auto mode, however small the window. */
const AUTO_MIN_LINES = 5;
/** Space kept free under the list in auto mode (pixels). */
const AUTO_BOTTOM_MARGIN = 16;

/** The number of lines chosen last (50 until one is chosen). */
export function savedPageSize(): PageSize {
  try {
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    if (saved === "auto") return "auto";
    const size = Number(saved);
    if (PAGE_SIZES.includes(size as PageSize)) return size as PageSize;
  } catch {
    // Storage unavailable: the default below.
  }
  return 50;
}

function savePageSize(size: PageSize) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    // Storage unavailable: the choice lasts until the page is drawn again.
  }
}

/** Where the lines come from: those received so far, and how to get more when the source has them. */
export interface PagedSource<T> {
  /** The lines received so far, in the order shown. */
  rows: () => T[];
  /** How many lines the source has in all (at least the number received). */
  total: () => number;
  /** Whether the source has more lines than received. */
  hasMore?: () => boolean;
  /** How many lines can be received at most, when fewer than `total` (a cap on the requests). */
  limit?: number;
  /** Asks the source for the next lines; false when it has none. */
  more?: () => Promise<boolean>;
}

/** How the lines are drawn. */
export interface PagedLook<T> {
  /** The list for one page's lines (a table, or a block of result rows). */
  draw: (rows: T[]) => HTMLElement;
  /** The text above the list, e.g. "120 systems · 1–50 shown". */
  summary: (from: number, to: number, total: number) => string;
}

/**
 * Draws `source` in `out` a page at a time, starting at `page` (0-based). The page links and the
 * lines-per-page choice redraw it in place. Lines the page needs beyond those received are asked
 * first; if that fails, the lines received are shown with the error under them.
 */
export async function showPagedList<T>(out: HTMLElement, source: PagedSource<T>, look: PagedLook<T>, page = 0) {
  const size = savedPageSize();
  let perPage: number;
  if (size === "auto") {
    // The height of a line is only known once lines are drawn: the first lines are drawn to be
    // measured, then the wanted page with the number of lines that fit.
    const measured = Math.min(50, Math.max(1, source.rows().length));
    draw(out, source, look, 0, measured);
    perPage = linesThatFit(out, measured);
  } else perPage = size;
  let failure: unknown;
  try {
    await receiveLines(source, (page + 1) * perPage);
  } catch (e) {
    failure = e;
  }
  draw(out, source, look, page, perPage);
  if (failure) out.append(h("p.error", null, icon("warn"), ` ${String((failure as Error).message ?? failure)}`));
}

/** Asks the source for more lines until it has `wanted` of them or has no more. */
async function receiveLines<T>(source: PagedSource<T>, wanted: number) {
  while (source.rows().length < wanted && source.more && (source.hasMore?.() ?? false))
    if (!(await source.more())) return;
}

/** Draws page `page` of `perPage` lines, with the bar above and, if the list is taller than the screen, the links below. */
function draw<T>(out: HTMLElement, source: PagedSource<T>, look: PagedLook<T>, page: number, perPage: number) {
  const rows = source.rows();
  const hasMore = source.hasMore?.() ?? false;
  // While lines remain to be received, the pages count the lines the source can still give.
  const reachable = hasMore ? Math.min(source.total(), source.limit ?? Infinity) : rows.length;
  const pages = Math.max(1, Math.ceil(Math.max(reachable, rows.length) / perPage));
  // A page past the lines received (the source gave fewer than announced) shows the last one.
  const at = Math.max(0, Math.min(page, Math.ceil(rows.length / perPage) - 1));
  const shown = rows.slice(at * perPage, (at + 1) * perPage);

  const go = async (wanted: number, linkSlot: HTMLElement) => {
    // Lines past those received are asked for first: the links show it meanwhile.
    if ((wanted + 1) * perPage > rows.length) replace(linkSlot, h("span.spinner"), " " + t("common.searching"));
    await showPagedList(out, source, look, wanted);
    out.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const links = () => {
    const slot = h("div.pager-slot");
    const nav = pager(at, pages, false, (wanted) => void go(wanted, slot));
    if (nav) slot.append(nav);
    return slot;
  };

  const sizeChoice = h(
    "label.check.page-size",
    null,
    t("pager.linesPerPage") + " ",
    h(
      "select",
      {
        onchange: (e: Event) => {
          const value = (e.target as HTMLSelectElement).value;
          const next: PageSize = value === "auto" ? "auto" : (Number(value) as PageSize);
          savePageSize(next);
          // With a fixed number, the page holding the same first line; in auto mode, the first page.
          void showPagedList(out, source, look, next === "auto" ? 0 : Math.floor((at * perPage) / next));
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
  const list = look.draw(shown);
  replace(
    out,
    h(
      "div.paged-bar",
      null,
      h(
        "span.sub",
        null,
        look.summary(at * perPage + 1, at * perPage + shown.length, Math.max(source.total(), rows.length)),
      ),
      links(),
      sizeChoice,
    ),
    list,
  );
  // The links again under a list taller than the screen.
  if (pages > 1 && list.offsetHeight > screenSpace()) out.append(links());
}

/** The height a list can take on screen: the window, less the top bar and the phone's bottom menu. */
function screenSpace(): number {
  const topBar = document.querySelector<HTMLElement>(".topbar")?.offsetHeight ?? 0;
  const menu = document.querySelector<HTMLElement>(".sidebar");
  const bottomMenu = menu && getComputedStyle(menu).position === "fixed" ? menu.offsetHeight : 0;
  return window.innerHeight - topBar - bottomMenu - AUTO_BOTTOM_MARGIN;
}

/**
 * How many lines fit on screen under the bar, from the page just drawn with `drawn` lines (its
 * header, if a table, counted once).
 */
function linesThatFit(out: HTMLElement, drawn: number): number {
  const bar = out.querySelector<HTMLElement>(".paged-bar");
  const list = bar?.nextElementSibling as HTMLElement | null;
  if (!bar || !list || drawn < 1) return drawn;
  const header = list.querySelector<HTMLElement>("thead")?.offsetHeight ?? 0;
  const lineHeight = (list.offsetHeight - header) / drawn;
  if (!(lineHeight > 0)) return drawn;
  const room = screenSpace() - bar.offsetHeight - header;
  return Math.max(AUTO_MIN_LINES, Math.floor(room / lineHeight));
}
