// Suggestions under a text field, updated as you type: arrows to move, Enter or a click to pick,
// Escape to close. For lists too long for a <datalist> (and the same on every system's webview).
// The suggestions can come from a list in memory (instantly) or from a site (`delayMs` after the
// last key, an older answer dropped).

import { h, replace } from "./dom.js";

/**
 * Wraps `input` with a suggestion list filled by `suggest(text)`; `picked(value)` runs when a
 * suggestion is chosen (the field already holds it). Returns the wrapper to put in the page.
 */
export function suggestBox(
  input: HTMLInputElement,
  suggest: (text: string) => string[] | Promise<string[]>,
  picked: (value: string) => void,
  delayMs = 0,
): HTMLElement {
  const list = h("ul.suggest-list", { role: "listbox", hidden: true });
  let items: string[] = [];
  let active = -1;
  let asked = 0;
  let timer: number | undefined;

  const close = () => {
    list.hidden = true;
    active = -1;
  };
  const draw = () => {
    replace(
      list,
      ...items.map((value, i) =>
        h(
          "li",
          {
            role: "option",
            class: i === active ? "active" : "",
            "aria-selected": String(i === active),
            // mousedown, not click: the field mustn't lose its focus (and close the list) first.
            onmousedown: (e: Event) => {
              e.preventDefault();
              choose(value);
            },
          },
          value,
        ),
      ),
    );
    list.hidden = items.length === 0;
  };
  const choose = (value: string) => {
    input.value = value;
    close();
    picked(value);
  };

  input.setAttribute("autocomplete", "off");
  const refresh = async () => {
    const id = ++asked;
    let found: string[] = [];
    try {
      found = await suggest(input.value);
    } catch {
      found = [];
    }
    if (id !== asked || document.activeElement !== input) return;
    items = found;
    active = -1;
    draw();
  };
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    if (delayMs > 0) timer = window.setTimeout(() => void refresh(), delayMs);
    else void refresh();
  });
  // Capture: runs before the field's own Enter handler (a search), which a pick replaces.
  input.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        draw();
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(items[active]);
      } else if (e.key === "Escape") close();
    },
    true,
  );
  input.addEventListener("blur", close);
  // A main search field (input.big) keeps its width rules on the box that now holds it.
  return h(input.classList.contains("big") ? "div.suggest-box.big" : "div.suggest-box", null, input, list);
}
