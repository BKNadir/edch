// Search page: stations selling or buying a commodity, ships, modules and services near you, and
// the systems of a minor faction (Spansh), with the results as tables.

import { fold, gameEnglish, gameName, resolveGameName, t } from "../../platform/i18n.js";
import { locale } from "../../platform/i18n.js";
import { spanshPost } from "../../platform/bridge.js";
import { h, icon, fmt, replace } from "../../ui/dom.js";
import { stationIcon } from "../../ui/stationIcon.js";
import { referenceOf, type Ctx, type View } from "../../state/context.js";
import { fmtLy, inaraSystem } from "../../services/spansh.js";
import { copySystem } from "../shared/resultsTable.js";
import { openUrl } from "../../platform/bridge.js";
import { factionForm } from "./factionTab.js";

type Json = Record<string, any>;
type Tab = "buy" | "sell" | "ship" | "module" | "service" | "faction";

const STATION_TYPES = [
  "Asteroid base",
  "Coriolis Starport",
  "Dodec Starport",
  "Mega ship",
  "Ocellus Starport",
  "Orbis Starport",
  "Outpost",
  "Planetary Construction Depot",
  "Planetary Outpost",
  "Planetary Port",
  "Settlement",
  "Space Construction Depot",
  "Surface Settlement",
];
const CARRIER = "Drake-Class Carrier";
const SERVICES: [string, string][] = [
  ["Interstellar Factors Contact", "Interstellar Factors"],
  ["Material Trader", t("search.materialTrader")],
  ["Technology Broker", t("common.technologyBroker")],
  ["Universal Cartographics", "Universal Cartographics"],
  ["Vista Genomics", "Vista Genomics"],
  ["Black Market", t("search.blackMarket")],
  ["Shipyard", t("search.shipyard")],
  ["Outfitting", t("search.outfitting")],
  ["Refuel", t("search.refuel")],
  ["Repair", t("search.repair")],
  ["Restock", t("search.restock")],
  ["Search and Rescue", t("search.searchRescue")],
  ["Pioneer Supplies", "Pioneer Supplies"],
  ["Bartender", t("common.bartender")],
  ["Apex Interstellar", "Apex Interstellar"],
  ["Frontline Solutions", "Frontline Solutions"],
];
const CLASSES = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8"];
const RATINGS = ["", "A", "B", "C", "D", "E", "F", "G", "H", "I"];

let pending: { tab: "buy" | "sell"; value: string } | null = null;

/** Opens the search page on `tab` with `value` (an English game name) and runs it. */
export function presetSearch(tab: "buy" | "sell", value: string) {
  pending = { tab, value };
}

export class SearchView implements View {
  private root?: HTMLElement;
  private tab: Tab = "buy";
  private out = h("div.search-out");
  private form = h("div.search-form");
  private tabs = h("div.segmented");
  private opts = { largePad: false, carriers: false, planetary: true, sortPrice: true, minQty: 1 };
  private values: Record<Exclude<Tab, "faction">, string> = {
    buy: "",
    sell: "",
    ship: "",
    module: "",
    service: SERVICES[0][0],
  };
  private cls = "";
  /** Only the latest search may show its results (an older, slower answer is dropped). */
  private runId = 0;
  private rating = "";

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const g = this.ctx.game.data;
    // Shared datalists for names.
    const lists = h(
      "div",
      { style: { display: "none" } },
      h(
        "datalist#dl-commodities",
        null,
        g.commodities.map((c) => h("option", { value: gameName(c.name) }, gameName(c.category))),
      ),
      h(
        "datalist#dl-ships",
        null,
        g.ships.map((s) => h("option", { value: s })),
      ),
      h(
        "datalist#dl-modules",
        null,
        g.modules.map((s) => h("option", { value: gameName(s) })),
      ),
    );
    replace(
      root,
      h("header.view-head", null, h("h1", null, t("common.search2")), this.tabs),
      lists,
      h("section.card", null, this.form),
      this.out,
    );
    if (pending) {
      this.tab = pending.tab;
      this.values[pending.tab] = gameName(pending.value);
    }
    this.renderTabs();
    this.renderForm();
    if (pending) {
      pending = null;
      void this.run();
    }
  }

  update() {
    // Results are explicit (button); only the "around X" line follows the commander.
    if (!this.root) return;
    const where = this.form.querySelector(".opts .sub");
    if (where)
      where.textContent = t("common.aroundLyMax", {
        label: referenceOf(this.ctx).label,
        maxDistance: this.ctx.store.state.settings.maxDistance,
      });
  }

  private renderTabs() {
    const labels: [Tab, string][] = [
      ["buy", t("search.buyCommodity")],
      ["sell", t("search.sellCommodity")],
      ["ship", t("search.ships")],
      ["module", t("common.modules")],
      ["service", t("search.services")],
      ["faction", t("search.faction")],
    ];
    replace(
      this.tabs,
      labels.map(([tab, l]) =>
        h(
          "button",
          {
            class: this.tab === tab ? "active" : "",
            onclick: () => ((this.tab = tab), this.renderTabs(), this.renderForm(), replace(this.out)),
          },
          l,
        ),
      ),
    );
  }

  private renderForm() {
    if (this.tab === "faction") {
      replace(this.form, factionForm(this.ctx, this.out));
      return;
    }
    const tab = this.tab;
    const input = (list: string, placeholder: string) =>
      h("input.big", {
        type: "text",
        value: this.values[tab],
        list,
        placeholder,
        spellcheck: false,
        oninput: (e: Event) => (this.values[tab] = (e.target as HTMLInputElement).value),
        onkeydown: (e: KeyboardEvent) => e.key === "Enter" && this.run(),
      });
    const check = (key: "largePad" | "carriers" | "planetary" | "sortPrice", label: string) =>
      h(
        "label.check",
        null,
        h("input", {
          type: "checkbox",
          checked: this.opts[key],
          onchange: (e: Event) => (this.opts[key] = (e.target as HTMLInputElement).checked),
        }),
        ` ${label}`,
      );

    let main: HTMLElement;
    if (tab === "buy" || tab === "sell") main = input("dl-commodities", t("search.commodityEGTritiumGoldLow"));
    else if (tab === "ship") main = input("dl-ships", t("search.shipEGKraitMkiiAnaconda"));
    else if (tab === "module")
      main = h(
        "div.row",
        null,
        input("dl-modules", t("search.moduleEGFrameShiftDrive")),
        h(
          "select",
          {
            title: t("search.moduleClass"),
            onchange: (e: Event) => (this.cls = (e.target as HTMLSelectElement).value),
          },
          CLASSES.map((c) =>
            h("option", { value: c, selected: c === this.cls }, c ? t("search.class", { c }) : t("search.anyClass")),
          ),
        ),
        h(
          "select",
          {
            title: t("search.moduleRating"),
            onchange: (e: Event) => (this.rating = (e.target as HTMLSelectElement).value),
          },
          RATINGS.map((r) =>
            h(
              "option",
              { value: r, selected: r === this.rating },
              r ? t("search.rating", { r }) : t("search.anyRating"),
            ),
          ),
        ),
      );
    else
      main = h(
        "select.big",
        { onchange: (e: Event) => (this.values.service = (e.target as HTMLSelectElement).value) },
        SERVICES.map(([v, l]) => h("option", { value: v, selected: v === this.values.service }, l)),
      );

    replace(
      this.form,
      h(
        "div.row",
        null,
        main,
        h("button.primary", { onclick: () => this.run() }, icon("search"), " " + t("common.search")),
      ),
      h(
        "div.row.opts",
        null,
        check("largePad", t("search.lPadOnly")),
        check("carriers", t("search.includeFleetCarriers")),
        check("planetary", t("search.includePlanetaryPorts")),
        tab === "buy" || tab === "sell"
          ? check("sortPrice", tab === "buy" ? t("search.sortLowestPrice") : t("search.sortBestPrice"))
          : null,
        h(
          "span.sub",
          null,
          t("common.aroundLyMax", {
            label: referenceOf(this.ctx).label,
            maxDistance: this.ctx.store.state.settings.maxDistance,
          }),
        ),
      ),
    );
  }

  private filters(): Json {
    const s = this.ctx.store.state.settings;
    const f: Json = { distance: { min: "0", max: String(s.maxDistance) } };
    if (this.opts.largePad) f.has_large_pad = { value: ["true"] };
    if (!this.opts.carriers || !this.opts.planetary) {
      const types = STATION_TYPES.filter((ty) => this.opts.planetary || !/planetary|settlement|surface/i.test(ty));
      if (this.opts.carriers) types.push(CARRIER);
      f.type = { value: types };
    }
    return f;
  }

  private async run() {
    const tab = this.tab;
    if (tab === "faction") return;
    const typed = this.values[tab].trim();
    if (!typed) return;
    // Names can be typed in the app's language or in English; Spansh only knows English.
    const value = gameEnglish(typed);
    const g = this.ctx.game.data;
    const f = this.filters();
    let name = value;
    // Typed in any language, with or without accents, or only partly: find the game's name.
    const pick = (candidates: string[], several: (typed: string) => string): string | null => {
      const r = resolveGameName(typed, candidates);
      if (r.name) {
        if (fold(gameName(r.name)) !== fold(typed) && fold(r.name) !== fold(typed)) {
          this.values[tab] = gameName(r.name);
          const input = this.form.querySelector<HTMLInputElement>("input.big");
          if (input) input.value = this.values[tab];
        }
        return r.name;
      }
      replace(
        this.out,
        r.suggestions.length
          ? h(
              "div.notice",
              null,
              icon("search"),
              ` ${several(typed)} `,
              r.suggestions.flatMap((sug, i) => [
                i ? " · " : "",
                h(
                  "button.inline-link.ref-link",
                  {
                    "data-no-tr": "",
                    onclick: () => ((this.values[tab] = gameName(sug)), this.renderForm(), this.run()),
                  },
                  gameName(sug),
                ),
              ]),
            )
          : h("p.empty", null, t("search.noKnownNameMatchesPickOne", { typed })),
      );
      return null;
    };
    if (tab === "buy" || tab === "sell") {
      const found = pick(
        g.commodities.map((c) => c.name),
        (x) => t("search.severalCommoditiesMatch", { x }),
      );
      if (!found) return;
      name = found;
      f.market = [
        {
          name,
          [tab === "buy" ? "supply" : "demand"]: { value: [String(this.opts.minQty), "1000000000"], comparison: "<=>" },
        },
      ];
    } else if (tab === "ship") {
      const found = pick(g.ships, (x) => t("search.severalShipsMatch", { x }));
      if (!found) return;
      name = found;
      f.ships = { value: [name] };
    } else if (tab === "module") {
      const found = pick(g.modules, (x) => t("search.severalModulesMatch", { x }));
      if (!found) return;
      name = found;
      const group: Json = { name: { value: [name, ...(g.moduleAliases[name] ?? [])] } };
      if (this.cls) group.class = { value: [this.cls] };
      if (this.rating) group.rating = { value: [this.rating] };
      f.modules = [group];
    } else {
      f.services = [{ name: { value: [value] } }];
    }

    const ref = referenceOf(this.ctx);
    const body: Json = {
      filters: f,
      sort: [{ distance: { direction: "asc" } }],
      size: tab === "buy" || tab === "sell" ? 50 : 20,
      page: 0,
      ...(ref.coords
        ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } }
        : { reference_system: ref.system }),
    };
    replace(this.out, h("p.sub", null, h("span.spinner"), " " + t("common.searchingSpansh")));
    const id = ++this.runId;
    try {
      const res = await spanshPost("stations/search", body);
      if (id !== this.runId) return;
      let rows: Json[] = Array.isArray(res?.results) ? res.results : [];
      if ((tab === "buy" || tab === "sell") && this.opts.sortPrice) {
        const price = (r: Json) => {
          const m = (r.market ?? []).find((x: Json) => String(x.commodity).toLowerCase() === name.toLowerCase());
          return m ? Number(tab === "buy" ? m.buy_price : m.sell_price) : NaN;
        };
        rows = rows
          .filter((r) => !Number.isNaN(price(r)))
          .sort((a, b) => (tab === "buy" ? price(a) - price(b) : price(b) - price(a)));
      }
      if (!rows.length) {
        replace(
          this.out,
          h(
            "p.empty",
            null,
            t("search.nothingFoundWithinLyIncreaseDistance", {
              maxDistance: this.ctx.store.state.settings.maxDistance,
            }),
          ),
        );
        return;
      }
      replace(
        this.out,
        h(
          "p.sub",
          null,
          t("search.matchingStationsShown", { count: fmt(Number(res.count ?? rows.length)), count2: rows.length }),
        ),
        h(
          "table.table.search-table",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, t("common.station")),
              h("th.num", null, t("common.distance")),
              h(
                "th",
                null,
                tab === "buy"
                  ? t("search.buyPriceStock")
                  : tab === "sell"
                    ? t("search.sellPriceDemand")
                    : tab === "service"
                      ? t("common.type")
                      : t("search.details"),
              ),
              h("th", null, t("search.padArrival")),
              h("th", null, t("search.updated")),
            ),
          ),
          h(
            "tbody",
            null,
            rows.map((r) => this.row(r, tab, name)),
          ),
        ),
      );
    } catch (e) {
      if (id !== this.runId) return;
      replace(this.out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private row(r: Json, tab: Tab, name: string): HTMLElement {
    let detail: (string | HTMLElement)[] = [];
    if (tab === "buy" || tab === "sell") {
      const m = (r.market ?? []).find((x: Json) => String(x.commodity).toLowerCase() === name.toLowerCase());
      if (m)
        detail =
          tab === "buy"
            ? [
                h("strong", null, t("search.cr", { buyPrice: fmt(m.buy_price) })),
                " " + t("search.stock", { supply: fmt(m.supply) }),
              ]
            : [
                h("strong", null, t("search.cr", { buyPrice: fmt(m.sell_price) })),
                " " + t("search.demand", { demand: fmt(m.demand) }),
              ];
    } else if (tab === "ship") {
      const s = (r.ships ?? []).find((x: Json) => String(x.name).toLowerCase() === name.toLowerCase());
      detail = [s?.price ? h("strong", null, t("search.cr", { buyPrice: fmt(s.price) })) : t("search.sale")];
    } else if (tab === "module") {
      const mods = (r.modules ?? []).filter(
        (x: Json) =>
          String(x.name).toLowerCase() === name.toLowerCase() ||
          (this.ctx.game.data.moduleAliases[name] ?? []).some((a) => a.toLowerCase() === String(x.name).toLowerCase()),
      );
      detail = [
        mods
          .slice(0, 6)
          .map((x: Json) => `${x.class ?? ""}${x.rating ?? ""}`)
          .join(" · ") || t("search.available"),
      ];
    } else detail = [r.type ?? ""];
    const pad = r.has_large_pad ? "L" : r.medium_pads > 0 ? "M" : r.small_pads > 0 ? "S" : "?";
    const age = r.market_updated_at ?? r.outfitting_updated_at ?? r.shipyard_updated_at ?? r.updated_at;
    return h(
      "tr",
      null,
      h(
        "td",
        null,
        h(
          "button.sys",
          { title: t("common.copy", { name: r.system_name }), onclick: () => copySystem(r.system_name) },
          icon("copy"),
          stationIcon(r.type),
          h("span", null, `${r.name} | ${r.system_name}`),
        ),
        h(
          "button.link",
          { title: t("search.openInara"), onclick: () => openUrl(inaraSystem(r.system_name)) },
          "Inara",
          icon("link"),
        ),
      ),
      h("td.num", null, fmtLy(Number(r.distance))),
      h("td", null, detail),
      h(
        "td",
        null,
        `${pad} · ${r.distance_to_arrival !== undefined ? t("common.ls", { locale: fmt(Math.round(Number(r.distance_to_arrival))) }) : "?"}`,
      ),
      h(
        "td.sub",
        { "data-sort": age ?? "" },
        age ? new Date(age.endsWith("Z") || age.includes("+") ? age : `${age}Z`).toLocaleDateString(locale()) : "",
      ),
    );
  }
}
