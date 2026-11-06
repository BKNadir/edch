// Settings → Game and search: how the game is launched, and the Navigation and Engineers options.

import { t } from "../../../platform/i18n.js";
import type { Ctx } from "../../../state/context.js";
import type { Settings, WishlistMode } from "../../../state/store.js";
import { startGame } from "../../../ui/desktop.js";
import { h } from "../../../ui/dom.js";

export function navigationCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const store = ctx.store;
  const s = store.state.settings;
  const box = (checked: boolean, onchange: (on: boolean) => void, label: string) =>
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked,
        onchange: (ev: Event) => onchange((ev.target as HTMLInputElement).checked),
      }),
      ` ${label}`,
    );
  return h(
    "section.card",
    { "data-tab": "game" },
    h("h3", null, t("common.navigation")),
    h("p.sub", null, t("settings.nextSystemCopiedPcSClipboard")),
    box(s.navAutoCopy, (on) => store.updateSettings({ navAutoCopy: on }), t("settings.copyNextJumpAutomaticallyWhenI")),
    box(s.navNotifyCopy, (on) => store.updateSettings({ navNotifyCopy: on }), t("settings.notifyMeWhenNextJumpCopied")),
    box(
      s.copyOnGameFocus,
      (on) => store.updateSettings({ copyOnGameFocus: on }),
      t("settings.copyNextSystemOnGameFocus"),
    ),
  );
}

export function engineersCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const store = ctx.store;
  const e = store.state.settings.engineers;
  const set = (patch: Partial<typeof e>) =>
    store.updateSettings({ engineers: { ...store.state.settings.engineers, ...patch } });
  const check = (key: "autoPick" | "knownOnly" | "regionLimit" | "autoTick", label: string) =>
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: e[key],
        onchange: (ev: Event) => set({ [key]: (ev.target as HTMLInputElement).checked }),
      }),
      ` ${label}`,
    );
  return h(
    "section.card",
    { "data-tab": "game" },
    h("h3", null, t("common.engineers")),
    h("p.sub", null, t("settings.wishlistEngineerTour")),
    check("autoPick", t("settings.pickNearestEngineerEachWishlistLine")),
    check("knownOnly", t("settings.onlyEngineersAlreadyKnowMetInvited")),
    check("regionLimit", t("settings.stayMyRegionNoColoniaEngineers")),
    h(
      "label.field",
      null,
      h("span", null, t("settings.maxTourDistanceLy")),
      h("input", {
        type: "number",
        min: "100",
        max: "50000",
        step: "100",
        value: String(e.maxTourLy),
        onchange: (ev: Event) =>
          set({ maxTourLy: Math.max(100, Number((ev.target as HTMLInputElement).value) || 2000) }),
      }),
      h("small", null, t("settings.totalStraightLineDistanceBetweenStops")),
    ),
    check("autoTick", t("settings.moveWishlistItselfWhenGameApplies")),
    h(
      "label.field",
      null,
      h("span", null, t("settings.wishlistOpensIn")),
      h(
        "select",
        {
          onchange: (ev: Event) => set({ wishlistMode: (ev.target as HTMLSelectElement).value as WishlistMode }),
        },
        (
          [
            ["advanced", t("wishlist.modeAdvanced")],
            ["simple", t("wishlist.modeSimple")],
          ] as [WishlistMode, string][]
        ).map(([mode, label]) => h("option", { value: mode, selected: e.wishlistMode === mode }, label)),
      ),
      h("small", null, t("wishlist.modeHelp")),
    ),
  );
}

/** How EDCH starts the game (button in the top bar). */
export function launchCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const g = ctx.store.state.settings.gameLaunch;
  const set = (patch: Partial<Settings["gameLaunch"]>) => {
    ctx.store.updateSettings({ gameLaunch: { ...ctx.store.state.settings.gameLaunch, ...patch } });
    rerender();
  };
  const methods: [Settings["gameLaunch"]["method"], string][] = [
    ["steam", "Steam"],
    ["epic", t("settings.epicGames")],
    ["exe", t("settings.launcherChoiceFrontierMinedlauncher")],
  ];
  return h(
    "section.card",
    { "data-tab": "game" },
    h("h3", null, t("common.launchEliteDangerous")),
    h("p.sub", null, t("settings.launchEliteButtonTopScreenStarts")),
    h(
      "label.field",
      null,
      h("span", null, t("settings.launch")),
      h(
        "select",
        {
          onchange: (e: Event) =>
            set({ method: (e.target as HTMLSelectElement).value as Settings["gameLaunch"]["method"] }),
        },
        methods.map(([v, l]) => h("option", { value: v, selected: g.method === v }, l)),
      ),
    ),
    g.method === "exe"
      ? h(
          "label.field.wide",
          null,
          h("span", null, t("settings.launcherPath")),
          h("input", {
            type: "text",
            value: g.path,
            placeholder: "C:\\Program Files (x86)\\Frontier\\EDLaunch\\EDLaunch.exe",
            spellcheck: false,
            onchange: (e: Event) => set({ path: (e.target as HTMLInputElement).value.trim() }),
          }),
          h("small", null, t("settings.exeLnkShortcutMinedlauncherTipRight")),
        )
      : null,
    h("div.row", null, h("button.ghost", { onclick: () => startGame() }, t("settings.launchNow"))),
  );
}
