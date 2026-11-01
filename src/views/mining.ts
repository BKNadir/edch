import { spanshPost } from "../bridge.js";
import { fmt, h, icon, replace } from "../dom.js";
import { gameName } from "../i18n.js";
import { referenceOf, type Ctx, type View } from "../context.js";
import type { MiningSettings } from "../store.js";
import { duration, relTime } from "../time.js";
import { busy, sys } from "./missions.js";

type Tab = "prospect" | "merit";
type Json = Record<string, any>;

export const POWERS = [
  "A. Lavigny-Duval", "Aisling Duval", "Archon Delaine", "Denton Patreus", "Edmund Mahon", "Felicia Winters",
  "Jerome Archer", "Li Yong-Rui", "Nakato Kaine", "Pranav Antal", "Yuri Grom", "Zemina Torval",
];

/** Minerals: market spelling, and whether rings can hold a hotspot of it. */
const MINERALS: [string, boolean][] = [
  ["Platinum", true], ["Painite", true], ["Low Temperature Diamonds", true], ["Void Opal", true], ["Monazite", true],
  ["Musgravite", true], ["Rhodplumsite", true], ["Serendibite", true], ["Benitoite", true], ["Grandidierite", true],
  ["Alexandrite", true], ["Bromellite", true], ["Tritium", true], ["Osmium", false], ["Palladium", false], ["Gold", false],
  ["Silver", false], ["Bertrandite", true], ["Indite", true], ["Gallite", true], ["Coltan", true], ["Uraninite", true],
  ["Lepidolite", true], ["Samarium", true], ["Praseodymium", true], ["Bauxite", true], ["Rutile", true], ["Cobalt", true],
  ["Lithium Hydroxide", true], ["Methane Clathrate", true], ["Methanol Monohydrate Crystals", true], ["Liquid oxygen", true],
  ["Water", true], ["Hydrogen Peroxide", true],
];

/** Journal symbol of a mineral (ProspectedAsteroid uses these). */
const symbolOf = (name: string) => (name === "Low Temperature Diamonds" ? "lowtemperaturediamond" : name === "Void Opal" ? "opal" : name.toLowerCase().replace(/\s+/g, ""));

interface MeritRow {
  mineral: string;
  station: string;
  system: string;
  price: number;
  demand: number;
  distance?: number;
  arrival?: number;
  largePad?: boolean;
  state?: string;
  updated?: string;
  hotspots: number;
}

interface HotspotRow {
  mineral: string;
  system: string;
  ring: string;
  count: number;
  distance?: number;
  state?: string;
}

const POWER_STATES = ["Exploited", "Fortified", "Stronghold"];

export class MiningView implements View {
  private root?: HTMLElement;
  private tab: Tab = "prospect";
  private results: { rows: MeritRow[]; hotspots: HotspotRow[]; power: string } | null = null;
  private running = false;
  private error = "";
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    if (this.tab === "prospect" && !busy(this.root)) this.render();
  }

  private set(patch: Partial<MiningSettings>) {
    const store = this.ctx.store;
    store.updateSettings({ mining: { ...store.state.settings.mining, ...patch } });
  }

  private render() {
    if (!this.root) return;
    const tabs = h(
      "div.segmented",
      null,
      ([
        ["prospect", "Prospection"],
        ["merit", "Merit Miner"],
      ] as [Tab, string][]).map(([t, l]) => h("button", { class: this.tab === t ? "active" : "", onclick: () => ((this.tab = t), this.render()) }, l)),
    );
    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, "Minage"), h("p.sub", null, "Résultats des prospecteurs en direct, et où miner et vendre pour gagner des mérites Powerplay.")), tabs),
      ...(this.tab === "prospect" ? this.prospect() : this.merit()),
    );
  }

  // ---------- live prospecting ----------

  private prospect(): (HTMLElement | null)[] {
    const st = this.ctx.store.state;
    const m = st.activity.mining;
    const s = st.settings.mining;
    const targets = new Map(s.targets.map((t) => [t.id, t.min]));
    const last = m.last[0];
    const elapsed = m.started ? Date.now() - Date.parse(m.started) : 0;
    const refined = Object.entries(m.refined).sort((a, b) => b[1].count - a[1].count);
    const totalRefined = refined.reduce((t, [, r]) => t + r.count, 0);
    const perHour = elapsed > 5 * 60000 ? (totalRefined / elapsed) * 3600000 : null;

    const materialBars = (p: (typeof m.last)[number], big: boolean) =>
      h(
        "div.prospect-mats",
        null,
        p.materials.map((x) => {
          const min = targets.get(x.name);
          const hit = min !== undefined && x.pct >= min;
          return h(
            "div.prospect-mat",
            { class: `${hit ? "hit" : ""} ${min !== undefined ? "target" : ""}` },
            h("span", null, gameName(x.label)),
            big ? h("div.bar", null, h("span", { style: { width: `${Math.min(100, x.pct * 2)}%` } })) : null,
            h("strong", null, `${x.pct.toFixed(1)} %`),
          );
        }),
      );

    const targetEditor = h(
      "div.chips",
      null,
      s.targets.map((t, i) =>
        h(
          "span.chip.edit",
          null,
          gameName(MINERALS.find(([n]) => symbolOf(n) === t.id)?.[0] ?? t.id),
          " ≥ ",
          h("input", {
            type: "number",
            min: "0",
            max: "100",
            step: "1",
            value: String(t.min),
            onchange: (e: Event) => {
              const targetsNext = [...s.targets];
              targetsNext[i] = { ...t, min: Number((e.target as HTMLInputElement).value) || 0 };
              this.set({ targets: targetsNext });
            },
          }),
          " %",
          h("button.ghost.small", { title: "Retirer", onclick: () => (this.set({ targets: s.targets.filter((_, j) => j !== i) }), this.render()) }, icon("close")),
        ),
      ),
      h(
        "select",
        {
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v && !s.targets.some((t) => t.id === symbolOf(v))) this.set({ targets: [...s.targets, { id: symbolOf(v), min: 10 }] });
            this.render();
          },
        },
        h("option", { value: "" }, "+ Ajouter une cible"),
        MINERALS.map(([n]) => h("option", { value: n }, gameName(n))),
      ),
    );

    return [
      h(
        "section.card",
        null,
        h("h3", null, "Cibles"),
        h("p.sub", null, "Quand un prospecteur trouve une de ces cibles au-dessus du pourcentage choisi (ou un cœur pour le minage profond), EDCH te prévient avec le son et la couleur choisis dans Missions → Notifications."),
        targetEditor,
        h("label.check", null, h("input", { type: "checkbox", checked: s.alert, onchange: (e: Event) => this.set({ alert: (e.target as HTMLInputElement).checked }) }), " Alerte sonore et visuelle"),
      ),
      last
        ? h(
            "section.card.prospect",
            { class: last.motherlode || last.materials.some((x) => (targets.get(x.name) ?? Infinity) <= x.pct) ? "hit" : "" },
            h(
              "div.sync-head",
              null,
              h("h3", null, "Dernier astéroïde"),
              h("div.badges", null, last.content ? h("span.badge", null, `Contenu : ${last.content}`) : null, last.motherlode ? h("span.badge.hit", null, `Cœur : ${gameName(last.motherlode)}`) : null, last.remaining !== undefined && last.remaining < 100 ? h("span.badge.muted", null, `Restant ${fmt(last.remaining)} %`) : null, h("span.sub", null, relTime(last.at))),
            ),
            materialBars(last, true),
            m.last.length > 1
              ? h(
                  "div.prospect-history",
                  null,
                  h("h4", null, "Précédents"),
                  m.last.slice(1, 8).map((p) => h("div.prospect-row", null, h("span.sub", null, relTime(p.at)), p.motherlode ? h("span.badge.hit", null, gameName(p.motherlode)) : null, materialBars(p, false))),
                )
              : null,
          )
        : h("section.card", null, h("p.empty", null, "Lance un drone prospecteur sur un astéroïde : sa composition s'affichera ici.")),
      h(
        "section.card",
        null,
        h("h3", null, "Cette session"),
        h(
          "div.stats",
          null,
          h("div.stat", null, h("strong", null, fmt(totalRefined)), h("span.sub", null, "t raffinées")),
          perHour !== null ? h("div.stat", null, h("strong", null, fmt(Math.round(perHour))), h("span.sub", null, "t / heure")) : null,
          h("div.stat", null, h("strong", null, fmt(m.prospected)), h("span.sub", null, "astéroïdes prospectés")),
          h("div.stat", null, h("strong", null, fmt(m.prospectors)), h("span.sub", null, "prospecteurs")),
          h("div.stat", null, h("strong", null, fmt(m.collectors)), h("span.sub", null, "collecteurs")),
          m.cracked ? h("div.stat", null, h("strong", null, fmt(m.cracked)), h("span.sub", null, "cœurs fracturés")) : null,
          m.started ? h("div.stat", null, h("strong", null, duration(elapsed)), h("span.sub", null, "de minage")) : null,
        ),
        refined.length ? h("div.chips", null, refined.map(([, r]) => h("span.chip", null, `${gameName(r.label)} · ${fmt(r.count)} t`))) : null,
      ),
    ];
  }

  // ---------- Merit Miner ----------

  private merit(): (HTMLElement | null)[] {
    const st = this.ctx.store.state;
    const s = st.settings.mining;
    const pledged = st.activity.powerplay.power;
    const power = s.power || pledged || "";
    return [
      h(
        "section.card",
        null,
        h("h3", null, "Où miner et vendre dans les systèmes de ta puissance"),
        h(
          "p.sub",
          null,
          "Cherche les stations des systèmes contrôlés par la puissance choisie (exploités, fortifiés ou bastions) qui achètent le minerai, triées par prix, et les anneaux avec un point chaud de ce minerai dans ces systèmes. Vendre dans un système de ta puissance des minerais minés dans ce même système rapporte des mérites. Données Spansh.",
        ),
        h(
          "div.merit-form",
          null,
          h(
            "label.field",
            null,
            h("span", null, "Puissance"),
            h(
              "select",
              { onchange: (e: Event) => this.set({ power: (e.target as HTMLSelectElement).value }) },
              h("option", { value: "", selected: !s.power }, pledged ? `${pledged} (ta puissance)` : "—"),
              POWERS.map((p) => h("option", { value: p, selected: s.power === p }, p)),
            ),
          ),
          h(
            "div.chips",
            null,
            MINERALS.map(([n]) =>
              h(
                "button.chip.toggle",
                {
                  class: s.minerals.includes(n) ? "on" : "",
                  onclick: () => {
                    const next = s.minerals.includes(n) ? s.minerals.filter((x) => x !== n) : [...s.minerals, n];
                    this.set({ minerals: next });
                    this.render();
                  },
                },
                gameName(n),
              ),
            ),
          ),
          h(
            "div.row",
            null,
            h("button.primary", { disabled: this.running || !power || !s.minerals.length, onclick: () => this.search(power, s.minerals) }, this.running ? "Recherche…" : "Chercher"),
            h("span.sub", null, `Autour de ${referenceOf(this.ctx).label}, ${st.settings.maxDistance} al max`),
          ),
        ),
        this.error ? h("p.error", null, this.error) : null,
      ),
      this.results ? this.meritResults() : null,
    ];
  }

  private async search(power: string, minerals: string[]) {
    this.running = true;
    this.error = "";
    this.render();
    const ref = referenceOf(this.ctx);
    const where = ref.coords ? { reference_coords: { x: ref.coords[0], y: ref.coords[1], z: ref.coords[2] } } : { reference_system: ref.system };
    const dist = { min: "0", max: String(this.ctx.store.state.settings.maxDistance) };
    const base = { distance: dist, system_controlling_power: { value: [power] }, system_power_state: { value: POWER_STATES } };
    const rows: MeritRow[] = [];
    const hotspots: HotspotRow[] = [];
    try {
      for (const mineral of minerals) {
        const stations = await spanshPost("stations/search", {
          filters: { ...base, market: [{ name: mineral, demand: { value: ["1", "1000000000"], comparison: "<=>" } }] },
          sort: [{ distance: { direction: "asc" } }],
          size: 100,
          page: 0,
          ...where,
        });
        const ring = MINERALS.find(([n]) => n === mineral)?.[1]
          ? await spanshPost("bodies/search", {
              filters: { ...base, ring_signals: { name: { value: [mineral] } } },
              sort: [{ distance: { direction: "asc" } }],
              size: 100,
              page: 0,
              ...where,
            })
          : { results: [] };
        const perSystem = new Map<string, number>();
        for (const b of (ring?.results ?? []) as Json[]) {
          for (const r of (b.rings ?? []) as Json[]) {
            const sig = ((r.signals ?? []) as Json[]).find((x) => String(x.name).toLowerCase() === mineral.toLowerCase());
            if (!sig) continue;
            const count = Number(sig.count ?? 1);
            hotspots.push({ mineral, system: b.system_name, ring: r.name, count, distance: b.distance, state: b.system_power_state });
            perSystem.set(b.system_name, (perSystem.get(b.system_name) ?? 0) + count);
          }
        }
        for (const s of (stations?.results ?? []) as Json[]) {
          const quote = ((s.market ?? []) as Json[]).find((x) => String(x.commodity).toLowerCase() === mineral.toLowerCase());
          if (!quote || !quote.sell_price) continue;
          rows.push({
            mineral,
            station: s.name,
            system: s.system_name,
            price: Number(quote.sell_price),
            demand: Number(quote.demand ?? 0),
            distance: s.distance,
            arrival: s.distance_to_arrival,
            largePad: s.has_large_pad,
            state: s.system_power_state,
            updated: s.market_updated_at ?? s.updated_at,
            hotspots: perSystem.get(s.system_name) ?? 0,
          });
        }
      }
      rows.sort((a, b) => b.price - a.price);
      hotspots.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
      this.results = { rows, hotspots, power };
    } catch (e) {
      this.error = String((e as Error)?.message ?? e);
    }
    this.running = false;
    this.render();
  }

  private meritResults(): HTMLElement {
    const r = this.results!;
    return h(
      "div",
      null,
      h(
        "section.card",
        null,
        h("h3", null, `Où vendre (${r.power})`),
        r.rows.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, "Minerai"), h("th.num", null, "Prix"), h("th.num", null, "Demande"), h("th", null, "Station"), h("th", null, "Système"), h("th.num", null, "Distance"), h("th", null, "État"), h("th", null, "Point chaud ici"))),
              h(
                "tbody",
                null,
                r.rows.slice(0, 60).map((x) =>
                  h(
                    "tr",
                    { class: x.hotspots ? "hot" : "" },
                    h("td", null, gameName(x.mineral)),
                    h("td.num", null, h("strong", null, `${fmt(x.price)} Cr`)),
                    h("td.num", null, fmt(x.demand)),
                    h("td", null, x.station, x.largePad ? h("span.badge.muted", null, "L") : null, x.updated ? h("div.sub", null, relTime(x.updated)) : null),
                    h("td", null, sys(x.system)),
                    h("td.num", null, x.distance !== undefined ? `${fmt(Math.round(x.distance))} al` : ""),
                    h("td", null, x.state ?? ""),
                    h("td", null, x.hotspots ? h("span.badge.ok", null, `✓ ${x.hotspots}`) : ""),
                  ),
                ),
              ),
            )
          : h("p.empty", null, "Aucune station de cette puissance n'achète ces minerais dans le rayon choisi. Augmente la distance dans les Paramètres."),
      ),
      r.hotspots.length
        ? h(
            "section.card",
            null,
            h("h3", null, "Points chauds dans ces systèmes"),
            h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, "Minerai"), h("th", null, "Anneau"), h("th", null, "Système"), h("th.num", null, "Points chauds"), h("th.num", null, "Distance"), h("th", null, "État"))),
              h(
                "tbody",
                null,
                r.hotspots.slice(0, 60).map((x) =>
                  h("tr", null, h("td", null, gameName(x.mineral)), h("td", null, x.ring), h("td", null, sys(x.system)), h("td.num", null, String(x.count)), h("td.num", null, x.distance !== undefined ? `${fmt(Math.round(x.distance))} al` : ""), h("td", null, x.state ?? "")),
                ),
              ),
            ),
          )
        : null,
    );
  }
}
