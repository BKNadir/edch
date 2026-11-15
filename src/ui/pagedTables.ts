// Long tables shown a page at a time, by themselves: a `table.table` taller than the screen gets,
// above it, how many lines there are, the page links and the lines-per-page choice (ui/pageSize.ts),
// and the page links again under it when the page is still taller than the screen. A table that
// fits on the screen is left whole, with nothing added.
//
// Pages don't do anything for it, like for the sorting (ui/sortableTables.ts): the lines out of the
// page are only hidden, so sorting still orders all of them, and the page shown is remembered per
// table while EDCH runs, so a table redrawn on the next journal event stays on its page. A table
// marked `data-no-paging` stays whole (a route is read from start to end).

import { t } from "../platform/i18n.js";
import { h, replace } from "./dom.js";
import { linesThatFit, pageSizeChoice, savedPageSize, screenSpace } from "./pageSize.js";
import { pager } from "./pager.js";
import { tableKey } from "./sortableTables.js";

/** The page shown per table, by the table's identity (see tableKey). */
const pageShown = new Map<string, number>();

/** Height of the bar above a paged table before it is drawn and measured (pixels). */
const BAR_GUESS = 44;

/** The lines of the table's bodies, in their current order (header and footer lines aside). */
function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return [...table.tBodies].flatMap((body) => [...body.rows]);
}

/** What the page links go around: the table, or the block that only holds it (a scrolling frame). */
function blockOf(table: HTMLTableElement): HTMLElement {
  const parent = table.parentElement;
  return parent && parent.tagName === "DIV" && parent.childElementCount === 1 ? parent : table;
}

/** Takes away the links a previous paging of this table added around `block`. */
function removeLinks(block: HTMLElement) {
  if (block.previousElementSibling?.classList.contains("table-pages")) block.previousElementSibling.remove();
  if (block.nextElementSibling?.classList.contains("table-pages-bottom")) block.nextElementSibling.remove();
}

/** Shows `table` a page at a time if it is taller than the screen, or whole if it fits. */
export function pageTable(table: HTMLTableElement) {
  const block = blockOf(table);
  removeLinks(block);
  const rows = bodyRows(table);
  rows.forEach((row) => delete row.dataset.offPage);
  // Not on screen (a closed panel, another tab): measured when it shows.
  if ("noPaging" in table.dataset || !table.offsetHeight || table.offsetHeight <= screenSpace()) return;

  // The lines the page itself shows (a filter may hide some): only those are paged.
  const lines = rows.filter((row) => row.offsetHeight > 0);
  const header = table.tHead?.offsetHeight ?? 0;
  const lineHeight = (table.offsetHeight - header - (table.tFoot?.offsetHeight ?? 0)) / Math.max(1, lines.length);
  const size = savedPageSize();
  const bar = h("div.paged-bar.table-pages");
  block.before(bar);

  const draw = (perPage: number) => {
    const key = tableKey(table);
    const pages = Math.ceil(lines.length / perPage);
    const at = Math.max(0, Math.min(pageShown.get(key) ?? 0, pages - 1));
    lines.forEach((row, index) => {
      if (Math.floor(index / perPage) === at) delete row.dataset.offPage;
      else row.dataset.offPage = "";
    });
    const go = (wanted: number) => {
      pageShown.set(key, wanted);
      pageTable(table);
      // Back to the top of the new page, where its bar is.
      block.previousElementSibling?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const links = () => pager(at, pages, false, go);
    replace(
      bar,
      h(
        "span.sub",
        null,
        t("pager.linesShown", {
          from: at * perPage + 1,
          to: Math.min(lines.length, (at + 1) * perPage),
          count: lines.length,
        }),
      ),
      links(),
      // With a fixed number, the page holding the same first line; in auto mode, the first page.
      pageSizeChoice((chosen) => {
        pageShown.set(key, chosen === "auto" ? 0 : Math.floor((at * perPage) / chosen));
        pageAllTables();
      }),
    );
    // Drawn twice in auto mode: the links of the first drawing go.
    if (block.nextElementSibling?.classList.contains("table-pages-bottom")) block.nextElementSibling.remove();
    if (pages > 1 && table.offsetHeight > screenSpace()) block.after(h("div.table-pages-bottom", null, links()));
  };

  if (size !== "auto") {
    draw(size);
    return;
  }
  // Auto: as many lines as fit under the bar, measured once the bar is drawn.
  const guess = linesThatFit(lineHeight, BAR_GUESS + header);
  draw(guess);
  const fitting = linesThatFit(lineHeight, bar.offsetHeight + header);
  if (fitting !== guess) draw(fitting);
}

/** Pages every table again (the window changed size, the lines per page changed). */
function pageAllTables(root: ParentNode = document) {
  root.querySelectorAll<HTMLTableElement>("table.table").forEach(pageTable);
}

function tablesIn(node: Node): HTMLTableElement[] {
  if (!(node instanceof Element)) return [];
  const found = node.matches("table.table") ? [node as HTMLTableElement] : [];
  return [...found, ...(node.querySelectorAll("table.table") as NodeListOf<HTMLTableElement>)];
}

/**
 * Pages every `table.table` of the app, now and whenever one is drawn, sorted or shown (a panel
 * opened, the window resized). Called once, after the sorting is installed.
 */
export function installTablePaging(root: HTMLElement = document.body) {
  pageAllTables(root);
  new MutationObserver((mutations) => {
    const tables = new Set<HTMLTableElement>();
    for (const mutation of mutations)
      for (const node of mutation.addedNodes) {
        for (const table of tablesIn(node)) tables.add(table);
        // Lines added or put in another order inside an existing table.
        const parent = node.parentElement?.closest("table.table");
        if (parent instanceof HTMLTableElement) tables.add(parent);
      }
    tables.forEach(pageTable);
  }).observe(root, { childList: true, subtree: true });
  // A table in a panel that opens is measured then.
  root.addEventListener("toggle", (e) => tablesIn(e.target as Node).forEach(pageTable), true);
  let resizing: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => pageAllTables(root), 200);
  });
}
