// Small pieces shared by the Navigation page: number and time formats, the system input with
// suggestions, and the figures shown above a route.

import { spanshGet } from "../../platform/bridge.js";
import { locale, t } from "../../platform/i18n.js";
import { h, replace } from "../../ui/dom.js";

export const fmt1 = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 2 });

export const hours = (min: number) =>
  min >= 60
    ? t("common.h", { h: Math.floor(min / 60), padStart: String(Math.round(min % 60)).padStart(2, "0") })
    : t("common.min", { min: Math.round(min) });

let datalistTimer: number | undefined;

export function systemInput(id: string, value: string, placeholder: string): HTMLInputElement {
  const list = h("datalist", { id: `${id}-list` });
  const input = h("input", {
    id,
    type: "text",
    value,
    placeholder,
    list: `${id}-list`,
    spellcheck: false,
    oninput: () => {
      window.clearTimeout(datalistTimer);
      const q = input.value.trim();
      if (q.length < 3) return;
      datalistTimer = window.setTimeout(async () => {
        try {
          const res = await spanshGet(`systems/field_values/system_names?q=${encodeURIComponent(q)}`);
          const values: string[] = Array.isArray(res?.values) ? res.values : Array.isArray(res) ? res : [];
          replace(
            list,
            values.slice(0, 12).map((v) => h("option", { value: v })),
          );
        } catch {
          /* autocomplete is a nicety */
        }
      }, 300);
    },
  });
  queueMicrotask(() => input.parentElement?.appendChild(list));
  return input;
}

export function stat(label: string, value: string): HTMLElement {
  return h("div.stat", null, h("span", null, label), h("strong", null, value));
}
