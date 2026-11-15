// Settings → General: application behaviour (closing the window, the share mode at start-up,
// what's new after an update…).

import { t } from "../../../platform/i18n.js";
import type { Ctx } from "../../../state/context.js";
import type { Settings } from "../../../state/store.js";
import type { StartShareMode } from "../../../state/syncSettings.js";
import { showChangelog } from "../../../ui/changelog.js";
import { h } from "../../../ui/dom.js";

/** Window behaviour and what's new after an update (PC). */
export function appCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const s = ctx.store.state.settings;
  const set = (patch: Partial<Settings>) => ctx.store.updateSettings(patch);
  const START_MODES: [StartShareMode, string][] = [
    ["invisible", t("shareMode.startInvisible")],
    ["normal", t("shareMode.startNormal")],
    ["last", t("shareMode.startLast")],
  ];
  const options: [Settings["closeBehavior"], string][] = [
    ["quit", t("settings.quitEdch")],
    ["minimize", t("settings.minimiseTaskbar")],
    ["tray", t("settings.hideNotificationAreaNextClock")],
    ["ask", t("settings.askBeforeQuitting")],
  ];
  return h(
    "section.card",
    { "data-tab": "general" },
    h("h3", null, t("settings.application")),
    h(
      "label.field",
      null,
      h("span", null, t("settings.windowSCloseButton")),
      h(
        "select",
        {
          onchange: (e: Event) =>
            set({ closeBehavior: (e.target as HTMLSelectElement).value as Settings["closeBehavior"] }),
        },
        options.map(([v, l]) => h("option", { value: v, selected: s.closeBehavior === v }, l)),
      ),
      h("small", null, t("settings.hiddenNotificationAreaEdchKeepsReading")),
    ),
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: s.showChangelog,
        onchange: (e: Event) => set({ showChangelog: (e.target as HTMLInputElement).checked }),
      }),
      " " + t("settings.showWhatSNewAfterUpdate"),
    ),
    h(
      "label.field",
      null,
      h("span", null, t("shareMode.startTitle")),
      h(
        "select",
        {
          onchange: (e: Event) =>
            set({
              sync: {
                ...ctx.store.state.settings.sync,
                startShareMode: (e.target as HTMLSelectElement).value as StartShareMode,
              },
            }),
        },
        START_MODES.map(([v, l]) => h("option", { value: v, selected: s.sync.startShareMode === v }, l)),
      ),
      h("small", null, t("shareMode.startHelp")),
    ),
    h("div.row", null, h("button.ghost", { onclick: () => showChangelog() }, t("settings.seeWhatSNewVersion"))),
    h("p.sub", null, t("settings.edchOnlyOpensOnceLaunchingAgain")),
  );
}
