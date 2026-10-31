import { isRemote, isTauri, remoteQr } from "../bridge.js";
import { h, icon, replace, toast } from "../dom.js";
import type { Ctx, View } from "../context.js";
import { pairingUrl, remoteRunning, rotateToken, startRemote, stopRemote } from "../remote.js";

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
              h("li", null, "Connecte le téléphone au même Wi-Fi que ce PC."),
              h("li", null, "Scanne le QR code : EDCH s'ouvre dans le navigateur et l'appareil reste autorisé."),
              h("li", null, "Ajoute la page à l'écran d'accueil pour l'ouvrir comme une appli."),
            ),
            h(
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
          "section.card",
          null,
          h("h3", null, "Bon à savoir"),
          h(
            "ul.notes",
            null,
            h("li", null, "Windows peut demander d'autoriser EDCH sur le pare-feu : accepte pour les réseaux privés."),
            h("li", null, "« Nouveau code » déconnecte tous les appareils déjà autorisés."),
            h("li", null, "La connexion locale n'est pas chiffrée (HTTP) : utilise-la sur ton réseau domestique, pas sur un Wi-Fi public."),
            h("li", null, "Sur le téléphone, la wishlist se modifie et se synchronise avec le PC. Les exports, imports et la synchro EDDN restent sur le PC."),
          ),
        ),
      );
    }
    replace(this.body, parts);
  }
}
