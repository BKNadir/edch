import { spanshPost } from "../bridge.js";
import { h, icon, fmt, replace } from "../dom.js";
import { referenceOf, type Ctx, type View } from "../context.js";
import { fmtLy, inaraSystem } from "../spansh.js";
import { copySystem } from "./results.js";
import { openUrl } from "../bridge.js";

type Json = Record<string, any>;
type Tab = "buy" | "sell" | "ship" | "module" | "service";

const STATION_TYPES = [
  "Asteroid base", "Coriolis Starport", "Dodec Starport", "Mega ship", "Ocellus Starport", "Orbis Starport", "Outpost",
  "Planetary Construction Depot", "Planetary Outpost", "Planetary Port", "Settlement", "Space Construction Depot", "Surface Settlement",
];
const CARRIER = "Drake-Class Carrier";
const SERVICES: [string, string][] = [
  ["Interstellar Factors Contact", "Interstellar Factors"],
  ["Material Trader", "Trader de matériaux"],
  ["Technology Broker", "Courtier technologique"],
  ["Universal Cartographics", "Universal Cartographics"],
  ["Vista Genomics", "Vista Genomics"],
  ["Black Market", "Marché noir"],
  ["Shipyard", "Chantier naval"],
  ["Outfitting", "Équipement"],
  ["Refuel", "Ravitaillement"],
  ["Repair", "Réparation"],
  ["Restock", "Munitions"],
  ["Search and Rescue", "Recherche et sauvetage"],
  ["Pioneer Supplies", "Pioneer Supplies"],
  ["Bartender", "Barman"],
  ["Apex Interstellar", "Apex Interstellar"],
  ["Frontline Solutions", "Frontline Solutions"],
];
const CLASSES = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8"];
const RATINGS = ["", "A", "B", "C", "D", "E", "F", "G", "H", "I"];

export class SearchView implements View {
  private root?: HTMLElement;
  private tab: Tab = "buy";
  private out = h("div.search-out");
  private form = h("div.search-form");
  private tabs = h("div.segmented");
  private opts = { largePad: false, carriers: false, planetary: true, sortPrice: true, minQty: 1 };
  private values: Record<Tab, string> = { buy: "", sell: "", ship: "", module: "", service: SERVICES[0][0] };
  private cls = "";
  private rating = "";

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const g = this.ctx.game.data;
    // Shared datalists for names.
    const lists = h(
      "div",
      { style: { display: "none" } },
      h("datalist#dl-commodities", null, g.commodities.map((c) => h("option", { value: c.name }, c.category))),
      h("datalist#dl-ships", null, g.ships.map((s) => h("option", { value: s }))),
      h("datalist#dl-modules", null, g.modules.map((s) => h("option", { value: s }))),
    );
    replace(root, h("header.view-head", null, h("h1", null, "Recherche"), this.tabs), lists, h("section.card", null, this.form), this.out);
    this.renderTabs();
    this.renderForm();
  }

  update() {
    // Results are explicit (button); only the "around X" line follows the commander.
    if (!this.root) return;
    const where = this.form.querySelector(".opts .sub");
    if (where) where.textContent = `Autour de ${referenceOf(this.ctx).label}, ${this.ctx.store.state.settings.maxDistance} al max`;
  }

  private renderTabs() {
    const labels: [Tab, string][] = [
      ["buy", "Acheter une marchandise"],
      ["sell", "Vendre une marchandise"],
      ["ship", "Vaisseaux"],
      ["module", "Modules"],
      ["service", "Services"],
    ];
    replace(
      this.tabs,
      labels.map(([t, l]) => h("button", { class: this.tab === t ? "active" : "", onclick: () => ((this.tab = t), this.renderTabs(), this.renderForm(), replace(this.out)) }, l)),
    );
  }

  private renderForm() {
    const t = this.tab;
    const input = (list: string, placeholder: string) =>
      h("input.big", {
        type: "text",
        value: this.values[t],
        list,
        placeholder,
        spellcheck: false,
        oninput: (e: Event) => (this.values[t] = (e.target as HTMLInputElement).value),
        onkeydown: (e: KeyboardEvent) => e.key === "Enter" && this.run(),
      });
    const check = (key: "largePad" | "carriers" | "planetary" | "sortPrice", label: string) =>
      h("label.check", null, h("input", { type: "checkbox", checked: this.opts[key], onchange: (e: Event) => (this.opts[key] = (e.target as HTMLInputElement).checked) }), ` ${label}`);

    let main: HTMLElement;
    if (t === "buy" || t === "sell") main = input("dl-commodities", "Marchandise (ex. Tritium, Gold, Low Temperature Diamonds)");
    else if (t === "ship") main = input("dl-ships", "Vaisseau (ex. Krait MkII, Anaconda)");
    else if (t === "module")
      main = h(
        "div.row",
        null,
        input("dl-modules", "Module (ex. Frame Shift Drive, Shield Booster)"),
        h("select", { title: "Classe", onchange: (e: Event) => (this.cls = (e.target as HTMLSelectElement).value) }, CLASSES.map((c) => h("option", { value: c, selected: c === this.cls }, c ? `Classe ${c}` : "Toute classe"))),
        h("select", { title: "Classe", onchange: (e: Event) => (this.rating = (e.target as HTMLSelectElement).value) }, RATINGS.map((r) => h("option", { value: r, selected: r === this.rating }, r ? `Note ${r}` : "Toute note"))),
      );
    else
      main = h(
        "select.big",
        { onchange: (e: Event) => (this.values.service = (e.target as HTMLSelectElement).value) },
        SERVICES.map(([v, l]) => h("option", { value: v, selected: v === this.values.service }, l)),
      );

    replace(
      this.form,
      h("div.row", null, main, h("button.primary", { onclick: () => this.run() }, icon("search"), " Chercher")),
      h(
        "div.row.opts",
        null,
        check("largePad", "Pad L seulement"),
        check("carriers", "Inclure les Fleet Carriers"),
        check("planetary", "Inclure les ports planétaires"),
        t === "buy" || t === "sell" ? check("sortPrice", t === "buy" ? "Trier par prix le plus bas" : "Trier par meilleur prix") : null,
        h("span.sub", null, `Autour de ${referenceOf(this.ctx).label}, ${this.ctx.store.state.settings.maxDistance} al max`),
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
    const t = this.tab;
    const value = this.values[t].trim();
    if (!value) return;
    const g = this.ctx.game.data;
    const f = this.filters();
    let name = value;
    if (t === "buy" || t === "sell") {
      const c = g.commodities.find((x) => x.name.toLowerCase() === value.toLowerCase());
      name = c?.name ?? value;
      f.market = [{ name, [t === "buy" ? "supply" : "demand"]: { value: [String(this.opts.minQty), "1000000000"], comparison: "<=>" } }];
    } else if (t === "ship") {
      name = g.ships.find((x) => x.toLowerCase() === value.toLowerCase()) ?? value;
      f.ships = { value: [name] };
    } else if (t === "module") {
      name = g.modules.find((x) => x.toLowerCase() === value.toLowerCase()) ?? value;
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
      size: t === "buy" || t === "sell" ? 50 : 20,
      page: 0,
      ...(ref.coords ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } } : { reference_system: ref.system }),
    };
    replace(this.out, h("p.sub", null, h("span.spinner"), " Recherche Spansh…"));
    try {
      const res = await spanshPost("stations/search", body);
      let rows: Json[] = Array.isArray(res?.results) ? res.results : [];
      if ((t === "buy" || t === "sell") && this.opts.sortPrice) {
        const price = (r: Json) => {
          const m = (r.market ?? []).find((x: Json) => String(x.commodity).toLowerCase() === name.toLowerCase());
          return m ? Number(t === "buy" ? m.buy_price : m.sell_price) : NaN;
        };
        rows = rows.filter((r) => !Number.isNaN(price(r))).sort((a, b) => (t === "buy" ? price(a) - price(b) : price(b) - price(a)));
      }
      if (!rows.length) {
        replace(this.out, h("p.empty", null, `Rien trouvé à moins de ${this.ctx.store.state.settings.maxDistance} al. Augmente la distance dans les Paramètres ou vérifie le nom.`));
        return;
      }
      replace(
        this.out,
        h("p.sub", null, `${fmt(Number(res.count ?? rows.length))} stations correspondent · ${rows.length} affichées`),
        h(
          "table.table.search-table",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, "Station"),
              h("th.num", null, "Distance"),
              h("th", null, t === "buy" ? "Prix d'achat · stock" : t === "sell" ? "Prix de vente · demande" : t === "service" ? "Type" : "Détail"),
              h("th", null, "Pad / arrivée"),
              h("th", null, "Màj"),
            ),
          ),
          h("tbody", null, rows.map((r) => this.row(r, t, name))),
        ),
      );
    } catch (e) {
      replace(this.out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private row(r: Json, t: Tab, name: string): HTMLElement {
    let detail: (string | HTMLElement)[] = [];
    if (t === "buy" || t === "sell") {
      const m = (r.market ?? []).find((x: Json) => String(x.commodity).toLowerCase() === name.toLowerCase());
      if (m) detail = t === "buy" ? [h("strong", null, `${fmt(m.buy_price)} cr`), ` · ${fmt(m.supply)} en stock`] : [h("strong", null, `${fmt(m.sell_price)} cr`), ` · demande ${fmt(m.demand)}`];
    } else if (t === "ship") {
      const s = (r.ships ?? []).find((x: Json) => String(x.name).toLowerCase() === name.toLowerCase());
      detail = [s?.price ? h("strong", null, `${fmt(s.price)} cr`) : "En vente"];
    } else if (t === "module") {
      const mods = (r.modules ?? []).filter((x: Json) => String(x.name).toLowerCase() === name.toLowerCase() || (this.ctx.game.data.moduleAliases[name] ?? []).some((a) => a.toLowerCase() === String(x.name).toLowerCase()));
      detail = [mods.slice(0, 6).map((x: Json) => `${x.class ?? ""}${x.rating ?? ""}`).join(" · ") || "Disponible"];
    } else detail = [r.type ?? ""];
    const pad = r.has_large_pad ? "L" : r.medium_pads > 0 ? "M" : r.small_pads > 0 ? "S" : "?";
    const age = r.market_updated_at ?? r.outfitting_updated_at ?? r.shipyard_updated_at ?? r.updated_at;
    return h(
      "tr",
      null,
      h(
        "td",
        null,
        h("button.sys", { title: `Copier « ${r.system_name} »`, onclick: () => copySystem(r.system_name) }, icon("copy"), h("span", null, `${r.name} | ${r.system_name}`)),
        h("button.link", { title: "Ouvrir sur Inara", onclick: () => openUrl(inaraSystem(r.system_name)) }, "Inara", icon("link")),
      ),
      h("td.num", null, fmtLy(Number(r.distance))),
      h("td", null, detail),
      h("td", null, `${pad} · ${r.distance_to_arrival !== undefined ? `${fmt(Math.round(Number(r.distance_to_arrival)))} ls` : "?"}`),
      h("td.sub", null, age ? new Date(age.endsWith("Z") || age.includes("+") ? age : `${age}Z`).toLocaleDateString("fr-BE") : ""),
    );
  }
}
