import { locale } from "../i18n.js";
import { openUrl } from "../bridge.js";
import { callout, h, icon, replace } from "../dom.js";
import type { Ctx, View } from "../context.js";
import type { SyncSettings } from "../uploaders.js";

/** EDMC-style connections: EDDN, EDSM, Inara. */
export class SyncView implements View {
  private root?: HTMLElement;
  private activity = h("div.sync-activity");
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const s = this.ctx.store.state.settings.sync;
    const set = (patch: Partial<SyncSettings>) => this.ctx.store.updateSettings({ sync: { ...this.ctx.store.state.settings.sync, ...patch } });
    const toggle = (checked: boolean, onChange: (v: boolean) => void) =>
      h("label.switch", null, h("input", { type: "checkbox", checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }), h("span"));
    const text = (label: string, value: string, onChange: (v: string) => void, secret = false, help?: string) =>
      h(
        "label.field",
        null,
        h("span", null, label),
        h("input", { type: secret ? "password" : "text", value, spellcheck: false, autocomplete: "off", onchange: (e: Event) => onChange((e.target as HTMLInputElement).value.trim()) }),
        help ? h("small", null, help) : null,
      );

    replace(
      root,
      h("header.view-head", null, h("h1", null, "Synchronisation"), h("p.sub", null, "Ce que fait EDMC : partager ce que tu vois en jeu avec la communauté et tes services.")),
      callout(
        "info",
        "Page en cours de développement",
        "Toutes les fonctions ne sont pas encore opérationnelles à 100 %. Inara n'a pas encore validé EDCH : ses envois sont refusés pour l'instant et EDCH les met en pause. EDDN et EDSM fonctionnent.",
      ),
      h(
        "div.settings",
        null,
        h(
          "section.card",
          null,
          h("div.sync-head", null, h("div", null, h("h3", null, "EDDN — réseau de données communautaire"), h("p.sub", null, "Envoie marchés, équipements, chantiers navals, systèmes et scans visités. C'est ce qui alimente Spansh, Inara et EDSM pour tout le monde (et les recherches de cette appli).")), toggle(s.eddn, (v) => set({ eddn: v }))),
          h("p.sub", null, "Aucun compte requis. Rien de personnel n'est envoyé : ton nom de CMDR est haché par EDDN, tes amendes, réputations et carburant sont retirés. Seuls les événements en direct sont envoyés, jamais l'historique."),
        ),
        h(
          "section.card",
          null,
          h("div.sync-head", null, h("div", null, h("h3", null, "EDSM — carnet de vol"), h("p.sub", null, "Envoie ton journal à EDSM (trajets, découvertes, inventaire).")), toggle(s.edsm, (v) => set({ edsm: v }))),
          text("Nom de CMDR sur EDSM", s.edsmCommander, (v) => set({ edsmCommander: v })),
          text("Clé API EDSM", s.edsmKey, (v) => set({ edsmKey: v }), true, "EDSM → ton profil → Paramètres → Clé API."),
          h("button.inline-link", { onclick: () => openUrl("https://www.edsm.net/en/settings/api") }, "Ouvrir la page de clé API EDSM"),
        ),
        h(
          "section.card",
          null,
          h("div.sync-head", null, h("div", null, h("h3", null, "Inara — profil de commandant"), h("p.sub", null, "Met à jour ta position, ton vaisseau, tes matériaux et tes ingénieurs sur Inara.")), toggle(s.inara, (v) => set({ inara: v }))),
          text("Clé API Inara personnelle", s.inaraKey, (v) => set({ inaraKey: v }), true, "Inara → Paramètres → API key. Inara peut demander d'accepter une nouvelle appli avant d'enregistrer ses données : le journal ci-dessous affichera sa réponse."),
          h("button.inline-link", { onclick: () => openUrl("https://inara.cz/elite/settings-api/") }, "Ouvrir la page de clé API Inara"),
        ),
        h("section.card", null, h("h3", null, "Activité"), this.activity),
      ),
    );
    this.update();
  }

  update() {
    if (!this.root) return;
    const stats = this.ctx.sync?.stats;
    if (!stats) {
      replace(this.activity, h("p.sub", null, "Disponible dans l'application (pas en mode démo)."));
      return;
    }
    const counter = (name: string) =>
      h("div.counter", null, h("strong", null, String(stats.sent[name] ?? 0)), h("span", null, name), stats.failed[name] ? h("small.bad", null, `${stats.failed[name]} échec(s)`) : null);
    replace(
      this.activity,
      h("div.counters", null, counter("EDDN"), counter("EDSM"), counter("Inara")),
      stats.log.length
        ? h(
            "ul.sync-log",
            null,
            stats.log.map((l) =>
              h(
                "li",
                { class: l.ok ? "ok" : "bad" },
                l.ok ? icon("check") : icon("warn"),
                h("span.when", null, new Date(l.at).toLocaleTimeString(locale())),
                h("strong", null, l.service),
                h("span", null, l.what),
                l.detail ? h("span.sub", null, l.detail) : null,
              ),
            ),
          )
        : h("p.sub", null, "Rien envoyé pour l'instant : ça démarre avec les prochains événements du jeu (saut, amarrage, marché…)."),
    );
  }
}
