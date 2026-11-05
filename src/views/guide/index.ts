import { openUrl } from "../../platform/bridge.js";
import { callout, h, icon, replace } from "../../ui/dom.js";
import type { Ctx, View } from "../../state/context.js";
import { t } from "../../platform/i18n.js";

/** Step-by-step guide: reaching EDCH from outside the home network with Tailscale. */
export class RemoteGuideView implements View {
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    const step = (n: number, title: string, ...body: (Node | string | null)[]) =>
      h("li.guide-step", null, h("span.guide-num", null, String(n)), h("div", null, h("strong", null, title), ...body));
    replace(
      root,
      h(
        "header.view-head",
        null,
        h(
          "div",
          null,
          h("h1", null, t("guide.usingEdchAwayFromHome")),
          h("p.sub", null, t("guide.stepStepGuideTailscale")),
        ),
        h("button.ghost", { onclick: () => this.ctx.store.setView("mobile") }, t("guide.backRemoteAccess")),
      ),
      h(
        "div.guide",
        null,
        callout("danger", t("guide.readFirst"), t("guide.edchDesignedUsedHomeNetworkGoing")),
        h(
          "section.card",
          null,
          h("h3", null, t("guide.whenUseful")),
          h(
            "ul.notes",
            null,
            h(
              "li",
              null,
              h("strong", null, t("guide.awayFromPc") + " "),
              t("guide.travellingWorkFollowMissionsWishlistWing"),
            ),
            h("li", null, h("strong", null, t("guide.publicWiFi") + " "), t("guide.hotelStationCafeEdchSLocal")),
            h("li", null, h("strong", null, t("guide.cloudGaming") + " "), t("guide.ifEliteDangerousEdchRunRemote")),
            h(
              "li",
              null,
              h("strong", null, t("guide.separateNetworksHome") + " "),
              t("guide.guestWiFiRepeaterSecondRouter"),
            ),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, t("guide.whatTailscale")),
          h("p", null, t("guide.privateNetworkBetweenOwnDevicesEach")),
        ),
        h(
          "section.card",
          null,
          h("h3", null, t("guide.setup10Minutes")),
          h(
            "ol.guide-steps",
            null,
            step(
              1,
              t("guide.createTailscaleAccount"),
              h("p", null, t("guide.tailscaleComGoogleMicrosoftAppleGithub")),
              h(
                "button.ghost.small",
                { onclick: () => openUrl("https://tailscale.com/download") },
                icon("link"),
                " tailscale.com/download",
              ),
            ),
            step(
              2,
              t("guide.installTailscalePcRunningEdch"),
              h("p", null, t("guide.downloadWindowsVersionRunSignTailscale")),
            ),
            step(3, t("guide.installTailscalePhone"), h("p", null, t("guide.fromPlayStoreAppStoreSign"))),
            step(4, t("guide.pickTailscaleAddressEdch"), h("p", null, t("guide.remoteAccessPageTurnRemoteAccess"))),
            step(5, t("guide.scanQrCode"), h("p", null, t("guide.tailscaleTurnedPhoneDoneEdchOpens"))),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, t("guide.notWorking")),
          h(
            "ul.notes",
            null,
            h(
              "li",
              null,
              h("strong", null, t("guide.tailscaleIsnTDetected") + " "),
              t("guide.checkTailscaleConnectedPcThenReopen"),
            ),
            h(
              "li",
              null,
              h("strong", null, t("guide.phoneDoesnTConnect") + " "),
              t("guide.checkTailscalePhoneWindowsOpenWindows"),
            ),
            h(
              "li",
              null,
              h("strong", null, t("guide.qrCodeShows192168Address") + " "),
              t("guide.wiFiEthernetAddressSelectedPick"),
            ),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, t("common.security")),
          h(
            "ul.notes",
            null,
            h("li", null, t("guide.neverShareQrCodeLinkThey")),
            h("li", null, t("guide.donTGiveOtherPeopleAccess")),
            h("li", null, t("guide.cutAccessUntickOptionTurnRemote")),
          ),
        ),
      ),
    );
  }

  update() {
    /* static page */
  }
}
