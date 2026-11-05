// Settings → Notifications: sounds and the side tab, per kind of event.

import { isRemote } from "../../../platform/bridge.js";
import { t } from "../../../platform/i18n.js";
import type { Ctx } from "../../../state/context.js";
import type { NotifySettings } from "../../../state/store.js";
import { h } from "../../../ui/dom.js";
import { notify, playTone, TONES } from "../../../ui/notifier.js";

export function notifyCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const store = ctx.store;
  const n = store.state.settings.notify;
  const set = (patch: Partial<NotifySettings>) =>
    store.updateSettings({ notify: { ...store.state.settings.notify, ...patch } });
  const wingCheck = (key: "notifyNew" | "notifyAccept" | "notifyAll" | "notifyLeave", label: string) =>
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: store.state.settings.wing[key],
        onchange: (e: Event) =>
          store.updateSettings({
            wing: { ...store.state.settings.wing, [key]: (e.target as HTMLInputElement).checked },
          }),
      }),
      ` ${label}`,
    );
  return h(
    "section.card",
    { "data-tab": "notifications" },
    h("h3", null, t("common.notifications")),
    h("p.sub", null, t("settings.noWindowsPopUpSoundNotifications")),
    h(
      "div.notify-form",
      null,
      h(
        "label.check",
        null,
        h("input", {
          type: "checkbox",
          checked: n.sound,
          onchange: (e: Event) => set({ sound: (e.target as HTMLInputElement).checked }),
        }),
        " " + t("settings.sound"),
      ),
      h(
        "select",
        { "data-no-tr": "", onchange: (e: Event) => set({ tone: (e.target as HTMLSelectElement).value }) },
        TONES.map(([v, l]) => h("option", { value: v, selected: v === n.tone }, l)),
      ),
      h("input", {
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: String(n.volume),
        title: t("settings.volume"),
        onchange: (e: Event) => set({ volume: Number((e.target as HTMLInputElement).value) }),
      }),
      h(
        "button.ghost.small",
        { onclick: () => playTone(store.state.settings.notify.tone, store.state.settings.notify.volume) },
        t("settings.listen"),
      ),
    ),
    h(
      "div.notify-form",
      null,
      h(
        "label.check",
        null,
        h("input", {
          type: "checkbox",
          checked: n.color,
          onchange: (e: Event) => set({ color: (e.target as HTMLInputElement).checked }),
        }),
        " " + t("settings.colour"),
      ),
      h("input", {
        type: "color",
        value: n.flash,
        onchange: (e: Event) => set({ flash: (e.target as HTMLInputElement).value }),
      }),
      h("button.ghost.small", { onclick: () => notify(t("settings.testNotification")) }, t("settings.test")),
    ),
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: n.hideTab,
        onchange: (e: Event) => set({ hideTab: (e.target as HTMLInputElement).checked }),
      }),
      " " + t("settings.hideTabSoundStaysIfTicked"),
    ),
    h("h4.settings-sub", null, t("common.wing")),
    isRemote()
      ? h("p.sub", null, t("settings.theseAreSetPcTheyGo"))
      : [
          wingCheck("notifyNew", t("settings.notifyMeWhenMemberHasWing")),
          wingCheck("notifyAccept", t("settings.notifyMeWhenMemberAcceptsMission")),
          wingCheck("notifyAll", t("settings.notifyMeWhenWholeWingHas")),
          wingCheck("notifyLeave", t("settings.tellMeWhenMemberClosesEdch")),
        ],
    h("h4.settings-sub", null, t("common.mining")),
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: store.state.settings.mining.alert,
        onchange: (e: Event) =>
          store.updateSettings({
            mining: { ...store.state.settings.mining, alert: (e.target as HTMLInputElement).checked },
          }),
      }),
      " " + t("settings.tellMeWhenProspectorFindsTarget"),
    ),
    h("small.sub", null, t("settings.targetsTheirPercentagesAreChosenMining")),
    h("h4.settings-sub", null, t("settings.application")),
    h("p.sub", null, t("settings.newVersionsStartUpProblemsAlso")),
  );
}
