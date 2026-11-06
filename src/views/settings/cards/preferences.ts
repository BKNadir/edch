// Settings → Preferences: how EDCH looks and behaves for you (language, start page, default
// views, keyboard, build site). The Spansh search card also shows in this tab (index.ts).

import { BUILD_SITE_NAMES, type BuildSite } from "../../../features/materials/buildExporter.js";
import { isRemote } from "../../../platform/bridge.js";
import { lang, LANGS, saveLang, t } from "../../../platform/i18n.js";
import type { Ctx } from "../../../state/context.js";
import type { Settings, WishlistMode } from "../../../state/store.js";
import { h } from "../../../ui/dom.js";
import { ALWAYS_SHOWN, NAV } from "../../../ui/menu/pages.js";

/** A labelled drop-down list: `options` are [value, label]; `onChange` gets the value picked. */
function choice<T extends string>(
  label: string,
  value: T,
  options: [T, string][],
  onChange: (value: T) => void,
  help?: string,
): HTMLElement {
  return h(
    "label.field",
    null,
    h("span", null, label),
    h(
      "select",
      { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) },
      options.map(([optionValue, optionLabel]) =>
        h("option", { value: optionValue, selected: optionValue === value }, optionLabel),
      ),
    ),
    help ? h("small", null, help) : null,
  );
}

/** Interface language (the page reloads) and the page EDCH opens on. */
export function languageCard(ctx: Ctx): HTMLElement {
  const settings = ctx.store.state.settings;
  const hidden = new Set(settings.hiddenViews ?? []);
  const pages = NAV.filter(
    (page) =>
      page.id !== "-" && !ALWAYS_SHOWN.has(page.id) && !hidden.has(page.id) && !(isRemote() && page.id === "mobile"),
  );
  return h(
    "section.card",
    { "data-tab": "preferences" },
    h("h3", null, t("settings.languageAndStart")),
    isRemote()
      ? null
      : h(
          "label.field",
          null,
          h("span", null, t("settings.interfaceLanguage")),
          h(
            "select",
            {
              "data-no-tr": "",
              onchange: (e: Event) => {
                saveLang((e.target as HTMLSelectElement).value);
                location.reload();
              },
            },
            LANGS.map((language) =>
              h("option", { value: language.code, selected: language.code === lang().code }, language.label),
            ),
          ),
          h("small", null, t("settings.materialModuleEffectNamesFollowGame")),
        ),
    choice(
      t("settings.startPage"),
      settings.startView,
      [["", t("settings.lastPageOpened")], ...pages.map((page): [string, string] => [page.id, page.label])],
      (startView) => ctx.store.updateSettings({ startView }),
    ),
  );
}

/** How some pages open: Wishlist mode, Navigation route type, a click on a system. */
export function pageDefaultsCard(ctx: Ctx): HTMLElement {
  const settings = ctx.store.state.settings;
  const set = (patch: Partial<Settings>) => ctx.store.updateSettings(patch);
  return h(
    "section.card",
    { "data-tab": "preferences" },
    h("h3", null, t("settings.pageDefaults")),
    choice<WishlistMode>(
      t("settings.wishlistOpensIn"),
      settings.engineers.wishlistMode,
      [
        ["advanced", t("wishlist.modeAdvanced")],
        ["simple", t("wishlist.modeSimple")],
      ],
      (wishlistMode) => set({ engineers: { ...ctx.store.state.settings.engineers, wishlistMode } }),
      t("wishlist.modeHelp"),
    ),
    choice(
      t("settings.navigationRouteType"),
      settings.navExact ? "exact" : "neutron",
      [
        ["exact", t("navigation.exactFuel")],
        ["neutron", t("navigation.quickNeutrons")],
      ],
      (route) => set({ navExact: route === "exact" }),
    ),
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: settings.systemOpensNav,
        onchange: (e: Event) => set({ systemOpensNav: (e.target as HTMLInputElement).checked }),
      }),
      " " + t("settings.clickingSystemAlsoOpensNavigationSystem"),
    ),
    h("small.sub", null, t("settings.nameAlwaysCopiedPcSClipboard")),
  );
}

/** The keyboard drawn on the Controls page ("auto": from the interface language). */
export function keyboardCard(ctx: Ctx): HTMLElement {
  const settings = ctx.store.state.settings;
  return h(
    "section.card",
    { "data-tab": "preferences" },
    h("h3", null, t("settings.controlsKeyboard")),
    choice<Settings["kbLayout"]>(
      t("controls.myKeyboard"),
      settings.kbLayout,
      [
        ["auto", t("settings.automatic")],
        ["azerty", "AZERTY"],
        ["qwerty", "QWERTY"],
        ["qwertz", "QWERTZ"],
      ],
      (kbLayout) => ctx.store.updateSettings({ kbLayout }),
    ),
    choice<Settings["kbFormat"]>(
      t("settings.keyboardFormat"),
      settings.kbFormat,
      [
        ["auto", t("settings.automatic")],
        ["iso", "ISO"],
        ["ansi", "ANSI"],
      ],
      (kbFormat) => ctx.store.updateSettings({ kbFormat }),
      t("controls.isoLShapedEnterKeyOne"),
    ),
  );
}

/** The site "Export my ship" opens the current ship in. */
export function buildSiteCard(ctx: Ctx): HTMLElement {
  const sites = Object.entries(BUILD_SITE_NAMES) as [BuildSite, string][];
  return h(
    "section.card",
    { "data-tab": "preferences" },
    h("h3", null, t("settings.buildExport")),
    choice<BuildSite>(
      t("settings.preferredBuildSite"),
      ctx.store.state.settings.buildSite,
      sites,
      (buildSite) => ctx.store.updateSettings({ buildSite }),
      t("settings.preferredBuildSiteHelp"),
    ),
  );
}
