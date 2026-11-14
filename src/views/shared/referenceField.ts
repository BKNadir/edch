// "Reference system" field, on every page that searches around you (Search, Mining, Engineers,
// a material's sources): distances are measured from your position by default, or from a system
// typed here (suggested as you type, any capitals). One value for all pages, kept while EDCH runs
// (store.referenceSystem, with the coordinates Spansh gives).

import { t } from "../../platform/i18n.js";
import { log } from "../../platform/logger.js";
import { findSystem, suggestSystems } from "../../services/spansh.js";
import type { Ctx } from "../../state/context.js";
import { h } from "../../ui/dom.js";
import { suggestBox } from "../../ui/suggestBox.js";

/** Your position's system (shown greyed in an empty field). */
const hereOf = (ctx: Ctx) => ctx.store.state.cmdr.location?.system || ctx.store.state.settings.fallbackSystem || "Sol";

/** Brings a field made earlier up to date (your position moved, another page changed the system). */
export function refreshReferenceField(field: HTMLElement, ctx: Ctx): void {
  const input = field.querySelector("input");
  if (!input || document.activeElement === input) return;
  input.placeholder = hereOf(ctx);
  input.value = ctx.store.state.referenceSystem;
}

/** The field; `changed` runs after a change (a page redraws what depends on the reference). */
export function referenceField(ctx: Ctx, changed: () => void = () => {}): HTMLElement {
  const state = ctx.store.state;
  const here = hereOf(ctx);
  const problem = h("small.reference-problem", { hidden: true });
  const set = async (typed: string) => {
    const name = typed.trim();
    problem.hidden = true;
    if (!name || name.toLowerCase() === state.referenceSystem.toLowerCase()) {
      if (!name) {
        ctx.store.setReferenceSystem("");
        changed();
      }
      return;
    }
    try {
      const found = await findSystem(name);
      if (!found) throw new Error("not found");
      input.value = found.name;
      ctx.store.setReferenceSystem(found.name, found.coords);
      changed();
    } catch (error) {
      log.debug("reference", `System not found: ${String((error as Error)?.message ?? error)}`);
      problem.textContent = t("search.referenceUnknown", { system: name });
      problem.hidden = false;
    }
  };
  const input = h("input", {
    type: "text",
    value: state.referenceSystem,
    placeholder: here,
    spellcheck: false,
    onchange: () => void set(input.value),
    onkeydown: (e: KeyboardEvent) => e.key === "Enter" && void set(input.value),
  }) as HTMLInputElement;
  const field = suggestBox(
    input,
    (typed) => (typed.trim().length >= 3 ? suggestSystems(typed) : []),
    (value) => void set(value),
    300,
  );
  return h(
    "div.reference-field",
    null,
    h("span", null, t("search.referenceSystem")),
    field,
    h(
      "button.ghost",
      {
        title: t("search.referenceHereHelp", { system: hereOf(ctx) }),
        onclick: () => {
          input.value = "";
          void set("");
        },
      },
      t("search.referenceHere"),
    ),
    problem,
  );
}
