// A long list that isn't a table (Search results, a material's sources…) shown a page at a time.
// A list that fits on the screen is shown whole, with no page links. Otherwise, above it: how many
// lines there are, the page links and how many lines a page shows (ui/pageSize.ts); below it, the
// page links again only when the page is still taller than the screen. Lines the source hasn't
// given yet are asked for when a page needs them. Tables page themselves (ui/pagedTables.ts).

import { t } from "../../platform/i18n.js";
import { h, icon, replace } from "../../ui/dom.js";
import { linesFrom, pageSizeChoice, roomFrom, savedPageSize, screenSpace, type PageSize } from "../../ui/pageSize.js";
import { pager } from "../../ui/pager.js";

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
  /** The list for some lines (a block of result rows…). */
  draw: (rows: T[]) => HTMLElement;
  /** The text above the list, e.g. "120 systems · 1–50 shown". */
  summary: (from: number, to: number, total: number) => string;
  /** Something always shown above the list, with or without pages (a count, a note…). */
  header?: () => HTMLElement | null;
}

/**
 * Draws `source` in `out`, a page at a time when it doesn't fit on the screen, starting at `page`
 * (0-based). The page links and the lines-per-page choice redraw it in place. If asking for more
 * lines fails, the lines received are shown with the error under them.
 */
export async function showPagedList<T>(out: HTMLElement, source: PagedSource<T>, look: PagedLook<T>, page = 0) {
  const hasMore = source.hasMore?.() ?? false;
  // Everything received and nothing more: shown whole when it fits.
  if (!hasMore) {
    const list = look.draw(source.rows());
    replace(out, look.header?.() ?? null, list);
    if (list.offsetHeight <= roomFrom(list)) return;
  }
  const size = savedPageSize();
  const perPage = size === "auto" ? autoLines(out, source, look) : size;
  let failure: unknown;
  try {
    await receiveLines(source, (page + 1) * perPage);
  } catch (e) {
    failure = e;
  }
  drawPage(out, source, look, page, perPage);
  if (failure) out.append(h("p.error", null, icon("warn"), ` ${String((failure as Error).message ?? failure)}`));
}

/**
 * The lines that fit between the list's first line and the bottom of the screen, under what is
 * above it (the form, the bar), measured on the first lines drawn.
 */
function autoLines<T>(out: HTMLElement, source: PagedSource<T>, look: PagedLook<T>): number {
  const measured = Math.min(50, Math.max(1, source.rows().length));
  drawPage(out, source, look, 0, measured);
  const list = out.querySelector<HTMLElement>(".paged-bar")?.nextElementSibling as HTMLElement | null;
  if (!list) return measured;
  // A table's header is drawn on every page: the lines start under it.
  const header = list.querySelector<HTMLElement>("thead")?.offsetHeight ?? 0;
  const firstLine = list.querySelector<HTMLElement>("tbody") ?? list;
  return linesFrom(firstLine, (list.offsetHeight - header) / measured);
}

/** Asks the source for more lines until it has `wanted` of them or has no more. */
async function receiveLines<T>(source: PagedSource<T>, wanted: number) {
  while (source.rows().length < wanted && source.more && (source.hasMore?.() ?? false))
    if (!(await source.more())) return;
}

/** Draws page `page` of `perPage` lines, the bar above and, if still taller than the screen, the links below. */
function drawPage<T>(out: HTMLElement, source: PagedSource<T>, look: PagedLook<T>, page: number, perPage: number) {
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
    // A fixed number of lines may go past the screen: back to the top of the list. In auto mode
    // the page fits where it is: nothing moves.
    if (savedPageSize() !== "auto") out.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const links = () => {
    const slot = h("div.pager-slot");
    const nav = pager(at, pages, false, (wanted) => void go(wanted, slot));
    if (nav) slot.append(nav);
    return slot;
  };
  // With a fixed number, the page holding the same first line; in auto mode, the first page.
  const sizeChoice = pageSizeChoice(
    (size: PageSize) => void showPagedList(out, source, look, size === "auto" ? 0 : Math.floor((at * perPage) / size)),
  );
  const list = look.draw(shown);
  const total = Math.max(source.total(), rows.length);
  replace(
    out,
    look.header?.() ?? null,
    h(
      "div.paged-bar",
      null,
      h("span.sub", null, look.summary(at * perPage + 1, at * perPage + shown.length, total)),
      links(),
      sizeChoice,
    ),
    list,
  );
  if (pages > 1 && list.offsetHeight > screenSpace()) out.append(links());
}
