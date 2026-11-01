import type { CarrierHold, Depot } from "../activity.js";
import { fmt, h, icon, replace } from "../dom.js";
import { gameName } from "../i18n.js";
import { relTime } from "../time.js";
import type { Ctx, View } from "../context.js";
import { presetSearch } from "./search.js";
import { busy, sys } from "./missions.js";

export class ColonisationView implements View {
  private root?: HTMLElement;
  private showDone = false;
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    if (!busy(this.root)) this.render();
  }

  /** English commodity name for a depot resource symbol. */
  private commodity(id: string, label: string): string {
    return this.ctx.game.data.commodities.find((c) => c.id === id)?.name ?? label;
  }

  private render() {
    if (!this.root) return;
    const st = this.ctx.store.state;
    const all = Object.values(st.activity.depots).sort((a, b) => Number(a.complete || a.failed) - Number(b.complete || b.failed) || b.updated.localeCompare(a.updated));
    const shown = this.showDone ? all : all.filter((d) => !d.complete && !d.failed);
    const capacity = st.cmdr.loadout?.cargoCapacity ?? 0;
    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h("div", null, h("h1", null, "Colonisation"), h("p.sub", null, "Chantiers de construction suivis depuis ton journal : ce qu'il reste à livrer, ta soute, les trajets et où acheter.")),
        all.some((d) => d.complete || d.failed)
          ? h("label.check", null, h("input", { type: "checkbox", checked: this.showDone, onchange: (e: Event) => ((this.showDone = (e.target as HTMLInputElement).checked), this.render()) }), " Afficher les chantiers terminés")
          : null,
      ),
      this.holds(shown, capacity),
      shown.length
        ? shown.map((d) => this.depot(d, capacity))
        : h("section.card", null, h("p.empty", null, "Aucun chantier en cours. Docke à un dépôt de construction (Colonisation) : EDCH lira la liste des marchandises demandées.")),
    );
  }

  /** Your carrier and your squadron's: the ones whose hold is worth showing. */
  private carriers(): CarrierHold[] {
    return Object.values(this.ctx.store.state.activity.carriers ?? {})
      .filter((c) => c.mine || c.squadron)
      .sort((a, b) => Number(b.mine) - Number(a.mine));
  }

  /** How much of a commodity sits in your carriers. */
  private inCarriers(id: string): number {
    return this.carriers().reduce((s, c) => s + (c.items[id]?.count ?? 0), 0);
  }

  /** Ship hold, own fleet carrier and squadron carrier, side by side. */
  private holds(depots: Depot[], capacity: number): HTMLElement {
    const cmdr = this.ctx.store.state.cmdr;
    const needed = new Set(depots.flatMap((d) => d.resources.filter((r) => r.required > r.provided).map((r) => r.id)));
    const name = (id: string, label?: string) => gameName(this.commodity(id, label ?? id));
    const list = (items: [string, number, string?][]) =>
      items.length
        ? h(
            "ul.hold-list",
            null,
            items
              .sort((a, b) => Number(needed.has(b[0])) - Number(needed.has(a[0])) || b[1] - a[1])
              .map(([id, n, label]) => h("li", { class: needed.has(id) ? "needed" : "" }, h("span", null, name(id, label)), h("strong", null, `${fmt(n)} t`))),
          )
        : h("p.empty", null, "Vide");
    const shipItems = Object.entries(cmdr.cargo ?? {}).filter(([, n]) => n > 0) as [string, number][];
    const shipUsed = shipItems.reduce((s, [, n]) => s + n, 0);
    const cards: HTMLElement[] = [
      h(
        "div.hold",
        null,
        h("h4", null, "Vaisseau"),
        h("p.sub", null, capacity ? `${fmt(shipUsed)} / ${fmt(capacity)} t` : `${fmt(shipUsed)} t`),
        capacity ? h("div.bar", null, h("span", { style: { width: `${Math.min(100, (shipUsed / capacity) * 100)}%` } })) : null,
        list(shipItems),
      ),
    ];
    for (const c of this.carriers()) {
      const items = Object.entries(c.items).map(([id, v]) => [id, v.count, v.label] as [string, number, string]);
      const known = items.reduce((s, [, n]) => s + n, 0);
      const unknown = c.total !== undefined ? Math.max(0, c.total - known) : 0;
      cards.push(
        h(
          "div.hold",
          null,
          h("h4", null, c.mine ? "Mon fleet carrier" : "Carrier de l'escadrille"),
          h("p.sub", { "data-no-tr": "" }, c.name),
          c.total !== undefined ? h("p.sub", null, `${fmt(c.total)} t de marchandises (jeu, ${relTime(c.totalAt)})`) : null,
          list(items),
          unknown ? h("p.sub", null, `+ ${fmt(unknown)} t non identifiées`) : null,
        ),
      );
    }
    return h(
      "section.card.holds",
      null,
      h("h3", null, "Soutes"),
      h("div.hold-grid", null, cards),
      this.carriers().length
        ? h("p.sub", null, "Le journal du jeu ne liste pas la soute d'un carrier : EDCH la reconstitue à partir de tes transferts vaisseau ↔ carrier et de tes achats et ventes sur son marché. Ce qui y a été mis par d'autres ou avant le début de ton historique (60 jours) n'apparaît pas. Les marchandises demandées par tes chantiers sont surlignées.")
        : h("p.sub", null, "Docke à ton fleet carrier (ou à celui de ton escadrille) puis transfère des marchandises : EDCH suivra aussi sa soute. Le total de ton carrier vient de l'écran de gestion du carrier."),
    );
  }

  private depot(d: Depot, capacity: number): HTMLElement {
    const cargo = this.ctx.store.state.cmdr.cargo;
    const remaining = d.resources.reduce((s, r) => s + Math.max(0, r.required - r.provided), 0);
    const required = d.resources.reduce((s, r) => s + r.required, 0);
    const pct = d.complete ? 100 : Math.round((d.progress || (required ? 1 - remaining / required : 0)) * 1000) / 10;
    const inHold = d.resources.reduce((s, r) => s + Math.min(cargo[r.id] ?? 0, Math.max(0, r.required - r.provided)), 0);
    const trips = capacity ? Math.ceil(Math.max(0, remaining - inHold) / capacity) : null;
    const inCarrier = d.resources.reduce((s, r) => s + Math.min(this.inCarriers(r.id), Math.max(0, r.required - r.provided)), 0);
    const showCarrier = this.carriers().length > 0;
    const rows = d.resources
      .map((r) => ({ ...r, left: Math.max(0, r.required - r.provided), hold: cargo[r.id] ?? 0 }))
      .sort((a, b) => Number(a.left === 0) - Number(b.left === 0) || b.left - a.left);
    return h(
      "section.card.depot",
      null,
      h(
        "div.depot-head",
        null,
        h("div", null, h("h3", null, d.station ?? `Dépôt #${d.marketId}`), d.system ? sys(d.system) : null),
        h("div.badges", null, d.complete ? h("span.badge.ok", null, "Terminé") : d.failed ? h("span.badge.warn", null, "Échoué") : h("span.badge", null, `${pct} %`), h("span.sub", null, `Mis à jour ${relTime(d.updated)}`)),
      ),
      h("div.bar.big", null, h("span", { style: { width: `${pct}%` } })),
      h(
        "div.stats",
        null,
        h("div.stat", null, h("strong", null, fmt(remaining)), h("span.sub", null, "t restantes")),
        h("div.stat", null, h("strong", null, fmt(inHold)), h("span.sub", null, "t utiles en soute")),
        inCarrier ? h("div.stat", null, h("strong", null, fmt(inCarrier)), h("span.sub", null, "t utiles dans tes carriers")) : null,
        trips !== null ? h("div.stat", null, h("strong", null, fmt(trips)), h("span.sub", null, `trajets (${fmt(capacity)} t par trajet)`)) : null,
      ),
      h(
        "table.table.depot-table",
        null,
        h("thead", null, h("tr", null, h("th", null, "Marchandise"), h("th.num", null, "Livré"), h("th.num", null, "Demandé"), h("th.num", null, "Restant"), h("th.num", null, "En soute"), showCarrier ? h("th.num", null, "Carriers") : null, h("th", null, ""))),
        h(
          "tbody",
          null,
          rows.map((r) => {
            const name = this.commodity(r.id, r.label);
            return h(
              "tr",
              { class: r.left === 0 ? "done" : "" },
              h("td", null, gameName(name)),
              h("td.num", null, fmt(r.provided)),
              h("td.num", null, fmt(r.required)),
              h("td.num", null, r.left ? h("strong", null, fmt(r.left)) : h("span.ok", null, "✓")),
              h("td.num", null, r.hold ? fmt(r.hold) : ""),
              showCarrier ? h("td.num", null, this.inCarriers(r.id) ? fmt(this.inCarriers(r.id)) : "") : null,
              h(
                "td",
                null,
                r.left
                  ? h(
                      "button.ghost.small",
                      {
                        title: "Chercher où l'acheter près de toi",
                        onclick: () => {
                          presetSearch("buy", name);
                          this.ctx.store.setView("search");
                        },
                      },
                      icon("search"),
                      " Acheter",
                    )
                  : null,
              ),
            );
          }),
        ),
      ),
    );
  }
}
