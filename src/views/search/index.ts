// Search page: stations selling or buying a commodity, ships, modules and services near you, and
// the systems of a minor faction (Spansh), with the results as tables.

import { fold, gameEnglish, gameName, resolveGameName, t } from "../../platform/i18n.js";
import { locale } from "../../platform/i18n.js";
import { spanshPost } from "../../platform/bridge.js";
import { h, icon, fmt, replace, toast } from "../../ui/dom.js";
import { debugSource } from "../../ui/debugSource.js";
import { stationIcon } from "../../ui/stationIcon.js";
import { relTime } from "../../ui/format.js";
import { sameModule, stationSells, type WantedModule } from "../../features/search/fitModules.js";
import { referenceOf, type Ctx, type View } from "../../state/context.js";
import { referenceField } from "../shared/referenceField.js";
import { radiusField, rangeOf } from "../shared/radiusField.js";
import { SERVICE_KINDS, serviceKindOf } from "../../game/serviceKinds.js";
import { fmtLy, inaraSystem } from "../../services/spansh.js";
import { copySystem } from "../shared/resultsTable.js";
import { openUrl } from "../../platform/bridge.js";
import { factionForm, searchFactionNow } from "./factionTab.js";
import { factionsOf } from "../shared/factionField.js";
import { guessSearch } from "../../features/search/autoSearch.js";
import { log } from "../../platform/logger.js";
import { openSystemPage, systemInfo } from "../shared/links.js";
import { systemForm } from "./systemTab.js";
import { ardentBuyQuotes, ardentSellQuotes, type ArdentQuote } from "../../services/ardent.js";
import {
  ARRIVAL_CHOICES,
  spanshMarketSort,
  STATION_SORTS,
  arrivalAllowed,
  stationOrder,
  type SortableStation,
  type StationSort,
} from "../../features/search/stationSort.js";
import {
  ARDENT_STATION_TYPES,
  QUOTE_SOURCE_LABELS,
  ardentStationAllowed,
  quoteTime,
  freshestQuote,
  meetsDemand,
  newestZoneQuotes,
  recentEnough,
  type MarketQuote,
} from "../../features/market/freshestQuote.js";
import { edcnQuotes } from "../../services/edcn.js";
import { priceAgeLabel } from "../shared/marketFilters.js";
import { DATA_AGE_CHOICES } from "../../state/dataAge.js";

type Json = Record<string, any>;
type Tab = "auto" | "buy" | "sell" | "ship" | "module" | "service" | "system" | "faction";
/** The tabs with their own form (not the station search). */
type OwnFormTab = "system" | "faction";
/** The Commodity tab's two modes, switched by a toggle. */
type CommodityMode = "buy" | "sell";

/** Where the Commodity tab's last mode is kept, so the tab comes back to it. */
const COMMODITY_MODE_KEY = "edch.searchCommodityMode";

/** The Commodity tab's last mode ("buy" when none was kept or storage is unavailable). */
function savedCommodityMode(): CommodityMode {
  try {
    return localStorage.getItem(COMMODITY_MODE_KEY) === "sell" ? "sell" : "buy";
  } catch {
    return "buy";
  }
}

/** Keeps the Commodity tab's mode for the next visit. */
function saveCommodityMode(mode: CommodityMode) {
  try {
    localStorage.setItem(COMMODITY_MODE_KEY, mode);
  } catch {
    /* not kept: the tab opens on Buy next time */
  }
}

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
/** A search's results: the nearest stations loaded once, filtered, in the "Sort by" order. */
interface StationResults {
  tab: Tab;
  name: string;
  rows: Json[];
  /** How many stations Spansh counts in all. */
  total: number;
  /** How many of them were loaded, up to the setting. */
  loaded: number;
  /** Whether those are the nearest ones (else the first in the "Sort by" order, Spansh sorting). */
  nearest: boolean;
  /** Puts the rows in the "Sort by" order chosen now. */
  reorder: () => void;
}

/** Stations per Spansh request, and requests sent together. */
const SPANSH_PAGE_SIZE = 100;
const PARALLEL_PAGES = 3;

/** A number from Spansh's or Ardent's JSON, or undefined. */
const numberOrUndefined = (value: unknown) =>
  value === null || value === undefined || value === "" || Number.isNaN(Number(value)) ? undefined : Number(value);

/** Short names of the trader and broker kinds, shown next to a station. */
const KIND_LABELS: Record<string, string> = {
  raw: t("search.kindRaw"),
  manufactured: t("search.kindManufactured"),
  encoded: t("search.kindEncoded"),
  guardian: t("search.kindGuardian"),
  human: t("search.kindHuman"),
};
const CLASSES = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8"];
const RATINGS = ["", "A", "B", "C", "D", "E", "F", "G", "H", "I"];

let pending: { tab: "buy" | "sell"; value: string } | null = null;

/** Opens the search page on `tab` with `value` (an English game name) and runs it. */
export function presetSearch(tab: "buy" | "sell", value: string) {
  pending = { tab, value };
}

export class SearchView implements View {
  private root?: HTMLElement;
  /** The Commodity tab's mode: buying or selling. */
  private commodityMode: CommodityMode = savedCommodityMode();
  /** Auto first: it recognises what is typed and switches to the right tab. */
  private tab: Tab = "auto";
  private out = h("div.search-out");
  private form = h("div.search-form");
  private tabs = h("div.segmented");
  private opts = { largePad: false, carriers: false, planetary: true, maxArrival: 0 };
  /** The sort chosen on each tab (its first choice by default). */
  private sorts: Partial<Record<keyof typeof STATION_SORTS, StationSort>> = {};

  /** The sort of `tab`, one it offers. */
  private sortOf(tab: keyof typeof STATION_SORTS): StationSort {
    const offered: readonly StationSort[] = STATION_SORTS[tab];
    const chosen = this.sorts[tab];
    return chosen && offered.includes(chosen) ? chosen : offered[0];
  }
  /** The name of the "Sort by" choice of a commodity tab (results not sorted by Spansh: none). */
  private sortedBy(tab: Tab): string {
    return tab === "buy" || tab === "sell" ? this.sortLabel(tab, this.sortOf(tab)) : "";
  }
  /** Results drawn so far, each a new search or "Sort by" order (see showResults). */
  private drawnOrders = 0;
  /** Selling: the price kept for each Spansh result (the most recent of Spansh's and Ardent's). */
  private quotes = new Map<Json, MarketQuote>();

  /** Runs the search again after a sort or filter change, when one was already made. */
  private rerun() {
    if (this.tab !== "faction" && this.tab !== "system" && this.values[this.tab].trim() && this.out.childElementCount)
      void this.run();
  }

  /** A sort's name on `tab` ("Lowest price" when buying, "Best price" when selling…). */
  private sortLabel(tab: keyof typeof STATION_SORTS, sort: StationSort): string {
    if (sort === "price") return tab === "sell" ? t("search.sortPriceBest") : t("search.sortPriceLowest");
    if (sort === "volume") return tab === "sell" ? t("search.sortDemand") : t("search.sortStock");
    if (sort === "distance") return t("search.sortDistance");
    if (sort === "recent") return t("search.sortRecent");
    return t("search.sortArrival");
  }

  /** The range typed on this page (light years), or undefined for the Settings default. */
  private ownRange?: number;

  /** How far the searches look around the reference system. */
  private range(): number {
    return rangeOf(this.ownRange, this.ctx.store.state.settings.maxDistance);
  }

  /** The minimum quantity of `tab` (at least 1 t): the supply setting when buying, demand when selling. */
  private minQuantity(tab: Tab): number {
    const s = this.ctx.store.state.settings;
    return Math.max(1, Math.floor(Number(tab === "buy" ? s.minBuySupply : s.minSellDemand) || 1));
  }

  private values: Record<Exclude<Tab, OwnFormTab>, string> = {
    auto: "",
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
  /** Trader and broker kinds unticked on the Services tab (all are shown by default). */
  private hiddenKinds = new Set<string>();
  /** The last search's results, drawn a page at a time. */
  private results?: StationResults;
  /** The modules of the last module search (shown on each result). */
  private wantedModules: WantedModule[] = [];
  /** Modules tab: the modules a station must all sell (a fit), empty for a single module search. */
  private moduleList: WantedModule[] = [];

  constructor(private ctx: Ctx) {}

  /** Adds the module typed (with its class and rating) to the list; false when the name is unknown. */
  private addModule(): boolean {
    const typed = this.values.module.trim();
    if (!typed) return false;
    const found = resolveGameName(gameEnglish(typed), this.ctx.game.data.modules).name;
    if (!found) {
      toast(t("search.moduleUnknown", { name: typed }));
      return false;
    }
    const wanted = { name: found, cls: this.cls, rating: this.rating };
    if (!this.moduleList.some((m) => sameModule(m, wanted))) this.moduleList.push(wanted);
    this.values.module = "";
    this.renderForm();
    return true;
  }

  /** "Frame Shift Drive 5A", "Beam Laser 3": a wanted module in a few words. */
  private moduleLabel(m: WantedModule): string {
    return `${gameName(m.name)}${m.cls || m.rating ? ` ${m.cls}${m.rating}` : ""}`;
  }

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
      h(
        "datalist#dl-auto",
        null,
        g.commodities.map((c) => h("option", { value: gameName(c.name) }, t("search.autoCommodity"))),
        g.ships.map((s) => h("option", { value: s }, t("search.autoShip"))),
        g.modules.map((s) => h("option", { value: gameName(s) }, t("search.autoModule"))),
        SERVICES.map(([, label]) => h("option", { value: label }, t("search.autoService"))),
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
      this.tab = this.commodityMode = pending.tab;
      saveCommodityMode(pending.tab);
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
        maxDistance: this.range(),
      });
  }

  private renderTabs() {
    const labels: [Tab, string][] = [
      ["auto", t("search.autoTab")],
      [this.commodityMode, t("search.commodityTab")],
      ["ship", t("search.ships")],
      ["module", t("common.modules")],
      ["service", t("search.services")],
      ["system", t("search.systemsTab")],
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

  /** Switches the Commodity tab between buying and selling, keeping the commodity typed. */
  private setCommodityMode(mode: CommodityMode) {
    if (mode === this.commodityMode && this.tab === mode) return;
    this.values[mode] = this.values[this.tab === "buy" || this.tab === "sell" ? this.tab : this.commodityMode];
    this.tab = this.commodityMode = mode;
    saveCommodityMode(mode);
    this.renderTabs();
    this.renderForm();
    replace(this.out);
    this.rerun();
  }

  /** The Buy / Sell toggle of the Commodity tab. */
  private commodityModeSwitch(): HTMLElement {
    const modes: [CommodityMode, string][] = [
      ["buy", t("search.modeBuy")],
      ["sell", t("search.modeSell")],
    ];
    return h(
      "div.segmented.commodity-mode",
      { role: "group" },
      modes.map(([mode, label]) =>
        h(
          "button",
          {
            class: this.tab === mode ? "active" : "",
            "aria-pressed": String(this.tab === mode),
            onclick: () => this.setCommodityMode(mode),
          },
          label,
        ),
      ),
    );
  }

  private renderForm() {
    if (this.tab === "faction") {
      replace(this.form, factionForm(this.ctx, this.out));
      return;
    }
    if (this.tab === "system") {
      replace(this.form, systemForm(this.ctx, this.out));
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
    const check = (key: "largePad" | "carriers" | "planetary", label: string) =>
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

    if (tab === "auto") {
      replace(
        this.form,
        h(
          "div.row",
          null,
          input("dl-auto", t("search.autoPlaceholder")),
          h("button.primary", { onclick: () => this.run() }, icon("search"), " " + t("common.search")),
        ),
        h("p.sub", null, t("search.autoHelp")),
      );
      return;
    }
    let main: HTMLElement;
    if (tab === "buy" || tab === "sell") main = input("dl-commodities", t("search.commodityEGTritiumGoldLow"));
    else if (tab === "ship") main = input("dl-ships", t("search.shipEGKraitMkiiAnaconda"));
    else if (tab === "module")
      main = h(
        "div.row",
        null,
        input("dl-modules", t("search.moduleEGFrameShiftDrive")),
        h(
          "button.ghost",
          { title: t("search.addModuleHelp"), onclick: () => this.addModule() },
          "+ " + t("search.addModule"),
        ),
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
        {
          onchange: (e: Event) => {
            this.values.service = (e.target as HTMLSelectElement).value;
            this.renderForm();
          },
        },
        SERVICES.map(([v, l]) => h("option", { value: v, selected: v === this.values.service }, l)),
      );

    replace(
      this.form,
      h(
        "div.row",
        null,
        tab === "buy" || tab === "sell" ? this.commodityModeSwitch() : null,
        main,
        h("button.primary", { onclick: () => this.run() }, icon("search"), " " + t("common.search")),
      ),
      tab === "service" && SERVICE_KINDS.some((k) => k.service === this.values.service)
        ? h(
            "div.row.opts.service-kinds",
            null,
            h("span.sub", null, t("search.serviceKinds")),
            SERVICE_KINDS.filter((k) => k.service === this.values.service).map((k) =>
              h(
                "button.chip.toggle",
                {
                  class: this.hiddenKinds.has(k.kind) ? "" : "on",
                  "aria-pressed": String(!this.hiddenKinds.has(k.kind)),
                  onclick: () => {
                    if (this.hiddenKinds.has(k.kind)) this.hiddenKinds.delete(k.kind);
                    else this.hiddenKinds.add(k.kind);
                    this.renderForm();
                    this.rerun();
                  },
                },
                KIND_LABELS[k.kind],
              ),
            ),
          )
        : null,
      tab === "module"
        ? h(
            "div.row.opts.fit-modules",
            null,
            this.moduleList.length
              ? this.moduleList.map((m, i) =>
                  h(
                    "span.chip",
                    null,
                    this.moduleLabel(m),
                    h(
                      "button.icon-btn",
                      {
                        title: t("common.remove"),
                        onclick: () => {
                          this.moduleList.splice(i, 1);
                          this.renderForm();
                        },
                      },
                      icon("close"),
                    ),
                  ),
                )
              : h("span.sub", null, t("search.moduleListHelp")),
            this.moduleList.length
              ? h(
                  "button.ghost",
                  {
                    onclick: () => {
                      this.moduleList = [];
                      this.renderForm();
                    },
                  },
                  t("search.clearModules"),
                )
              : null,
          )
        : null,
      h(
        "div.row.opts",
        null,
        referenceField(this.ctx, () => this.update()),
        radiusField(this.ownRange, this.ctx.store.state.settings.maxDistance, (range) => {
          this.ownRange = range;
          this.renderForm();
          this.rerun();
        }),
      ),
      h(
        "div.row.opts",
        null,
        check("largePad", t("search.lPadOnly")),
        check("carriers", t("search.includeFleetCarriers")),
        check("planetary", t("search.includePlanetaryPorts")),
        h(
          "label.check",
          null,
          t("search.maxArrival") + " ",
          h(
            "select",
            {
              onchange: (e: Event) => {
                this.opts.maxArrival = Number((e.target as HTMLSelectElement).value);
                this.rerun();
              },
            },
            ARRIVAL_CHOICES.map((ls) =>
              h(
                "option",
                { value: String(ls), selected: ls === this.opts.maxArrival },
                ls ? t("common.ls", { locale: fmt(ls) }) : t("search.anyArrival"),
              ),
            ),
          ),
        ),
        h(
          "label.check",
          null,
          t("search.sortBy") + " ",
          h(
            "select",
            {
              onchange: (e: Event) => {
                this.sorts[tab] = (e.target as HTMLSelectElement).value as StationSort;
                // A commodity: Spansh picks the stations in that order, so it is asked again.
                // Otherwise the results already here are put in the new order, with no request.
                if (tab === "buy" || tab === "sell") this.rerun();
                else if (this.results?.tab === tab) {
                  this.results.reorder();
                  this.showResults();
                }
              },
            },
            STATION_SORTS[tab].map((sort: StationSort) =>
              h("option", { value: sort, selected: sort === this.sortOf(tab) }, this.sortLabel(tab, sort)),
            ),
          ),
        ),
        tab === "buy" || tab === "sell"
          ? h(
              "label.check",
              null,
              (tab === "buy" ? t("search.minStock") : t("search.minDemand")) + " ",
              h("input.num-small", {
                type: "number",
                min: "1",
                step: "100",
                value: String(this.minQuantity(tab)),
                onchange: (e: Event) => {
                  const quantity = Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value) || 1));
                  this.ctx.store.updateSettings(
                    tab === "buy" ? { minBuySupply: quantity } : { minSellDemand: quantity },
                  );
                  this.renderForm();
                  this.rerun();
                },
              }),
            )
          : null,
        tab !== "service"
          ? h(
              "label.check",
              null,
              t("search.maxAge") + " ",
              h(
                "select",
                {
                  title: t("market.dataAgeHelp"),
                  onchange: (e: Event) => {
                    this.ctx.store.updateSettings({ maxAgeDays: Number((e.target as HTMLSelectElement).value) });
                    this.renderForm();
                    this.rerun();
                  },
                },
                DATA_AGE_CHOICES.map((days) =>
                  h(
                    "option",
                    { value: String(days), selected: days === this.ctx.store.state.settings.maxAgeDays },
                    priceAgeLabel(days),
                  ),
                ),
              ),
            )
          : null,
        h(
          "span.sub",
          null,
          t("common.aroundLyMax", {
            label: referenceOf(this.ctx).label,
            maxDistance: this.range(),
          }),
        ),
      ),
    );
  }

  private filters(): Json {
    const f: Json = { distance: { min: "0", max: String(this.range()) } };
    if (this.opts.largePad) f.has_large_pad = { value: ["true"] };
    if (!this.opts.carriers || !this.opts.planetary) {
      const types = STATION_TYPES.filter((ty) => this.opts.planetary || !/planetary|settlement|surface/i.test(ty));
      if (this.opts.carriers) types.push(CARRIER);
      f.type = { value: types };
    }
    return f;
  }

  /**
   * Auto: finds what was typed (commodity, ship, module, service, faction) and runs that tab's
   * search; anything else opens the page of the system with that name.
   */
  private async runAuto(): Promise<void> {
    const typed = this.values.auto.trim();
    if (!typed) return;
    const g = this.ctx.game.data;
    const target = guessSearch(typed, {
      commodities: g.commodities.map((c) => c.name),
      ships: g.ships,
      modules: g.modules,
      services: SERVICES,
      factions: await factionsOf(this.ctx),
    });
    if (!target) return;
    log.debug("search", `auto: ${target.kind}`);
    const show = (tab: Tab) => {
      this.tab = tab;
      this.renderTabs();
      this.renderForm();
    };
    switch (target.kind) {
      case "commodity":
        this.values[this.commodityMode] = gameName(target.name);
        show(this.commodityMode);
        return this.run();
      case "ship":
        this.values.ship = target.name;
        show("ship");
        return this.run();
      case "module":
        this.values.module = gameName(target.name);
        this.moduleList = [];
        show("module");
        return this.run();
      case "service":
        this.values.service = target.name;
        show("service");
        return this.run();
      case "faction":
        // The name first, so the Faction form shows it.
        searchFactionNow(this.ctx, this.out, target.name);
        show("faction");
        return;
      case "system":
        openSystemPage(target.name);
    }
  }

  private async run(): Promise<void> {
    const tab = this.tab;
    if (tab === "auto") return this.runAuto();
    if (tab === "faction" || tab === "system") return;
    const typed = this.values[tab].trim();
    if (!typed && !(tab === "module" && this.moduleList.length)) return;
    let wantedModules: WantedModule[] = [];
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
          [tab === "buy" ? "supply" : "demand"]: {
            value: [String(this.minQuantity(tab)), "1000000000"],
            comparison: "<=>",
          },
        },
      ];
    } else if (tab === "ship") {
      const found = pick(g.ships, (x) => t("search.severalShipsMatch", { x }));
      if (!found) return;
      name = found;
      f.ships = { value: [name] };
    } else if (tab === "module") {
      // A module typed and a list: it joins the list. Spansh is asked for the first module; the
      // stations that also sell all the others are kept here.
      if (typed) {
        const found = pick(g.modules, (x) => t("search.severalModulesMatch", { x }));
        if (!found) return;
        name = found;
        const wanted = { name, cls: this.cls, rating: this.rating };
        if (this.moduleList.length && !this.moduleList.some((m) => sameModule(m, wanted))) {
          this.moduleList.push(wanted);
          this.values.module = "";
          this.renderForm();
        }
      }
      wantedModules = this.moduleList.length ? [...this.moduleList] : [{ name, cls: this.cls, rating: this.rating }];
      const first = wantedModules[0];
      name = first.name;
      const group: Json = { name: { value: [first.name, ...(g.moduleAliases[first.name] ?? [])] } };
      if (first.cls) group.class = { value: [first.cls] };
      if (first.rating) group.rating = { value: [first.rating] };
      f.modules = [group];
    } else {
      // Traders and brokers: only the kinds ticked (all of them: no filter, unknown kinds too).
      const service = this.values.service;
      f.services = [{ name: { value: [service] } }];
      const kinds = SERVICE_KINDS.filter((k) => k.service === service);
      const ticked = kinds.filter((k) => !this.hiddenKinds.has(k.kind));
      if (ticked.length && ticked.length < kinds.length)
        f.primary_economy = { value: ticked.flatMap((k) => k.economies) };
    }

    const ref = referenceOf(this.ctx);
    const commodity = tab === "buy" || tab === "sell";
    if (commodity) {
      // Only markets seen within the data age: old prices would take the first places.
      const now = Date.now();
      f.market_updated_at = {
        value: [
          new Date(now - this.ctx.store.state.settings.maxAgeDays * 86_400_000).toISOString(),
          new Date(now).toISOString(),
        ],
        comparison: "<=>",
      };
    }
    // A commodity: Spansh sorts the markets on the "Sort by" choice itself, so the stations loaded
    // are the best of the zone for it (the largest supply first by default); otherwise the nearest.
    const spanshSort = commodity ? spanshMarketSort(this.sortOf(tab), tab === "buy", name) : undefined;
    const body = (page: number): Json => ({
      filters: f,
      sort: [spanshSort ?? { distance: { direction: "asc" } }],
      size: SPANSH_PAGE_SIZE,
      page,
      ...(ref.coords
        ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } }
        : { reference_system: ref.system }),
    });
    replace(this.out, h("p.sub", null, h("span.spinner"), " " + t("common.searching")));
    const id = ++this.runId;
    try {
      // The first stations in that order, up to the number set in Settings, asked once: sorting
      // them by column and changing page is then done here, with no new request.
      const answers: Json[] = [await spanshPost("stations/search", body(0))];
      const wanted = Math.min(
        Math.ceil(this.ctx.store.state.settings.searchLoad / SPANSH_PAGE_SIZE),
        Math.ceil(Number(answers[0]?.count ?? 0) / SPANSH_PAGE_SIZE),
      );
      // The other pages a few at a time, so Spansh isn't flooded.
      for (let page = 1; page < wanted; page += PARALLEL_PAGES) {
        if (id !== this.runId) return;
        const batch = Array.from({ length: Math.min(PARALLEL_PAGES, wanted - page) }, (_, i) => page + i);
        answers.push(...(await Promise.all(batch.map((n) => spanshPost("stations/search", body(n))))));
      }
      if (id !== this.runId) return;
      const settings = this.ctx.store.state.settings;
      const quoteOf = (r: Json) =>
        (r.market ?? []).find((x: Json) => String(x.commodity).toLowerCase() === name.toLowerCase());
      const buying = tab === "buy";
      const minVolume = this.minQuantity(tab);
      // Buying and selling: Ardent's prices of the whole zone, asked once.
      let ardent = new Map<number, ArdentQuote>();
      if (tab === "buy" || tab === "sell") {
        const symbol = g.commodities.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id;
        const ask = buying ? ardentBuyQuotes : ardentSellQuotes;
        // EDCN too: for each market, the most recent of the two.
        const [fromArdent, fromEdcn] = await Promise.all([
          symbol && ref.system
            ? ask(ref.system, symbol, this.range(), settings.maxAgeDays, minVolume)
            : Promise.resolve(new Map<number, ArdentQuote>()),
          symbol ? edcnQuotes(ref, symbol, buying, this.range()) : Promise.resolve(new Map()),
        ]);
        ardent = newestZoneQuotes(fromArdent, fromEdcn);
        if (id !== this.runId) return;
      }
      // Every result received so far, merged, filtered and in the order chosen.
      const results = (): Json[] => {
        let rows: Json[] = answers.flatMap((a) => (Array.isArray(a?.results) ? a.results : []));
        // Buying and selling: each market's most recent price between Spansh's and Ardent's, and
        // the best recent markets of the zone that only Ardent or EDCN returned.
        const quotes = new Map<Json, MarketQuote>();
        if (tab === "buy" || tab === "sell") {
          for (const r of rows) {
            const m = quoteOf(r);
            if (!m) continue;
            const spansh: MarketQuote = {
              price: Number(buying ? m.buy_price : m.sell_price),
              demand: Number((buying ? m.supply : m.demand) ?? 0),
              updated: r.market_updated_at ?? r.updated_at,
              source: "spansh",
            };
            quotes.set(r, freshestQuote(spansh, ardent.get(Number(r.market_id))));
          }
          const known = new Set(rows.map((r) => Number(r.market_id)));
          for (const quote of ardent.values()) {
            if (known.has(quote.marketId) || !ardentStationAllowed(quote, this.opts)) continue;
            // Drawn like Spansh's results.
            const row: Json = {
              name: quote.station,
              system_name: quote.system,
              type: ARDENT_STATION_TYPES[quote.stationType] ?? quote.stationType,
              has_large_pad: quote.padSize === 3,
              medium_pads: quote.padSize >= 2 ? 1 : 0,
              small_pads: quote.padSize >= 1 ? 1 : 0,
              distance: quote.distance,
              distance_to_arrival: quote.arrival,
              market_id: quote.marketId,
              market: [{ commodity: name }],
            };
            rows.push(row);
            quotes.set(row, {
              price: quote.price,
              demand: quote.demand,
              updated: quote.updated,
              source: quote.source ?? "ardent",
            });
          }
          rows = rows.filter((r) => {
            const q = quotes.get(r);
            return q && meetsDemand(q, minVolume) && recentEnough(q.updated, settings.maxAgeDays);
          });
        }
        this.quotes = quotes;
        rows = rows.filter((r) => arrivalAllowed(numberOrUndefined(r.distance_to_arrival), this.opts.maxArrival));
        // A whole fit: only the stations selling every module of the list.
        if (wantedModules.length > 1)
          rows = rows.filter((r) => wantedModules.every((m) => stationSells(r.modules ?? [], m, g.moduleAliases)));
        // Ships and modules sold change too: the "data age" setting, as for markets.
        if (tab === "ship" || tab === "module") {
          const seenAt = (r: Json) =>
            (tab === "ship" ? r.shipyard_updated_at : r.outfitting_updated_at) ?? r.updated_at;
          rows = rows.filter((r) => recentEnough(seenAt(r), settings.maxAgeDays));
        }
        const shipPrice = (r: Json) =>
          (r.ships ?? []).find((x: Json) => String(x.name).toLowerCase() === name.toLowerCase())?.price;
        const sortable = (r: Json): SortableStation => {
          const q = quotes.get(r);
          return {
            price: q ? q.price : tab === "ship" ? numberOrUndefined(shipPrice(r)) : undefined,
            volume: q?.demand,
            distance: numberOrUndefined(r.distance),
            arrival: numberOrUndefined(r.distance_to_arrival),
            seen: quoteTime(q?.updated ?? r.market_updated_at ?? r.updated_at),
          };
        };
        // The "Sort by" choice now: changing it orders these results again, with no new request.
        const order = stationOrder(this.sortOf(tab), tab !== "sell");
        const keyed = rows.map((r) => ({ r, k: sortable(r) }));
        keyed.sort((a, b) => order(a.k, b.k));
        return keyed.map((x) => x.r);
      };
      this.wantedModules = wantedModules;
      const shown: StationResults = {
        tab,
        name,
        rows: results(),
        total: Number(answers[0]?.count ?? 0),
        loaded: answers.reduce((sum, a) => sum + (Array.isArray(a?.results) ? a.results.length : 0), 0),
        nearest: !spanshSort,
        reorder: () => (shown.rows = results()),
      };
      this.results = shown;
      this.showResults();
    } catch (e) {
      if (id !== this.runId) return;
      replace(this.out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  /**
   * Draws the last search's results: the whole table, which pages itself when taller than the
   * screen (ui/pagedTables.ts) and sorts all its lines by any column (ui/sortableTables.ts).
   */
  private showResults() {
    const res = this.results;
    if (!res) return;
    const { tab, name, rows } = res;
    if (!rows.length) {
      replace(
        this.out,
        h("p.empty", null, t("search.nothingFoundWithinLyIncreaseDistance", { maxDistance: this.range() })),
      );
      return;
    }
    // When Spansh has more than were loaded, the count says which ones these are.
    const count =
      res.total <= res.loaded
        ? t("search.matchingStations", { count: fmt(rows.length) })
        : res.nearest
          ? t("search.nearestStationsLoaded", { count: fmt(rows.length), total: fmt(res.total) })
          : t("search.firstStationsLoaded", {
              count: fmt(rows.length),
              total: fmt(res.total),
              sort: this.sortedBy(tab),
            });
    replace(
      this.out,
      h("p.sub", null, count),
      h(
        "table.table.search-table",
        // A new search or "Sort by" choice starts on page 1, without a column sort left over.
        { "data-sort-id": `search-results-${++this.drawnOrders}` },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, t("common.station")),
            h("th.num", null, t("common.distance")),
            ...(tab === "buy" || tab === "sell"
              ? [
                  h("th.num", null, tab === "buy" ? t("search.buyPriceColumn") : t("search.sellPriceColumn")),
                  h("th.num", null, tab === "buy" ? t("search.stockColumn") : t("search.demandColumn")),
                ]
              : [h("th", null, tab === "service" ? t("common.type") : t("search.details"))]),
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
  }

  private row(r: Json, tab: Tab, name: string): HTMLElement {
    let detail: (string | HTMLElement)[] = [];
    // Buying and selling: the price and the quantity in columns of their own.
    let market: HTMLElement[] = [];
    if (tab === "buy" || tab === "sell") {
      const q = this.quotes.get(r);
      market = [
        h(
          "td.num",
          { "data-sort": String(q?.price ?? "") },
          q ? h("strong", null, t("search.cr", { buyPrice: fmt(q.price) })) : "",
        ),
        h("td.num", { "data-sort": String(q?.demand ?? "") }, q ? `${fmt(q.demand)} t` : ""),
      ];
    } else if (tab === "ship") {
      const s = (r.ships ?? []).find((x: Json) => String(x.name).toLowerCase() === name.toLowerCase());
      detail = [s?.price ? h("strong", null, t("search.cr", { buyPrice: fmt(s.price) })) : t("search.sale")];
    } else if (tab === "module" && this.wantedModules.length > 1) {
      detail = [t("search.allModulesSold", { count: this.wantedModules.length })];
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
    } else {
      // A trader's or broker's kind follows the station's economy.
      const service = this.values.service;
      const kind = serviceKindOf(service, r.primary_economy);
      detail = [r.type ?? "", kind ? ` · ${KIND_LABELS[kind.kind]}` : ""];
    }
    const pad = r.has_large_pad ? "L" : r.medium_pads > 0 ? "M" : r.small_pads > 0 ? "S" : "?";
    const quote = tab === "buy" || tab === "sell" ? this.quotes.get(r) : undefined;
    const age =
      quote?.updated ??
      (tab === "ship" ? r.shipyard_updated_at : tab === "module" ? r.outfitting_updated_at : r.market_updated_at) ??
      r.updated_at;
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
        systemInfo(r.system_name),
        h(
          "button.link",
          { title: t("search.openInara"), onclick: () => openUrl(inaraSystem(r.system_name)) },
          "Inara",
          icon("link"),
        ),
      ),
      h("td.num", { "data-sort": String(numberOrUndefined(r.distance) ?? "") }, fmtLy(Number(r.distance))),
      ...(market.length ? market : [h("td", null, detail)]),
      h(
        "td",
        // Sorted on the distance to the arrival star.
        { "data-sort": String(numberOrUndefined(r.distance_to_arrival) ?? "") },
        `${pad} · ${r.distance_to_arrival !== undefined ? t("common.ls", { locale: fmt(Math.round(Number(r.distance_to_arrival))) }) : "?"}`,
      ),
      h(
        "td.sub",
        { "data-sort": age ?? "" },
        age
          ? tab !== "service"
            ? Number.isFinite(quoteTime(age))
              ? relTime(new Date(quoteTime(age)).toISOString())
              : ""
            : new Date(age.endsWith("Z") || age.includes("+") ? age : `${age}Z`).toLocaleDateString(locale())
          : "",
        quote ? debugSource(QUOTE_SOURCE_LABELS[quote.source]) : null,
      ),
    );
  }
}
