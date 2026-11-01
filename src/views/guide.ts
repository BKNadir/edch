import { openUrl } from "../bridge.js";
import { callout, h, icon, replace } from "../dom.js";
import type { Ctx, View } from "../context.js";

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
        h("div", null, h("h1", null, "Accéder à EDCH hors de chez soi"), h("p.sub", null, "Guide pas à pas avec Tailscale")),
        h("button.ghost", { onclick: () => this.ctx.store.setView("mobile") }, "← Retour à l'accès mobile"),
      ),
      h(
        "div.guide",
        null,
        callout(
          "danger",
          "À lire d'abord",
          "EDCH est conçu pour être utilisé sur ton réseau domestique. Passer par Internet n'est pas son objectif : l'accès à distance via Tailscale est pour l'instant la seule alternative, le temps de développer une solution intégrée à EDCH. Active-le seulement si tu en as besoin.",
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Quand est-ce utile ?"),
          h(
            "ul.notes",
            null,
            h("li", null, h("strong", null, "Loin de ton PC : "), "en déplacement ou au travail, tu suis tes missions, ta wishlist ou ton escadrille sur ton téléphone avec les données mobiles."),
            h("li", null, h("strong", null, "Wi-Fi public : "), "à l'hôtel, à la gare ou dans un café, la connexion locale d'EDCH n'est pas chiffrée. Avec Tailscale, tout passe chiffré."),
            h("li", null, h("strong", null, "Jeu dans le cloud : "), "si Elite Dangerous et EDCH tournent sur un PC distant (Shadow, Boosteroid…), ton téléphone n'est pas sur le même réseau. Tailscale relie les deux."),
            h("li", null, h("strong", null, "Réseaux séparés chez toi : "), "Wi-Fi invité, répéteur ou deuxième routeur qui isole le téléphone du PC."),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Tailscale, c'est quoi ?"),
          h(
            "p",
            null,
            "Un réseau privé entre tes propres appareils. Chacun reçoit une adresse qui commence par 100. Les connexions sont chiffrées de bout en bout et rien n'est ouvert sur Internet : seuls les appareils connectés à ton compte Tailscale se voient. C'est gratuit pour un usage personnel. Tailscale est un service indépendant d'EDCH.",
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Mise en place (10 minutes)"),
          h(
            "ol.guide-steps",
            null,
            step(1, "Crée un compte Tailscale", h("p", null, "Sur tailscale.com, avec ton compte Google, Microsoft, Apple ou GitHub."), h("button.ghost.small", { onclick: () => openUrl("https://tailscale.com/download") }, icon("link"), " tailscale.com/download")),
            step(2, "Installe Tailscale sur le PC où tourne EDCH", h("p", null, "Télécharge la version Windows, lance-la et connecte-toi. L'icône Tailscale près de l'horloge doit indiquer « Connected »."), ),
            step(3, "Installe Tailscale sur ton téléphone", h("p", null, "Depuis le Play Store ou l'App Store. Connecte-toi avec le même compte et accepte l'activation du VPN quand l'appli le demande.")),
            step(4, "Choisis l'adresse Tailscale dans EDCH", h("p", null, "Page Accès mobile : active le serveur local, puis choisis « Tailscale » dans la liste « Adresse du PC » (l'adresse commence par 100). Le QR code et le lien se mettent à jour tout seuls.")),
            step(5, "Scanne le QR code", h("p", null, "Avec Tailscale activé sur le téléphone. C'est fait : EDCH s'ouvre en Wi-Fi comme en 4G/5G.")),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Ça ne marche pas ?"),
          h(
            "ul.notes",
            null,
            h("li", null, h("strong", null, "« Tailscale n'est pas détecté » : "), "vérifie que Tailscale est connecté sur le PC, puis rouvre la page Accès mobile."),
            h("li", null, h("strong", null, "Le téléphone ne se connecte pas : "), "vérifie que Tailscale est activé sur le téléphone. Dans Windows, ouvre Sécurité Windows → Pare-feu et protection du réseau → Autoriser une application via le pare-feu, puis coche EDCH pour les réseaux privés et publics (Tailscale est parfois classé « public »)."),
            h("li", null, h("strong", null, "Le QR code montre une adresse en 192.168… : "), "c'est l'adresse Wi-Fi ou Ethernet qui est choisie : sélectionne « Tailscale » dans la liste « Adresse du PC ». Si Tailscale n'apparaît pas dans la liste, il n'était pas actif quand la page s'est ouverte : rouvre-la."),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Sécurité"),
          h(
            "ul.notes",
            null,
            h("li", null, "Ne partage jamais le QR code ni le lien : ils contiennent le code secret."),
            h("li", null, "Ne donne pas accès à ton compte Tailscale à d'autres personnes."),
            h("li", null, "Pour couper l'accès : décoche l'option, désactive le serveur local, ou clique sur « Nouveau code » pour déconnecter tous les appareils."),
          ),
        ),
      ),
    );
  }

  update() {
    /* static page */
  }
}
