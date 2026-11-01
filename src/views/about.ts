import { openUrl } from "../bridge.js";
import { h, replace } from "../dom.js";
import { SOFTWARE_VERSION } from "../eddn.js";
import type { Ctx, View } from "../context.js";

const REPO = "https://github.com/BKNadir/edch";

/** The projects EDCH relies on: name, what they bring, links (site first, then repository). */
const PROJECTS: { name: string; what: string; links: [string, string][] }[] = [
  { name: "Spansh", what: "Toutes les recherches de systèmes, stations, marchandises et les itinéraires (neutrons, porte-vaisseaux)", links: [["spansh.co.uk", "https://spansh.co.uk"]] },
  { name: "EDDN (EDCD)", what: "Le réseau qui partage les données du jeu entre joueurs. EDCH y contribue.", links: [["github.com/EDCD/EDDN", "https://github.com/EDCD/EDDN"]] },
  { name: "EDCD / FDevIDs", what: "Les identifiants et noms officiels du jeu", links: [["github.com/EDCD/FDevIDs", "https://github.com/EDCD/FDevIDs"]] },
  { name: "EDSM", what: "Synchronisation de ton journal de vol", links: [["edsm.net", "https://www.edsm.net"]] },
  { name: "Inara", what: "Synchronisation de ton profil de commandant", links: [["inara.cz", "https://inara.cz"]] },
  { name: "EDEngineer (msarilar)", what: "Recettes d'ingénierie, origines des matériaux et une partie des traductions", links: [["github.com/msarilar/EDEngineer", "https://github.com/msarilar/EDEngineer"]] },
  { name: "d47 (dseelinger)", what: "Les données d'EDEngineer et des ingénieurs, réunies et corrigées, et le catalogue d'exobiologie", links: [["github.com/dseelinger/d47", "https://github.com/dseelinger/d47"]] },
  {
    name: "Elite Dangerous Almanac",
    what: "Les noms officiels traduits du jeu (matériaux, marchandises, modules…)",
    links: [["github.com/Elite-Dangerous-Almanac/Almanac-Core", "https://github.com/Elite-Dangerous-Almanac/Almanac-Core"]],
  },
  { name: "EDR (lekeno)", what: "Les noms des espèces d'exobiologie tels que le journal les écrit", links: [["github.com/lekeno/edr", "https://github.com/lekeno/edr"]] },
  { name: "ntfy.sh", what: "Le relais gratuit qui transporte les messages chiffrés de l'escadrille", links: [["ntfy.sh", "https://ntfy.sh"], ["github.com/binwiederhier/ntfy", "https://github.com/binwiederhier/ntfy"]] },
  { name: "EDRefCard (Richard Buckle)", what: "Noms des commandes et schémas des HOTAS, joysticks et manettes", links: [["github.com/richardbuckle/EDRefCard", "https://github.com/richardbuckle/EDRefCard"]] },
  {
    name: "EDSY",
    what: "Format d'export de builds importé dans la wishlist",
    links: [
      ["edsy.org", "https://edsy.org"],
      ["github.com/taleden/EDSY", "https://github.com/taleden/EDSY"],
    ],
  },
  {
    name: "Coriolis (EDCD)",
    what: "Format d'export de builds importé dans la wishlist",
    links: [
      ["coriolis.io", "https://coriolis.io"],
      ["github.com/EDCD/coriolis", "https://github.com/EDCD/coriolis"],
    ],
  },
  { name: "EDMarketConnector (EDCD)", what: "L'inspiration pour la synchro EDDN, EDSM et Inara", links: [["github.com/EDCD/EDMarketConnector", "https://github.com/EDCD/EDMarketConnector"]] },
  {
    name: "Odyssey Materials Helper (Jixxed)",
    what: "L'inspiration de départ pour EDCH",
    links: [["github.com/jixxed/ed-odyssey-materials-helper", "https://github.com/jixxed/ed-odyssey-materials-helper"]],
  },
  {
    name: "Tauri",
    what: "Le cadre qui fait tourner l'application sur Windows",
    links: [
      ["tauri.app", "https://tauri.app"],
      ["github.com/tauri-apps/tauri", "https://github.com/tauri-apps/tauri"],
    ],
  },
];

const link = (label: string, url: string) => h("button.inline-link", { "data-no-tr": "", onclick: () => openUrl(url) }, label);

export class AboutView implements View {
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    void this.ctx;
    replace(
      root,
      h("header.view-head", null, h("div", null, h("h1", null, "À propos d'EDCH"), h("p.sub", null, `Version ${SOFTWARE_VERSION}`))),
      h(
        "div.about",
        null,
        h(
          "section.card",
          null,
          h("h3", null, "EDCH — Elite Dangerous Companion Helper"),
          h("p", null, "Un compagnon léger pour Elite Dangerous : inventaire en direct, où trouver chaque matériau, ingénieurs, recherches, navigation, commandes et synchro."),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Liens utiles"),
          h(
            "ul.about-links",
            null,
            h("li", null, "📦 ", h("span", null, "Code source :"), " ", link("github.com/BKNadir/edch", REPO)),
            h(
              "li",
              null,
              "🐞 ",
              h("span", null, "Signaler un bug ou proposer une idée :"),
              " ",
              h("button.inline-link", { onclick: () => openUrl(`${REPO}/issues`) }, "ouvrir une issue"),
              h("p.sub", null, "Indique ta version d'EDCH, ce que tu faisais et ce qui s'est passé. Une capture d'écran aide beaucoup."),
            ),
            h("li", null, "📝 ", h("span", null, "Nouveautés de chaque version :"), " ", h("button.inline-link", { onclick: () => openUrl(`${REPO}/releases`) }, "Releases")),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "À savoir"),
          h(
            "ul.notes",
            null,
            h("li", null, "EDCH ne remplace pas les autres outils de la communauté. C'est un projet indépendant, sans lien avec les projets cités ci-dessous ni avec Frontier Developments."),
            h("li", null, "Il a été codé en grande partie par une IA (Claude, d'Anthropic), avec le suivi d'un développeur qui définit les fonctionnalités, teste et valide chaque version. Il peut donc être incomplet ou contenir des bugs."),
            h("li", null, "Outil communautaire gratuit, non officiel et non commercial."),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Merci à eux 🙏"),
          h("p", null, "EDCH ne fonctionnerait pas sans ces projets, créés et maintenus par des membres de la communauté. Merci à chacun d'eux. S'ils te sont utiles, pense à les soutenir."),
          h(
            "div.thanks",
            null,
            PROJECTS.map((p) =>
              h(
                "div.thanks-row",
                null,
                h("strong", { "data-no-tr": "" }, p.name),
                h("span.sub", null, p.what),
                h("span.thanks-links", null, p.links.flatMap(([label, url], i) => (i ? [" · ", link(label, url)] : [link(label, url)]))),
              ),
            ),
          ),
        ),
        h(
          "section.card",
          null,
          h("p.sub", null, "Elite Dangerous est une marque de Frontier Developments plc. Les noms et données du jeu leur appartiennent."),
          h("p.sub", null, "Licences et détails : ", link("NOTICE", `${REPO}/blob/main/NOTICE`)),
        ),
      ),
    );
  }

  update() {
    /* static page */
  }
}
