// Settings → General → Updates: the exact version installed (a pre-release says so), automatic
// checks, pre-releases, and an "Update available" button when GitHub has one for this build
// (checked quietly when the card is drawn, no notification).

import { t } from "../../../platform/i18n.js";
import { buildTag, isPreReleaseTag, SOFTWARE_VERSION } from "../../../platform/version.js";
import type { Ctx } from "../../../state/context.js";
import type { Settings } from "../../../state/store.js";
import { h, icon, replace } from "../../../ui/dom.js";
import { checkForUpdate, findUpdate, offerUpdate } from "../../../ui/updateBanner.js";

/** `updateMode`: "installer", "portable" or another platform (no self-install). */
export function updatesCard(ctx: Ctx, updateMode: string): HTMLElement {
  const settings = ctx.store.state.settings;
  const set = (patch: Partial<Settings>) => ctx.store.updateSettings(patch);
  const versionLine = h("p.sub", null, t("common.installedVersion", { current: SOFTWARE_VERSION }));
  const updateSlot = h("span.update-slot");
  void showInstalledVersion(versionLine);
  void showAvailableUpdate(updateSlot);
  const box = (checked: boolean, onChange: (on: boolean) => void, label: string) =>
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked,
        onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
      }),
      " " + label,
    );
  return h(
    "section.card",
    { "data-tab": "general" },
    h("h3", null, t("settings.updates")),
    versionLine,
    box(settings.autoUpdate, (on) => set({ autoUpdate: on }), t("settings.checkGithubNewVersionsAutomatically")),
    box(
      settings.updatePreReleases,
      (on) => {
        set({ updatePreReleases: on });
        // The offer changes with the choice (back to the latest release when unticked).
        void showAvailableUpdate(updateSlot);
      },
      t("settings.offerPreReleases"),
    ),
    h("small", null, t("settings.offerPreReleasesHelp")),
    updateMode === "portable"
      ? h("p.sub", null, t("settings.portableVersionUpdatesArenTInstalled"))
      : updateMode !== "installer"
        ? h("p.sub", null, t("settings.linuxUpdatesArenTInstalledAutomatically"))
        : null,
    h("div.row", null, h("button.ghost", { onclick: () => checkForUpdate(true) }, t("settings.checkNow")), updateSlot),
  );
}

/** "Installed version: 0.10.11-pre.83 (pre-release)" once the build's tag is known. */
async function showInstalledVersion(line: HTMLElement) {
  const tag = await buildTag();
  if (!tag) return;
  const version = tag.replace(/^v/i, "");
  replace(
    line,
    t("common.installedVersion", { current: version }) +
      (isPreReleaseTag(tag) ? ` (${t("settings.preReleaseBuild")})` : ""),
  );
}

/** Asks GitHub quietly; an update found becomes a button that opens the update banner. */
async function showAvailableUpdate(slot: HTMLElement) {
  replace(slot);
  try {
    const info = await findUpdate();
    if (!info) return;
    replace(
      slot,
      h(
        "button.primary",
        { onclick: () => offerUpdate(info) },
        icon("star"),
        " " + t("settings.updateAvailable", { version: info.version }),
      ),
    );
  } catch {
    /* no network: the button just doesn't show */
  }
}
