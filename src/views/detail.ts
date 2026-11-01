import { gameName } from "../i18n.js";
import { CATEGORY_FR } from "../data.js";
import { h, icon, fmt, replace } from "../dom.js";
import { ownedOf, referenceOf, reserved, type Ctx } from "../context.js";
import { distance, fmtLy } from "../spansh.js";
import { findersFor, traderFinder } from "../sources.js";
import { suggestTrades } from "../trade.js";
import type { Blueprint, Material } from "../types.js";
import { copySystem, finderSection } from "./results.js";
import { addToWishlist } from "./wishlist.js";
import { moduleLink } from "../links.js";

const KIND_FR: Record<string, string> = {
  modification: "Modifications",
  experimental: "Effets expérimentaux",
  synthesis: "Synthèse",
  "tech-broker": "Courtier technologique",
  suit: "Mods de combinaison",
  weapon: "Mods d'arme",
  merchant: "Améliorations (grade)",
  unlock: "Déblocage d'ingénieurs",
  bartender: "Barman",
};
export const kindFr = (k: string) => KIND_FR[k] ?? k;

/** Right-hand panel for one material. Rebuilds its Spansh sections only when needed. */
export class DetailPanel {
  private root?: HTMLElement;
  private signature = "";
  private head = h("div.detail-head");
  private trades = h("div.detail-trades");
  private body = h("div.detail-body");

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.signature = "";
    this.update();
  }

  update() {
    const root = this.root;
    if (!root) return;
    const id = this.ctx.store.state.selected;
    const m = id ? this.ctx.game.material(id) : undefined;
    if (!m) {
      root.classList.remove("open");
      root.replaceChildren();
      this.signature = "";
      return;
    }
    root.classList.add("open");
    const ref = referenceOf(this.ctx);
    const s = this.ctx.store.state.settings;
    const sig = JSON.stringify([m.id, ref.coords ?? ref.system, s.maxDistance, s.maxAgeDays, s.hgeMinPopulation, s.largePadOnly]);
    if (sig !== this.signature) {
      this.signature = sig;
      replace(root, this.head, this.trades, this.body);
      this.renderBody(m);
      root.scrollTop = 0;
    }
    this.renderHead(m);
    this.renderTrades(m);
  }

  private renderHead(m: Material) {
    const owned = ownedOf(this.ctx, m.id);
    const cap = this.ctx.game.capacityOf(m.id);
    const need = reserved(this.ctx)[m.id] ?? 0;
    const ref = referenceOf(this.ctx);
    replace(
      this.head,
      h(
        "div.detail-title",
        null,
        h("div", null, h("h2", null, m.name), h("p.sub", null, [CATEGORY_FR[m.category] ?? m.category, m.grade ? `Grade ${m.grade}` : null, this.ctx.game.lineName(m.line)].filter(Boolean).flatMap((x, i) => (i ? [" · ", x as string] : [x as string])))),
        h("button.icon-btn", { title: "Fermer", onclick: () => this.ctx.store.select(undefined) }, icon("close")),
      ),
      h(
        "div.stock",
        null,
        h("div.stock-numbers", null, h("strong", null, fmt(owned)), cap ? ` / ${cap}` : "", need ? h("span.badge.warn", null, `${fmt(need)} requis par la wishlist`) : null),
        cap ? h("div.bar", null, h("span", { style: { width: `${Math.min(100, (owned / cap) * 100)}%` } })) : null,
      ),
      h("p.sub.ref", null, icon("pin"), ` Recherches autour de ${ref.label}`),
    );
  }

  private renderTrades(m: Material) {
    const state = this.ctx.store.state;
    const res = reserved(this.ctx);
    const owned = m.ledger === "ship" ? state.cmdr.materials : state.cmdr.locker;
    const need = Math.max(0, (res[m.id] ?? 0) - (owned[m.id] ?? 0));
    const list = suggestTrades(this.ctx.game, m, owned, res, need || undefined).slice(0, 6);
    if (m.ledger !== "ship" || !m.line) {
      this.trades.replaceChildren();
      return;
    }
    replace(
      this.trades,
      h("h3", null, "Suggestions d'échange"),
      list.length
        ? h(
            "ul.trades",
            null,
            list.map((t) => {
              const cap = this.ctx.game.capacityOf(t.from.id) ?? 0;
              return h(
                "li",
                { class: t.from.line === m.line ? "same-line" : "" },
                h("span.arrow", null, t.from.grade! > m.grade! ? "↓" : t.from.grade! < m.grade! ? "↑" : "⇄"),
                " Recevoir ",
                h("strong", null, fmt(t.receive)),
                " contre ",
                h("strong", null, fmt(t.pay)),
                " ",
                h("button.inline-link", { onclick: () => this.ctx.store.select(t.from.id) }, t.from.name),
                h("span.sub", null, ` (${fmt(t.owned)} possédés, ${fmt(t.reserved)} réservés, ${cap ? Math.round((t.owned / cap) * 100) : 0} % utilisé · taux ${t.rate.paid}:${t.rate.received})`),
              );
            }),
          )
        : h("p.empty", null, "Rien d'échangeable en surplus pour l'instant."),
    );
  }

  private renderBody(m: Material) {
    const ctx = this.ctx;
    const s = ctx.store.state.settings;
    const ref = referenceOf(ctx);
    const parts: HTMLElement[] = [];

    // Fixed, well-known farming sites.
    const sites = ctx.game.data.sites
      .filter((site) => site.materials.includes(m.id))
      .map((site) => ({ site, d: distance(ref.coords, site.pos) }))
      .sort((a, b) => (a.d ?? 0) - (b.d ?? 0));
    if (sites.length) {
      parts.push(
        h(
          "section.finder",
          null,
          h("div.finder-head", null, h("h4", null, "Sites de farm connus")),
          h(
            "div.results",
            null,
            sites.map(({ site, d }) =>
              h(
                "div.result",
                null,
                h(
                  "div.result-main",
                  null,
                  h("button.sys", { title: `Copier « ${site.system} »`, onclick: () => copySystem(site.system) }, icon("copy"), h("span", null, `${site.system} ${site.body}`)),
                  h("span.dist", null, fmtLy(d)),
                ),
                h(
                  "div.result-meta",
                  null,
                  h("span.badge.hit", null, site.what),
                  site.lat !== undefined ? h("span.sub", null, `Lat ${site.lat} / Lon ${site.lon}`) : null,
                ),
              ),
            ),
          ),
        ),
      );
    }

    for (const f of findersFor(m, s)) parts.push(finderSection(f, ref, s));

    const trader = traderFinder(m, s);
    if (trader) parts.push(finderSection(trader, ref, s, { compact: true }));

    parts.push(this.usedIn(m));
    replace(this.body, h("h3", null, "Où le trouver"), parts);
  }

  private usedIn(m: Material): HTMLElement {
    const list = this.ctx.game.usedIn.get(m.id) ?? [];
    if (!list.length) return h("section.used", null, h("h3", null, "Utilisé dans"), h("p.empty", null, "Aucune recette connue."));
    const groups = new Map<string, Map<string, Blueprint[]>>();
    for (const bp of list) {
      const byModule = groups.get(bp.kind) ?? new Map<string, Blueprint[]>();
      const k = `${gameName(bp.module)} — ${gameName(bp.name)}`;
      byModule.set(k, [...(byModule.get(k) ?? []), bp]);
      groups.set(bp.kind, byModule);
    }
    return h(
      "section.used",
      null,
      h("h3", null, list.length === 1 ? "Utilisé dans 1 recette" : `Utilisé dans ${list.length} recettes`),
      [...groups.entries()].map(([kind, byModule]) =>
        h(
          "details",
          null,
          h("summary", null, `${kindFr(kind)} `, h("span.sub", null, `(${byModule.size})`)),
          h(
            "ul.used-list",
            null,
            [...byModule.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([label, bps]) =>
                h(
                  "li",
                  null,
                  h("span", null, moduleLink(bps[0].module), ` — ${gameName(bps[0].name)}`),
                  h(
                    "span.grades",
                    null,
                    bps
                      .sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0))
                      .map((bp) =>
                        h(
                          "button.grade-chip",
                          { title: `Ajouter à la wishlist (${bp.ingredients[m.id]} × ${gameName(m.name)})`, onclick: () => addToWishlist(this.ctx, bp) },
                          bp.grade ? `G${bp.grade}` : "+",
                          h("small", null, `×${bp.ingredients[m.id]}`),
                        ),
                      ),
                  ),
                ),
              ),
          ),
        ),
      ),
    );
  }
}
