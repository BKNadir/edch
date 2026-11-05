import { copyText, isRemote, isTauri, remoteInterfaces, remoteQr, type NetAddress } from "../../platform/bridge.js";
import { h, icon, replace, toast } from "../../ui/dom.js";
import type { Ctx, View } from "../../state/context.js";
import { pairingHost, pairingUrl, remoteRunning, rotateToken, startRemote, stopRemote } from "../../services/remoteServer.js";
import { t } from "../../platform/i18n.js";

const KIND_LABEL: Record<NetAddress["kind"], string> = { ethernet: "Ethernet", wifi: "Wi-Fi", tailscale: "Tailscale", vpn: "VPN" };

/** "Mobile access": QR code to open EDCH on a phone/tablet through the PC's local server. */
export class MobileView implements View {
  private root?: HTMLElement;
  private body = h("div.settings");
  private error = "";

  constructor(private ctx: Ctx) {}

  async mount(root: HTMLElement) {
    this.root = root;
    replace(root, h("header.view-head", null, h("div", null, h("h1", null, t("common.remoteAccess")), h("p.sub", null, t("mobile.openEdchPhoneTabletAnotherScreen")))), this.body);
    await this.render();
  }

  update() {
    /* only changes on user action */
  }

  private async render() {
    if (!this.root) return;
    const store = this.ctx.store;
    if (isRemote()) {
      replace(this.body, h("section.card", null, h("h3", null, t("common.connected")), h("p", null, icon("check"), (" " + t("mobile.deviceConnectedEdchPcDataUpdates")))));
      return;
    }
    if (!isTauri()) {
      replace(this.body, h("section.card", null, h("p.sub", null, t("common.availableAppNotDemoMode"))));
      return;
    }
    const r = store.state.settings.remote;
    const set = (patch: Partial<typeof r>) => store.updateSettings({ remote: { ...store.state.settings.remote, ...patch } });
    const running = remoteRunning();
    const nets = await remoteInterfaces();
    const known = nets.map((n) => n.ip);
    const ts = nets.find((n) => n.kind === "tailscale")?.ip ?? null;

    const toggle = h("label.switch", null, h("input", {
      type: "checkbox",
      checked: r.enabled && Boolean(running),
      onchange: async (e: Event) => {
        const on = (e.target as HTMLInputElement).checked;
        set({ enabled: on });
        this.error = "";
        try {
          if (on) await startRemote(store);
          else await stopRemote();
        } catch (err) {
          this.error = String((err as Error).message ?? err);
          set({ enabled: false });
        }
        await this.render();
      },
    }), h("span"));

    const parts: HTMLElement[] = [
      h(
        "section.card",
        null,
        h("div.sync-head", null, h("div", null, h("h3", null, t("mobile.remoteAccessServer")), h("p.sub", null, t("mobile.offDefaultAlsoServesOpenBrowser"))), toggle),
        this.error ? h("p.error", null, icon("warn"), ` ${this.error}`) : null,
      ),
    ];

    if (running) {
      const url = pairingUrl(store, known.length ? known : undefined)!;
      const host = pairingHost(store, known.length ? known : running.addresses);
      const viaTailscale = nets.find((n) => n.ip === host)?.kind === "tailscale";
      const qr = h("div.qr", null, h("span.spinner"));
      remoteQr(url)
        .then((svg) => {
          qr.innerHTML = svg;
        })
        .catch((e) => replace(qr, h("p.error", null, String(e))));
      const options: NetAddress[] = nets.length ? nets : running.addresses.map((ip) => ({ ip, kind: "ethernet" as const, network: "", adapter: "" }));
      // "Wi-Fi (ASUS)": the network's name tells two connections apart; a VPN shows its adapter.
      const optionLabel = (n: NetAddress) => {
        const kind = KIND_LABEL[n.kind];
        const extra = n.kind === "tailscale" ? "" : n.network || (n.kind === "vpn" ? n.adapter : "");
        return `${kind}${extra ? ` (${extra})` : ""} · ${n.ip}`;
      };
      parts.push(
        h(
          "section.card.qr-card",
          null,
          qr,
          h(
            "div.qr-side",
            null,
            h("h3", null, t("mobile.scanCamera")),
            h(
              "ol.steps",
              null,
              viaTailscale
                ? h("li", null, t("mobile.turnTailscalePhoneSameAccountPc"))
                : h("li", null, t("mobile.connectPhoneSameWiFiPc")),
              h("li", null, t("mobile.scanQrCodeEdchOpensBrowser")),
              h("li", null, t("mobile.addPageHomeScreenOpenLike")),
            ),
            h(
              "div.pair-link",
              null,
              h("code", { "data-no-tr": "" }, url),
              h("button.ghost.small", { onclick: async () => toast((await copyText(url)) ? t("mobile.linkCopiedContainsSecretCodeOnly") : t("common.couldnTCopy")) }, icon("copy"), (" " + t("mobile.copyLink"))),
            ),
            h(
              "label.field",
              null,
              h("span", null, t("mobile.pcAddress")),
              h(
                "select",
                {
                  onchange: async (e: Event) => {
                    set({ host: (e.target as HTMLSelectElement).value });
                    await this.render();
                  },
                },
                options.map((n) => h("option", { value: n.ip, selected: n.ip === host, "data-no-tr": "" }, optionLabel(n))),
              ),
              h("small", null, t("mobile.pickConnectionPhoneUsesReachPc")),
            ),
            h(
              "label.field",
              null,
              h("span", null, t("mobile.port")),
              h("input", {
                type: "number",
                min: "1024",
                max: "65535",
                value: String(r.port),
                onchange: async (e: Event) => {
                  const port = Number((e.target as HTMLInputElement).value) || 47800;
                  set({ port });
                  try {
                    await startRemote(store);
                    this.error = "";
                  } catch (err) {
                    this.error = String((err as Error).message ?? err);
                  }
                  await this.render();
                },
              }),
            ),
            h(
              "div.row",
              null,
              h(
                "button.ghost",
                {
                  onclick: async () => {
                    await rotateToken(store);
                    toast(t("mobile.newCodeConnectedDevicesMustScan"));
                    await this.render();
                  },
                },
                t("mobile.newCode"),
              ),
            ),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, t("mobile.goodKnow")),
          h(
            "ul.notes",
            null,
            h("li", null, t("mobile.windowsMayAskAllowEdchThrough")),
            h("li", null, t("mobile.newCodeDisconnectsEveryDeviceAlready")),
            h("li", null, t("mobile.localConnectionIsnTEncryptedHttp")),
            h("li", null, t("mobile.linkContainsSecretCodeLikeQr")),
            h("li", null, t("mobile.phoneWishlistCanEditedSyncsPc")),
          ),
        ),
        h(
          "section.card.away",
          null,
          h(
            "div.sync-head",
            null,
            h("div", null, h("h3", null, t("mobile.accessAwayFromHome")), h("p.sub", null, t("mobile.tailscaleEncryptedPrivateNetworkBetweenOwn"))),
            h("button.ghost", { onclick: () => this.ctx.store.setView("guide-remote") }, t("mobile.stepStepGuide")),
          ),
          ts
            ? h("p.sub", null, t("mobile.tailscaleRunningPcUsePickTailscale", { ts }))
            : h("p.sub", null, t("mobile.tailscaleIsnTDetectedPcFollow")),
        ),
      );
    }
    replace(this.body, parts);
  }
}
