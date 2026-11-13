// Sortable tables: a click on a column title of any `table.table` sorts its rows by that column,
// a second click reverses the order, a third one gives back the page's own order (a route's jump
// order, the BGS page's priorities…). The choice is remembered per table while EDCH runs, so
// when a page redraws its table on the next journal event the rows stay sorted.
//
// Pages don't do anything for it. A cell whose text doesn't sort well (a relative time like
// "3 h ago", a date) carries the value to sort on in `data-sort` (ISO date or number). Column
// titles without text (buttons, icons) aren't sortable, nor those marked `data-no-sort`.

import { locale, t } from "../platform/i18n.js";

type Direction = "ascending" | "descending";

/** Sorted column per table, by the table's identity (see tableKey). */
const choices = new Map<string, { column: number; direction: Direction }>();

/** A table is known by its column titles: the same table redrawn keeps its sort. */
function tableKey(table: HTMLTableElement): string {
  return table.dataset.sortId ?? [...headerCells(table)].map((th) => th.textContent?.trim() ?? "").join("|");
}

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.tHead?.rows[0];
  return row ? [...row.cells] : [];
}

const sortable = (th: HTMLTableCellElement) => !("noSort" in th.dataset) && Boolean(th.textContent?.trim());

/** The decimal separator of the app's language ("," in French, "." in English…). */
function decimalSeparator(): string {
  try {
    return new Intl.NumberFormat(locale()).format(1.5).replace(/\d/g, "") || ".";
  } catch {
    return ".";
  }
}

/**
 * The number a cell starts with ("45,2 %", "1 234 567 CR", "+3.1", "12.40 ly"), read with the
 * language's separators; undefined when the cell doesn't start with a number.
 */
export function leadingNumber(text: string, decimal = "."): number | undefined {
  const match = /^[+\-−]?\s?\d[\d\s  .,']*/.exec(text.trim());
  if (!match) return undefined;
  let digits = match[0].replace(/[\s  ']/g, "").replace("−", "-");
  const other = decimal === "," ? "." : ",";
  digits = digits.split(other).join("");
  if (decimal === ",") digits = digits.replace(",", ".");
  digits = digits.replace(/[.,]+$/, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
}

/** The value a cell sorts on: `data-sort` (number or date), else its number, else its text. */
function cellValue(cell: HTMLTableCellElement | undefined, decimal: string): number | string | undefined {
  if (!cell) return undefined;
  const given = cell.dataset.sort;
  if (given !== undefined) {
    if (given === "") return undefined;
    const number = Number(given);
    if (Number.isFinite(number)) return number;
    const time = Date.parse(given);
    return Number.isFinite(time) ? time : given.toLowerCase();
  }
  const text = cell.textContent?.trim() ?? "";
  // Placeholders for "nothing" go last whatever the direction.
  if (!text || text === "—" || text === "-" || text === "?") return undefined;
  return leadingNumber(text, decimal) ?? text;
}

/**
 * Compares two cell values: numbers before texts, texts in the language's order (with numbers
 * inside them compared as numbers), missing values always last.
 */
export function compareValues(
  a: number | string | undefined,
  b: number | string | undefined,
  direction: Direction,
  language = "en",
): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  const sign = direction === "ascending" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  if (typeof a === "number") return -1 * sign;
  if (typeof b === "number") return 1 * sign;
  return a.localeCompare(b, language, { numeric: true, sensitivity: "base" }) * sign;
}

/** Puts the table's rows in the remembered order and shows it on the column titles. */
function apply(table: HTMLTableElement) {
  const headers = headerCells(table);
  if (!headers.length) return;
  const choice = choices.get(tableKey(table));
  headers.forEach((th, index) => {
    if (!sortable(th)) return;
    th.classList.add("sortable");
    th.tabIndex = 0;
    th.title = t("common.sortHint");
    if (choice?.column === index) th.setAttribute("aria-sort", choice.direction);
    else th.removeAttribute("aria-sort");
  });
  for (const body of table.tBodies) {
    const rows = [...body.rows];
    // The page's own order, to come back to.
    rows.forEach((row, index) => {
      if (row.dataset.sortIndex === undefined) row.dataset.sortIndex = String(index);
    });
    const original = (row: HTMLTableRowElement) => Number(row.dataset.sortIndex);
    let sorted: HTMLTableRowElement[];
    if (choice) {
      const decimal = decimalSeparator();
      const language = locale();
      const keyed = rows.map((row) => ({ row, value: cellValue(row.cells[choice.column], decimal) }));
      keyed.sort(
        (x, y) => compareValues(x.value, y.value, choice.direction, language) || original(x.row) - original(y.row),
      );
      sorted = keyed.map((entry) => entry.row);
    } else {
      sorted = [...rows].sort((x, y) => original(x) - original(y));
    }
    if (sorted.some((row, index) => row !== rows[index])) body.append(...sorted);
  }
}

/** Ascending, then descending, then the page's order. */
function nextChoice(table: HTMLTableElement, column: number) {
  const key = tableKey(table);
  const current = choices.get(key);
  if (current?.column !== column) choices.set(key, { column, direction: "ascending" });
  else if (current.direction === "ascending") choices.set(key, { column, direction: "descending" });
  else choices.delete(key);
  apply(table);
}

function onActivate(event: Event) {
  const th = (event.target as Element | null)?.closest?.("th");
  if (!th || !(th instanceof HTMLTableCellElement) || !sortable(th)) return;
  // A button or link inside the title keeps its own job.
  if ((event.target as Element).closest("button, a, input, select") && !(event.target as Element).matches("th")) return;
  const table = th.closest("table.table");
  if (!(table instanceof HTMLTableElement) || th.parentElement !== table.tHead?.rows[0]) return;
  if (event instanceof KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
  }
  nextChoice(table, th.cellIndex);
}

function tablesIn(node: Node): HTMLTableElement[] {
  if (!(node instanceof Element)) return [];
  const found = node.matches("table.table") ? [node as HTMLTableElement] : [];
  return [...found, ...(node.querySelectorAll("table.table") as NodeListOf<HTMLTableElement>)];
}

/** Makes every `table.table` of the app sortable, now and whenever one is drawn. Called once. */
export function installTableSorting(root: HTMLElement = document.body) {
  root.addEventListener("click", onActivate);
  root.addEventListener("keydown", onActivate);
  tablesIn(root).forEach(apply);
  new MutationObserver((mutations) => {
    const tables = new Set<HTMLTableElement>();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        for (const table of tablesIn(node)) tables.add(table);
        // Rows or cells redrawn inside an existing table.
        const parent = node.parentElement?.closest("table.table");
        if (parent instanceof HTMLTableElement) tables.add(parent);
      }
    }
    tables.forEach(apply);
  }).observe(root, { childList: true, subtree: true });
}
