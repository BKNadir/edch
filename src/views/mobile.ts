import { copyText, isRemote, isTauri, remoteQr } from "../bridge.js";
import { h, icon, replace, toast } from "../dom.js";
import type { Ctx, View } from "../context.js";
import { detectTailscale, pairingUrl, remoteRunning, rotateToken, startRemote, stopRemote, tailscaleAddress } from "../remote.js";

/** "Mobile access": QR code to open EDCH on a phone/tablet through the PC's local server. */
export class MobileView implements View {
  private root?: HTMLElement;
  private body = h("div.settings");
  private error = "";

  constructor(private ctx: Ctx) {}

  async mount(root: HTMLElement) {
    this.root = root;
    replace(root, h("header.view-head", null, h("div", null, h("h1", null, "Accès mobile"), h("p.sub", null, "Ouvre EDCH sur ton téléphone ou ta tablette, sur le même réseau que ce PC."))), this.body);
    await this.render();
  }

  update() {
    /* only changes on user action */
  }

  private async render() {
    if (!this.root) return;
    const store = this.ctx.store;
    if (isRemote()) {
      replace(this.body, h("section.card", null, h("h3", null, "Connecté"), h("p", null, icon("check"), " Cet appareil est connecté à EDCH sur ton PC. Les données se mettent à jour toutes seules.")));
      return;
    }
    if (!isTauri()) {
      replace(this.body, h("section.card", null, h("p.sub", null, "Disponible dans l'application (pas en mode démo).")));
      return;
    }
    const r = store.state.settings.remote;
    const set = (patch: Partial<typeof r>) => store.updateSettings({ remote: { ...store.state.settings.remote, ...patch } });
    const running = remoteRunning();
    await detectTailscale();
    const ts = tailscaleAddress();
    const viaTailscale = r.tailscale && Boolean(ts);

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
        h("div.sync-head", null, h("div", null, h("h3", null, "Serveur local"), h("p.sub", null, "Désactivé par défaut. Seuls les appareils qui ont scanné le QR code peuvent ouvrir la page : connaître l'adresse du PC ne suffit pas.")), toggle),
        this.error ? h("p.error", null, icon("warn"), ` ${this.error}`) : null,
      ),
    ];

    if (running) {
      const url = pairingUrl(store)!;
      const qr = h("div.qr", null, h("span.spinner"));
      remoteQr(url)
        .then((svg) => {
          qr.innerHTML = svg;
        })
        .catch((e) => replace(qr, h("p.error", null, String(e))));
      const hostOptions = [...new Set([...(r.host ? [r.host] : []), ...running.addresses])];
      parts.push(
        h(
          "section.card.qr-card",
          null,
          qr,
          h(
            "div.qr-side",
            null,
            h("h3", null, "Scanne avec l'appareil photo"),
            h(
              "ol.steps",
              null,
              viaTailscale
                ? h("li", null, "Active Tailscale sur le téléphone (même compte que sur ce PC). Wi-Fi ou données mobiles, peu importe.")
                : h("li", null, "Connecte le téléphone au même Wi-Fi que ce PC."),
              h("li", null, "Scanne le QR code : EDCH s'ouvre dans le navigateur et l'appareil reste autorisé."),
              h("li", null, "Ajoute la page à l'écran d'accueil pour l'ouvrir comme une appli."),
            ),
            h(
              "div.pair-link",
              null,
              h("code", { "data-no-tr": "" }, url),
              h("button.ghost.small", { onclick: async () => toast((await copyText(url)) ? "Lien copié : il contient le code secret, ne le partage qu'avec tes appareils" : "Copie impossible") }, icon("copy"), " Copier le lien"),
            ),
            viaTailscale
              ? h("p.ok", null, `Adresse Tailscale : ${ts}`)
              : h(
              "label.field",
              null,
              h("span", null, "Adresse du PC"),
              h(
                "select",
                {
                  onchange: async (e: Event) => {
                    set({ host: (e.target as HTMLSelectElement).value });
                    await this.render();
                  },
                },
                hostOptions.map((a) => h("option", { value: a, selected: a === (r.host || running.addresses[0]) }, a)),
              ),
              h("small", null, "Si le téléphone n'arrive pas à se connecter, essaie une autre adresse (VPN ou carte réseau virtuelle)."),
                ),
            h(
              "label.field",
              null,
              h("span", null, "Port"),
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
                    toast("Nouveau code : les appareils connectés doivent rescanner");
                    await this.render();
                  },
                },
                "Nouveau code",
              ),
            ),
          ),
        ),
        h(
          "section.card.away",
          null,
          h(
            "div.sync-head",
            null,
            h("div", null, h("h3", null, "Accès hors de chez moi"), h("p.sub", null, "Avec Tailscale, un réseau privé chiffré entre tes propres appareils, gratuit pour un usage personnel.")),
            h("button.ghost", { onclick: () => this.ctx.store.setView("guide-remote") }, "Guide pas à pas"),
          ),
          h(
            "label.check",
            { class: ts ? "" : "disabled" },
            h("input", {
              type: "checkbox",
              checked: r.tailscale,
              disabled: !ts && !r.tailscale,
              onchange: async (e: Event) => {
                set({ tailscale: (e.target as HTMLInputElement).checked });
                await this.render();
              },
            }),
            " Utiliser l'adresse Tailscale dans le QR code et le lien",
          ),
          ts
            ? h("p.sub", null, `Tailscale est actif sur ce PC (${ts}).`)
            : h("p.sub", null, "Tailscale n'est pas détecté sur ce PC. Suis le guide pour l'installer, puis reviens sur cette page."),
          r.tailscale && !ts ? h("p.warn", null, "Option cochée mais Tailscale n'est pas actif : le QR code utilise l'adresse locale.") : null,
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Bon à savoir"),
          h(
            "ul.notes",
            null,
            h("li", null, "Windows peut demander d'autoriser EDCH sur le pare-feu : accepte pour les réseaux privés."),
            h("li", null, "« Nouveau code » déconnecte tous les appareils déjà autorisés."),
            h("li", null, "La connexion locale n'est pas chiffrée (HTTP) : utilise-la sur ton réseau domestique, pas sur un Wi-Fi public. Hors de chez toi ou sur un Wi-Fi public, passe par Tailscale (chiffré)."),
            h("li", null, "Le lien contient le code secret, comme le QR code : ne le partage qu'avec tes propres appareils."),
            h("li", null, "Sur le téléphone, la wishlist se modifie et se synchronise avec le PC. Les exports, imports et la synchro EDDN restent sur le PC."),
          ),
        ),
      );
    }
    replace(this.body, parts);
  }
}
