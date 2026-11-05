import type { CarrierHold, Depot } from "../activity.js";
import { callout, fmt, h, icon, replace } from "../dom.js";
import { gameName, t } from "../i18n.js";
import { relTime } from "../time.js";
import type { Ctx, View } from "../context.js";
import { presetSearch } from "./search.js";
import { busy, sys } from "./missions.js";
import { spanshGet, spanshPost } from "../bridge.js";
import { log } from "../logger.js";

/** A carrier's market as Spansh last saw it (data players send through EDDN when docking). */
interface CarrierMarket {
  fetched: number;
  /** When the market data was sent to EDDN. */
  updated?: string;
  /** Sell orders: what the carrier offers, with its stock. */
  selling: { id: string; name: string; count: number }[];
  /** Buy orders: what the carrier wants. */
  buying: { id: string; name: string; count: number }[];
  error?: string;
  loading?: boolean;
}

/** Look again when our copy is older than this. */
const MARKET_REFRESH = 5 * 60 * 1000;
const markets = new Map<number, CarrierMarket>();
const callsignOf = (name: string) => /\b[A-Z0-9]{3}-[A-Z0-9]{3}\b/.exec(name)?.[0];

export class ColonisationView implements View {
  private root?: HTMLElement;
  private showDone = false;
  constructor(private ctx: Ctx) {}

  private timer?: number;

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
    this.refreshMarkets();
    window.clearInterval(this.timer);
    // While the page is open: refresh what Spansh knows about the carriers every 5 minutes.
    this.timer = window.setInterval(() => {
      if (!this.root?.isConnected) return window.clearInterval(this.timer);
      this.refreshMarkets();
    }, 60_000);
  }

  /** The freshest view of a carrier's market: your own journal (Market.json) first, Spansh only if newer. */
  private marketOf(marketId: number): (CarrierMarket & { source: "journal" | "spansh" }) | undefined {
    const local = this.ctx.store.state.cmdr.carrierMarkets?.[marketId];
    const remote = markets.get(marketId);
    const remoteNewer = remote?.updated && (!local || Date.parse(remote.updated) > Date.parse(local.at));
    if (local && !remoteNewer) {
      const list = (book: Record<string, { label: string; count: number }>) => Object.entries(book).map(([id, v]) => ({ id, name: v.label, count: v.count }));
      return { fetched: Date.now(), updated: local.at, selling: list(local.selling), buying: list(local.buying), source: "journal" };
    }
    return remote ? { ...remote, source: "spansh" } : undefined;
  }

  /** Asks Spansh only when your own data on the carrier's market is older than 5 minutes (or missing). */
  private refreshMarkets() {
    for (const c of this.carriers()) {
      const local = this.ctx.store.state.cmdr.carrierMarkets?.[c.marketId];
      if (local && Date.now() - Date.parse(local.at) < MARKET_REFRESH) continue;
      const prev = markets.get(c.marketId);
      if (prev?.loading || (prev && Date.now() - prev.fetched < MARKET_REFRESH)) continue;
      const callsign = callsignOf(c.name);
      if (!callsign) continue;
      markets.set(c.marketId, { ...(prev ?? { selling: [], buying: [] }), fetched: Date.now(), loading: true });
      void this.fetchMarket(c.marketId, callsign);
    }
  }

  private async fetchMarket(marketId: number, callsign: string) {
    const toId = (name: string) => this.ctx.game.data.commodities.find((x) => x.name.toLowerCase() === name.toLowerCase())?.id ?? name.toLowerCase().replace(/[^a-z0-9]/g, "");
    try {
      // The station page by market id first; the name search as a fallback.
      let r: Record<string, any> | undefined;
      try {
        const page = await spanshGet(`station/${marketId}`);
        r = page?.record ?? (page?.market_id ? page : undefined);
      } catch {
        r = undefined;
      }
      if (!r) {
        const res = await spanshPost("stations/search", { filters: { name: { value: [callsign] } }, size: 10, page: 0, reference_system: "Sol" });
        const rows: Record<string, any>[] = Array.isArray(res?.results) ? res.results : [];
        r = rows.find((x) => Number(x.market_id) === marketId) ?? rows.find((x) => String(x.name ?? "").toUpperCase() === callsign);
      }
      const market: Record<string, any>[] = Array.isArray(r?.market) ? r.market : [];
      markets.set(marketId, {
        fetched: Date.now(),
        updated: r?.market_updated_at,
        selling: market.filter((m) => Number(m.supply) > 0).map((m) => ({ id: toId(String(m.commodity)), name: String(m.commodity), count: Number(m.supply) })),
        buying: market.filter((m) => Number(m.demand) > 0).map((m) => ({ id: toId(String(m.commodity)), name: String(m.commodity), count: Number(m.demand) })),
        error: r ? undefined : t("colonisation.unknownSpansh"),
      });
      log.debug("carrier", `${callsign}: Spansh market ${r ? `${market.length} line(s), updated ${r.market_updated_at ?? "?"}` : "not found"}`);
    } catch (e) {
      markets.set(marketId, { fetched: Date.now(), selling: [], buying: [], error: String((e as Error)?.message ?? e) });
      log.warn("carrier", `${callsign}: Spansh ${String((e as Error)?.message ?? e)}`);
    }
    if (!busy(this.root)) this.render();
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
        h("div", null, h("h1", null, t("common.colonisation")), h("p.sub", null, t("colonisation.constructionSitesTrackedFromJournalWhat"))),
        all.some((d) => d.complete || d.failed)
          ? h("label.check", null, h("input", { type: "checkbox", checked: this.showDone, onchange: (e: Event) => ((this.showDone = (e.target as HTMLInputElement).checked), this.render()) }), (" " + t("colonisation.showFinishedSites")))
          : null,
      ),
      callout(
        "info",
        t("common.workProgress"),
        t("colonisation.notEveryFeatureFullyWorkingYet"),
      ),
      this.holds(shown, capacity),
      shown.length
        ? shown.map((d) => this.depot(d, capacity))
        : h("section.card", null, h("p.empty", null, t("colonisation.noConstructionProgressDockConstructionDepot"))),
    );
  }

  /** Your carrier and your squadron's: the ones whose hold is worth showing. */
  private carriers(): CarrierHold[] {
    return Object.values(this.ctx.store.state.activity.carriers ?? {})
      .filter((c) => c.mine || c.squadron)
      .sort((a, b) => Number(b.mine) - Number(a.mine));
  }

  /** How much of a commodity sits in your carriers (journal estimate, or the stock it sells if higher). */
  private inCarriers(id: string): number {
    return this.carriers().reduce((s, c) => {
      const selling = this.marketOf(c.marketId)?.selling.find((x) => x.id === id)?.count ?? 0;
      return s + Math.max(c.items[id]?.count ?? 0, selling);
    }, 0);
  }

  /** What the carrier's market shows on Spansh: sell orders (stock) and buy orders. */
  private marketBlock(marketId: number, needed: Set<string>, name: (id: string, label?: string) => string): HTMLElement | null {
    const m = this.marketOf(marketId);
    if (!m) return null;
    if (m.loading && !m.updated && !m.selling.length) return h("p.sub", null, h("span.spinner"), (" " + t("colonisation.carrierMarketSpansh")));
    if (m.error) return h("p.sub", null, t("colonisation.marketSpansh", { error: m.error }));
    const line = (x: { id: string; name: string; count: number }) => h("li", { class: needed.has(x.id) ? "needed" : "" }, h("span", null, name(x.id, x.name)), h("strong", null, `${fmt(x.count)} t`));
    return h(
      "div.carrier-market",
      null,
      m.source === "journal"
        ? h("p.sub", null, t("colonisation.marketJournal", { value: m.updated ? relTime(m.updated) : "?" }))
        : h("p.sub", null, t("colonisation.marketSpanshData", { value: m.updated ? relTime(m.updated) : "?" })),
      m.selling.length ? [h("small.sub", null, t("colonisation.saleStock")), h("ul.hold-list", null, m.selling.map(line))] : null,
      m.buying.length ? [h("small.sub", null, t("colonisation.buying")), h("ul.hold-list", null, m.buying.map(line))] : null,
      !m.selling.length && !m.buying.length ? h("p.empty", null, t("colonisation.noBuySellOrders")) : null,
    );
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
        : h("p.empty", null, t("colonisation.empty"));
    const shipItems = Object.entries(cmdr.cargo ?? {}).filter(([, n]) => n > 0) as [string, number][];
    const shipUsed = shipItems.reduce((s, [, n]) => s + n, 0);
    const cards: HTMLElement[] = [
      h(
        "div.hold",
        null,
        h("h4", null, t("common.ship")),
        h("p.sub", null, capacity ? t("colonisation.t", { shipUsed: fmt(shipUsed), capacity: fmt(capacity) }) : `${fmt(shipUsed)} t`),
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
          h("h4", null, c.mine ? t("colonisation.myFleetCarrier") : t("colonisation.squadronCarrier")),
          h("p.sub", { "data-no-tr": "" }, c.name),
          c.total !== undefined ? h("p.sub", null, t("colonisation.tGoodsGame", { total: fmt(c.total), relTime: relTime(c.totalAt) })) : null,
          list(items),
          unknown ? h("p.sub", null, t("colonisation.tNotIdentified", { unknown: fmt(unknown) })) : null,
          this.marketBlock(c.marketId, needed, name),
        ),
      );
    }
    return h(
      "section.card.holds",
      null,
      h("h3", null, t("colonisation.holds")),
      h("div.hold-grid", null, cards),
      this.carriers().length
        ? h("p.sub", null, t("colonisation.gameJournalDoesnTListCarrier"))
        : h("p.sub", null, t("colonisation.dockFleetCarrierSquadronSTransfer")),
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
        h("div", null, h("h3", null, d.station ?? t("colonisation.depot", { marketId: d.marketId })), d.system ? sys(d.system) : null),
        h("div.badges", null, d.complete ? h("span.badge.ok", null, t("common.done")) : d.failed ? h("span.badge.warn", null, t("colonisation.failed")) : h("span.badge", null, `${pct} %`), h("span.sub", null, t("common.updated", { relTime: relTime(d.updated) }))),
      ),
      h("div.bar.big", null, h("span", { style: { width: `${pct}%` } })),
      h(
        "div.stats",
        null,
        h("div.stat", null, h("strong", null, fmt(remaining)), h("span.sub", null, t("colonisation.tLeft"))),
        h("div.stat", null, h("strong", null, fmt(inHold)), h("span.sub", null, t("colonisation.usefulTHold"))),
        inCarrier ? h("div.stat", null, h("strong", null, fmt(inCarrier)), h("span.sub", null, t("colonisation.tUsefulCarriers"))) : null,
        trips !== null ? h("div.stat", null, h("strong", null, fmt(trips)), h("span.sub", null, t("colonisation.tripsTPerTrip", { capacity: fmt(capacity) }))) : null,
      ),
      h(
        "table.table.depot-table",
        null,
        h("thead", null, h("tr", null, h("th", null, t("colonisation.commodity")), h("th.num", null, t("colonisation.delivered")), h("th.num", null, t("colonisation.required")), h("th.num", null, t("common.left")), h("th.num", null, t("colonisation.hold")), showCarrier ? h("th.num", null, t("colonisation.carriers")) : null, h("th", null, ""))),
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
                        title: t("colonisation.findWhereBuyNear"),
                        onclick: () => {
                          presetSearch("buy", name);
                          this.ctx.store.setView("search");
                        },
                      },
                      icon("search"),
                      (" " + t("colonisation.buy")),
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
