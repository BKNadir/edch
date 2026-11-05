// A small in-app dialog (no Windows pop-up): a title, content and buttons.

import { h, icon } from "./dom.js";
import { t } from "../platform/i18n.js";

export function dialog(title: string, body: (Node | string | null)[], buttons: { label: string; primary?: boolean; value: string }[]): Promise<string | null> {
  return new Promise((resolve) => {
    const close = (value: string | null) => {
      overlay.remove();
      window.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    const overlay = h(
      "div.dialog-overlay",
      { onclick: (e: Event) => e.target === overlay && close(null) },
      h(
        "div.dialog",
        { role: "dialog", "aria-modal": "true" },
        h("div.dialog-head", null, h("h3", null, title), h("button.icon-btn", { title: t("common.close"), onclick: () => close(null) }, icon("close"))),
        h("div.dialog-body", null, ...body),
        h(
          "div.dialog-actions",
          null,
          buttons.map((b) => h(b.primary ? "button.primary" : "button.ghost", { onclick: () => close(b.value) }, b.label)),
        ),
      ),
    );
    window.addEventListener("keydown", onKey);
    document.body.append(overlay);
    overlay.querySelector<HTMLButtonElement>(".dialog-actions .primary")?.focus();
  });
}
