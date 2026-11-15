// The share mode switch (top bar and Sync page): what EDCH shares with EDDN, EDSM and Inara.
// Invisible (the default at start-up) shares nothing while EDCH still reads all public data;
// Normal shares everything the enabled services take, and asks before switching to it.

import { t } from "../../platform/i18n.js";
import type { Store } from "../../state/store.js";
import type { ShareMode } from "../../state/syncSettings.js";
import { dialog } from "../../ui/dialog.js";
import { h, icon } from "../../ui/dom.js";

/** The modes in the switch's order, with their label and tooltip. */
const MODES: { mode: ShareMode; label: () => string; help: () => string }[] = [
  { mode: "normal", label: () => t("shareMode.normal"), help: () => t("shareMode.normalHelp") },
  { mode: "invisible", label: () => t("shareMode.invisible"), help: () => t("shareMode.invisibleHelp") },
];

/** Sets the share mode (saved with the Sync settings). */
export function setShareMode(store: Store, mode: ShareMode) {
  const sync = store.state.settings.sync;
  if (sync.shareMode === mode) return;
  store.updateSettings({ sync: { ...sync, shareMode: mode } });
}

/** Switches to `mode`; going to Normal (sharing starts) is confirmed first. */
export async function chooseShareMode(store: Store, mode: ShareMode) {
  if (mode === store.state.settings.sync.shareMode) return;
  if (mode === "normal") {
    const answer = await dialog(
      t("shareMode.confirmTitle"),
      [h("p", null, t("shareMode.confirmText"))],
      [
        { label: t("common.cancel"), value: "" },
        { label: t("shareMode.confirmButton"), primary: true, value: "ok" },
      ],
    );
    if (answer !== "ok") return;
  }
  setShareMode(store, mode);
}

/** The two-way switch; `compact` for the top bar (the active mode's icon only stands out). */
export function shareModeSwitch(store: Store, compact = false): HTMLElement {
  const current = store.state.settings.sync.shareMode;
  return h(
    "div.share-mode",
    { class: `${current}${compact ? " compact" : ""}`, role: "radiogroup", "aria-label": t("shareMode.title") },
    current === "normal" ? icon("eye") : icon("eyeOff"),
    MODES.map(({ mode, label, help }) =>
      h(
        "button.share-mode-option",
        {
          class: mode === current ? "on" : "",
          role: "radio",
          "aria-checked": String(mode === current),
          title: help(),
          onclick: () => void chooseShareMode(store, mode),
        },
        label(),
      ),
    ),
  );
}
