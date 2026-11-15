// Pages of a long result list: "‹ Previous · 1 2 3 … · Next ›". When the source has more results
// than received, "Next" on the last page asks for them (`more`).

import { t } from "../../platform/i18n.js";
import { h } from "../../ui/dom.js";

/**
 * The page links for page `at` of `pages` (0-based); `more` when results beyond the last page can
 * be asked for. `go(page)` runs on a click. Nothing is drawn for a single page with nothing more.
 */
export function pager(at: number, pages: number, more: boolean, go: (page: number) => void): HTMLElement | null {
  if (pages <= 1 && !more) return null;
  const numbers = pageNumbers(at, pages);
  return h(
    "nav.pager",
    { "aria-label": t("pager.label") },
    h("button.ghost", { disabled: at === 0, onclick: () => go(at - 1) }, "‹ " + t("pager.previous")),
    numbers.map((n) =>
      n === null
        ? h("span.pager-gap", null, "…")
        : h(
            n === at ? "button.primary" : "button.ghost",
            { "aria-current": n === at ? "page" : undefined, onclick: () => go(n) },
            String(n + 1),
          ),
    ),
    more ? h("span.pager-gap", null, "…") : null,
    h("button.ghost", { disabled: at >= pages - 1 && !more, onclick: () => go(at + 1) }, t("pager.next") + " ›"),
  );
}

/** The page numbers to show: the first, the last, and two around the current one (null: a gap). */
export function pageNumbers(at: number, pages: number): (number | null)[] {
  const wanted = new Set([0, pages - 1, at - 2, at - 1, at, at + 1, at + 2].filter((n) => n >= 0 && n < pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of sorted) {
    if (out.length && n - (out[out.length - 1] as number) > 1) out.push(null);
    out.push(n);
  }
  return out;
}
