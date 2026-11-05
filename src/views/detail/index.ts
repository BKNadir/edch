// Detail panel (right side): the selected material, blueprint or engineer, with where to find it,
// the recipes using it, trades and the wishlist actions.

import { gameName, t } from "../../platform/i18n.js";
import { CATEGORY_LABELS } from "../../game/data.js";
import { h, icon, fmt, replace } from "../../ui/dom.js";
import { ownedOf, referenceOf, reserved, type Ctx } from "../../state/context.js";
import { distance, fmtLy } from "../../services/spansh.js";
import { findersFor, traderFinder } from "../../features/materials/sources.js";
import { suggestTrades } from "../../features/materials/trade.js";
import type { Blueprint, Material } from "../../game/types.js";
import { copySystem, finderSection } from "../shared/resultsTable.js";
import { addToWishlist } from "../wishlist/index.js";
import { moduleLink } from "../shared/links.js";

const KIND_LABELS: Record<string, string> = {
  modification: t("detail.modifications"),
  experimental: t("detail.experimentalEffects"),
  synthesis: t("common.synthesis"),
  "tech-broker": t("common.technologyBroker"),
  suit: t("detail.suitMods"),
  weapon: t("detail.weaponMods"),
  merchant: t("detail.upgradesGrade"),
  unlock: t("detail.engineerUnlocks"),
  bartender: t("common.bartender"),
};
export const kindFr = (k: string) => KIND_LABELS[k] ?? k;

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
    const sig = JSON.stringify([
      m.id,
      ref.coords ?? ref.system,
      s.maxDistance,
      s.maxAgeDays,
      s.hgeMinPopulation,
      s.largePadOnly,
    ]);
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
        h(
          "div",
          null,
          h("h2", null, m.name),
          h(
            "p.sub",
            null,
            [
              CATEGORY_LABELS[m.category] ?? m.category,
              m.grade ? t("common.grade", { grade: m.grade }) : null,
              this.ctx.game.lineName(m.line),
            ]
              .filter(Boolean)
              .flatMap((x, i) => (i ? [" · ", x as string] : [x as string])),
          ),
        ),
        h(
          "button.icon-btn",
          { title: t("common.close"), onclick: () => this.ctx.store.select(undefined) },
          icon("close"),
        ),
      ),
      h(
        "div.stock",
        null,
        h(
          "div.stock-numbers",
          null,
          h("strong", null, fmt(owned)),
          cap ? ` / ${cap}` : "",
          need ? h("span.badge.warn", null, t("detail.neededWishlist", { need: fmt(need) })) : null,
        ),
        cap ? h("div.bar", null, h("span", { style: { width: `${Math.min(100, (owned / cap) * 100)}%` } })) : null,
      ),
      h("p.sub.ref", null, icon("pin"), " " + t("detail.searchingAround", { label: ref.label })),
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
      h("h3", null, t("detail.tradeSuggestions")),
      list.length
        ? h(
            "ul.trades",
            null,
            list.map((trade) => {
              const cap = this.ctx.game.capacityOf(trade.from.id) ?? 0;
              return h(
                "li",
                { class: trade.from.line === m.line ? "same-line" : "" },
                h("span.arrow", null, trade.from.grade! > m.grade! ? "↓" : trade.from.grade! < m.grade! ? "↑" : "⇄"),
                " " + t("detail.receive") + " ",
                h("strong", null, fmt(trade.receive)),
                " " + t("detail.for") + " ",
                h("strong", null, fmt(trade.pay)),
                " ",
                h("button.inline-link", { onclick: () => this.ctx.store.select(trade.from.id) }, trade.from.name),
                h(
                  "span.sub",
                  null,
                  " " +
                    t("detail.ownedReservedUsedRate", {
                      owned: fmt(trade.owned),
                      reserved: fmt(trade.reserved),
                      value: cap ? Math.round((trade.owned / cap) * 100) : 0,
                      paid: trade.rate.paid,
                      received: trade.rate.received,
                    }),
                ),
              );
            }),
          )
        : h("p.empty", null, t("detail.nothingSpareTradeRightNow")),
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
          h("div.finder-head", null, h("h4", null, t("detail.knownFarmingSites"))),
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
                  h(
                    "button.sys",
                    { title: t("common.copy", { name: site.system }), onclick: () => copySystem(site.system) },
                    icon("copy"),
                    h("span", null, `${site.system} ${site.body}`),
                  ),
                  h("span.dist", null, fmtLy(d)),
                ),
                h(
                  "div.result-meta",
                  null,
                  h("span.badge.hit", null, site.what),
                  site.lat !== undefined
                    ? h("span.sub", null, t("detail.latLon", { lat: site.lat, lon: site.lon }))
                    : null,
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
    replace(this.body, h("h3", null, t("detail.whereFind")), parts);
  }

  private usedIn(m: Material): HTMLElement {
    const list = this.ctx.game.usedIn.get(m.id) ?? [];
    if (!list.length)
      return h("section.used", null, h("h3", null, t("detail.used")), h("p.empty", null, t("detail.noKnownRecipe")));
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
      h("h3", null, list.length === 1 ? t("detail.used1Recipe") : t("detail.usedRecipes", { count: list.length })),
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
                          {
                            title: t("detail.addWishlist", {
                              ingredients: bp.ingredients[m.id],
                              name: gameName(m.name),
                            }),
                            onclick: () => addToWishlist(this.ctx, bp),
                          },
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
