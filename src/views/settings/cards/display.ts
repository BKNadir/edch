// Settings → Display: colours (theme), interface size, and the pages shown in the menu.

import { isRemote } from "../../../platform/bridge.js";
import { t } from "../../../platform/i18n.js";
import type { Ctx } from "../../../state/context.js";
import type { Settings } from "../../../state/store.js";
import { DEFAULT_THEME, PRESETS, type ThemeSettings } from "../../../state/themeSettings.js";
import { h } from "../../../ui/dom.js";
import { startMenuEdit } from "../../../ui/menu/editMenu.js";
import { ALWAYS_SHOWN, NAV } from "../../../ui/menu/pages.js";

export function appearanceCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const theme = ctx.store.state.settings.theme;
  const setTheme = (patch: Partial<ThemeSettings>, redraw = true) => {
    ctx.store.updateSettings({ theme: { ...ctx.store.state.settings.theme, ...patch } });
    if (redraw) rerender();
  };
  const picker = (label: string, key: "accent" | "cyan" | "bg") =>
    h(
      "label",
      null,
      h("input", {
        type: "color",
        value: theme[key],
        oninput: (e: Event) => setTheme({ [key]: (e.target as HTMLInputElement).value, preset: "custom" }, false),
        onchange: () => rerender(),
      }),
      h("span", null, label),
    );
  return h(
    "section.card",
    { "data-tab": "display" },
    h("h3", null, t("settings.appearance")),
    h("p.sub", null, t("settings.pickThemeOwnColoursConnectedPhone")),
    h(
      "div.theme-presets",
      null,
      PRESETS.map((p) =>
        h(
          `button.theme-preset${theme.preset === p.id ? ".on" : ""}`,
          { onclick: () => setTheme({ preset: p.id, accent: p.accent, cyan: p.cyan, bg: p.bg }) },
          h(
            "span.theme-swatch",
            null,
            h("i", { style: { background: p.accent } }),
            h("i", { style: { background: p.cyan } }),
            h("i", { style: { background: p.bg } }),
          ),
          p.label,
        ),
      ),
    ),
    h(
      "div.theme-colors",
      null,
      picker(t("settings.mainColour"), "accent"),
      picker(t("settings.secondaryColour"), "cyan"),
      picker(t("settings.background"), "bg"),
    ),
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: theme.oled,
        onchange: (e: Event) => setTheme({ oled: (e.target as HTMLInputElement).checked }),
      }),
      " " + t("settings.oledModePureBlackBackgroundSaves"),
    ),
    h(
      "div.row",
      null,
      h("button.ghost", { onclick: () => setTheme({ ...DEFAULT_THEME }) }, t("settings.restoreOriginalColours")),
    ),
  );
}

/** Pages shown in the menu, start page and interface size (PC and phone). */
export function pagesCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const s = ctx.store.state.settings;
  const set = (patch: Partial<Settings>) => {
    ctx.store.updateSettings(patch);
    rerender();
  };
  const pages = NAV.filter((n) => n.id !== "-" && !ALWAYS_SHOWN.has(n.id) && !(isRemote() && n.id === "mobile"));
  const hidden = new Set(s.hiddenViews ?? []);
  return h(
    "section.card",
    { "data-tab": "display" },
    h("h3", null, t("settings.pagesDisplay")),
    h(
      "label.field",
      null,
      h("span", null, t("settings.interfaceSize")),
      h(
        "select",
        { onchange: (e: Event) => set({ uiScale: Number((e.target as HTMLSelectElement).value) }) },
        [80, 90, 100, 110, 125, 150].map((v) =>
          h("option", { value: String(v), selected: (s.uiScale || 100) === v }, `${v} %`),
        ),
      ),
    ),
    h("p.sub", null, t("settings.pagesShownMenuUntickOnesDon")),
    h(
      "div.page-toggles",
      null,
      pages.map((p) =>
        h(
          "label.check",
          null,
          h("input", {
            type: "checkbox",
            checked: !hidden.has(p.id),
            onchange: (e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              const next = new Set(ctx.store.state.settings.hiddenViews ?? []);
              if (on) next.delete(p.id);
              else next.add(p.id);
              set({ hiddenViews: [...next] });
            },
          }),
          " ",
          h("span", null, p.label),
        ),
      ),
    ),
    h("small.sub", null, t("settings.appliesPhoneTooSettingsAboutAlways")),
    isRemote()
      ? null
      : h(
          "div.row",
          null,
          h("button.ghost", { onclick: () => startMenuEdit(ctx.store) }, t("common.editMenu")),
          h("small.sub", null, t("settings.pageOrderGroupsPagesShownPhone")),
        ),
  );
}
