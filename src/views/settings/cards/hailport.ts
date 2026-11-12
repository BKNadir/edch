// Settings → General: the link to Hailport, the voice assistant on this PC (switch, port, where
// the link stands). Not shown in builds without Hailport (the portable exe), nor on a phone.

import { t } from "../../../platform/i18n.js";
import type { HailportState } from "../../../services/hailport/client.js";
import {
  hailportOffered,
  hailportReconnect,
  hailportState,
  onHailportState,
} from "../../../services/hailport/status.js";
import type { Ctx } from "../../../state/context.js";
import {
  DEFAULT_HAILPORT_PORT,
  type HailportSettings,
  saveHailportToken,
  validHailportPort,
} from "../../../state/hailportSettings.js";
import { h, replace } from "../../../ui/dom.js";

/** What each state means for the user. */
function stateText(state: HailportState, enabled: boolean): string {
  if (!enabled) return t("hailportSettings.stateOff");
  switch (state) {
    case "connected":
      return t("hailportSettings.stateConnected");
    case "approval":
      return t("hailportSettings.stateApproval");
    case "refused":
      return t("hailportSettings.stateRefused");
    case "removed":
      return t("hailportSettings.stateRemoved");
    case "outdated":
      return t("hailportSettings.stateOutdated");
    default:
      return t("hailportSettings.stateConnecting");
  }
}

/** The card, or null when this build doesn't offer Hailport. */
export function hailportCard(ctx: Ctx, rerender: () => void): HTMLElement | null {
  if (!hailportOffered()) return null;
  const store = ctx.store;
  const settings = store.state.settings.hailport;
  const set = (patch: Partial<HailportSettings>) =>
    store.updateSettings({ hailport: { ...store.state.settings.hailport, ...patch } });

  const status = h("p.hailport-state");
  const drawState = (state: HailportState) => {
    const enabled = store.state.settings.hailport.enabled;
    status.className = `hailport-state ${enabled ? state : "off"}`;
    const again =
      enabled && (state === "refused" || state === "removed")
        ? h("button.ghost.small", { onclick: () => hailportReconnect() }, t("hailportSettings.connectAgain"))
        : null;
    replace(status, h("span.dot"), " " + stateText(state, enabled), again ? " " : null, again);
  };
  drawState(hailportState());
  const stopFollowing = onHailportState((state) => {
    // The card was redrawn or left: stop following.
    if (!status.isConnected) stopFollowing();
    else drawState(state);
  });

  return h(
    "section.card",
    { "data-tab": "general" },
    h("h3", null, t("hailportSettings.title")),
    h("p.sub", null, t("hailportSettings.intro")),
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: settings.enabled,
        onchange: (e: Event) => {
          set({ enabled: (e.target as HTMLInputElement).checked });
          rerender();
        },
      }),
      " " + t("hailportSettings.enable"),
    ),
    h(
      "label.field",
      null,
      h("span", null, t("hailportSettings.port")),
      h("input", {
        type: "number",
        min: "1024",
        max: "65535",
        step: "1",
        value: String(settings.port),
        onchange: (e: Event) => {
          const input = e.target as HTMLInputElement;
          const port = validHailportPort(input.value);
          input.value = String(port);
          set({ port });
        },
      }),
      h("small", null, t("hailportSettings.portHelp", { port: DEFAULT_HAILPORT_PORT })),
    ),
    status,
    h("p.sub", null, t("hailportSettings.privacy")),
    h(
      "div.row",
      null,
      h(
        "button.ghost",
        {
          title: t("hailportSettings.forgetHelp"),
          onclick: () => {
            saveHailportToken(null);
            hailportReconnect();
          },
        },
        t("hailportSettings.forget"),
      ),
    ),
  );
}
