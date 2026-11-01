import { openSettingsTab } from "./settings.js";
import { openUrl } from "../bridge.js";
import { findRingSpots, findSellSpots, MAX_RADIUS, METHOD_LABEL, miningMethods, RESERVE, RING_TYPE, spanshBodyUrl, type RingSpot, type SellSpot } from "../miningSpots.js";
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

interface SpotResults {
  mine: { mineral: string; ringable: boolean; spots: RingSpot[]; radius: number; widened: boolean }[];
  sell: { mineral: string; spots: SellSpot[]; radius: number; widened: boolean }[];
  /** The search radius from Settings. */
  start: number;
}

const POWER_STATES = ["Exploited", "Fortified", "Stronghold"];

export class MiningView implements View {
  private root?: HTMLElement;
  private tab: Tab = "prospect";
  private results: (SpotResults & { power: string }) | null = null;
  /** Prospecting tab: where to mine and sell the chosen mineral (any power). */
  private found: SpotResults | null = null;
  private findMineral = "";
  private finding = false;
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
        h("p.sub", null, "Quand un prospecteur trouve une de ces cibles au-dessus du pourcentage choisi (ou un cœur pour le minage profond), EDCH te prévient avec le son et la couleur choisis dans Paramètres → Notifications."),
        targetEditor,
        h("p.sub", null, s.alert ? "Alerte activée · " : "Alerte désactivée · ", h("button.inline-link", { onclick: () => openSettingsTab(this.ctx.store, "notifications") }, "Paramètres → Notifications")),
      ),
      this.finder(s.targets.map((t) => MINERALS.find(([n]) => symbolOf(n) === t.id)?.[0]).filter(Boolean) as string[]),
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

  /** Where to mine and sell a mineral, nearest first (prospecting tab, any power). */
  private finder(targets: string[]): HTMLElement {
    if (!this.findMineral || !MINERALS.some(([n]) => n === this.findMineral)) this.findMineral = targets[0] ?? "Platinum";
    const run = async () => {
      this.finding = true;
      this.error = "";
      this.render();
      try {
        this.found = await this.lookup([this.findMineral]);
      } catch (e) {
        this.error = String((e as Error)?.message ?? e);
      }
      this.finding = false;
      this.render();
    };
    return h(
      "div.spot-results",
      null,
      h(
        "section.card",
        null,
        h("h3", null, "Où miner"),
        h("p.sub", null, `Les anneaux avec un point chaud du minerai choisi, les plus proches d'abord, puis où le vendre au meilleur prix. Rayon : ${fmt(this.ctx.store.state.settings.maxDistance)} al, élargi automatiquement si rien n'est trouvé. Données Spansh.`),
        h(
          "div.row",
          null,
          h(
            "select",
            { onchange: (e: Event) => ((this.findMineral = (e.target as HTMLSelectElement).value), (this.found = null), this.render()) },
            MINERALS.map(([n]) => h("option", { value: n, selected: n === this.findMineral }, gameName(n))),
          ),
          h("button.primary", { disabled: this.finding, onclick: run }, this.finding ? "Recherche…" : "Chercher"),
          h("span.sub", null, `Autour de ${referenceOf(this.ctx).label}`),
        ),
        this.error && this.tab === "prospect" ? h("p.error", null, this.error) : null,
      ),
      this.found ? this.spotResults(this.found, { mine: "Où miner", sell: "Où vendre" }) : null,
    );
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
    const extra = { system_controlling_power: { value: [power] }, system_power_state: { value: POWER_STATES } };
    try {
      this.results = { power, ...(await this.lookup(minerals, extra)) };
    } catch (e) {
      this.error = String((e as Error)?.message ?? e);
    }
    this.running = false;
    this.render();
  }

  /** Hotspots and buyers for each mineral (radius widened when nothing is close). */
  private async lookup(minerals: string[], extra: Json = {}): Promise<SpotResults> {
    const mine: SpotResults["mine"] = [];
    const sell: SpotResults["sell"] = [];
    for (const mineral of minerals) {
      const ringable = MINERALS.find(([n]) => n === mineral)?.[1];
      const [rings, buyers] = await Promise.all([ringable ? findRingSpots(this.ctx, mineral, extra) : Promise.resolve(null), findSellSpots(this.ctx, mineral, extra)]);
      mine.push({ mineral, ringable: Boolean(ringable), ...(rings ?? { spots: [], radius: 0, widened: false }) });
      sell.push({ mineral, ...buyers });
    }
    return { mine, sell, start: this.ctx.store.state.settings.maxDistance };
  }

  /** Where to mine (green) first, then where to sell (blue). */
  private spotResults(r: SpotResults, title: { mine: string; sell: string }): HTMLElement[] {
    const tooFar = (radius: number, widened: boolean, found: boolean, what: string) =>
      !found
        ? h(
            "p.notice.danger",
            null,
            icon("warn"),
            " ",
            h("span", null, what === "point chaud" ? `Aucun point chaud connu à moins de ${fmt(MAX_RADIUS)} al. Il faudra aller plus loin, en fleet carrier par exemple.` : `Aucun acheteur connu à moins de ${fmt(MAX_RADIUS)} al. Il faudra aller plus loin, en fleet carrier par exemple.`),
          )
        : widened
          ? h("p.notice", null, icon("warn"), " ", h("span", null, `Rien à moins de ${fmt(r.start)} al : rayon élargi à ${fmt(radius)} al. Prévois un long trajet, ou déplace ton fleet carrier.`))
          : null;
    const mineCard = h(
      "section.card.mine-zone",
      null,
      h("h3", null, title.mine),
      r.mine.map((m) =>
        h(
          "div.mine-block",
          null,
          h(
            "div.mine-head",
            null,
            h("h4", null, gameName(m.mineral)),
            h("div.chips", null, miningMethods(m.mineral).map((x) => h("span.chip.method", null, METHOD_LABEL[x]))),
          ),
          !m.ringable
            ? h("p.sub", null, "Pas de point chaud pour ce minerai : il se mine au laser dans les anneaux du bon type (métallique pour les métaux), sans point chaud.")
            : [
                tooFar(m.radius, m.widened, m.spots.length > 0, "point chaud"),
                m.spots.length
                  ? h(
                      "table.table.spot-table",
                      null,
                      h("thead", null, h("tr", null, h("th", null, "Planète · anneau"), h("th", null, "Type d'anneau"), h("th", null, "Réserve"), h("th.num", null, "Points chauds"), h("th", null, "Système"), h("th.num", null, "Distance"), h("th.num", null, "Arrivée"))),
                      h(
                        "tbody",
                        null,
                        m.spots.slice(0, 15).map((x) =>
                          h(
                            "tr",
                            null,
                            h(
                              "td",
                              null,
                              x.bodyId64 ? h("button.inline-link", { title: "Ouvrir la planète sur Spansh", "data-no-tr": "", onclick: () => openUrl(spanshBodyUrl(x.bodyId64!)) }, x.body) : h("span", { "data-no-tr": "" }, x.body),
                              h("div.sub", { "data-no-tr": "" }, x.ring),
                            ),
                            h("td", null, x.ringType ? RING_TYPE[x.ringType] ?? x.ringType : ""),
                            h("td", null, x.reserve ? RESERVE[x.reserve] ?? x.reserve : ""),
                            h("td.num", null, h("strong", null, String(x.count))),
                            h("td", null, sys(x.system), x.state ? h("div.sub", null, x.state) : null),
                            h("td.num", null, x.distance !== undefined ? `${fmt(Math.round(x.distance))} al` : ""),
                            h("td.num", null, x.arrival !== undefined ? `${fmt(Math.round(x.arrival))} ls` : ""),
                          ),
                        ),
                      ),
                    )
                  : null,
              ],
        ),
      ),
    );
    const sellCard = h(
      "section.card.sell-zone",
      null,
      h("h3", null, title.sell),
      r.sell.map((m) => {
        const hot = new Set(r.mine.find((x) => x.mineral === m.mineral)?.spots.map((x) => x.system) ?? []);
        return h(
          "div.mine-block",
          null,
          h("h4", null, gameName(m.mineral)),
          tooFar(m.radius, m.widened, m.spots.length > 0, "acheteur"),
          m.spots.length
            ? h(
                "table.table.spot-table",
                null,
                h("thead", null, h("tr", null, h("th.num", null, "Prix"), h("th.num", null, "Demande"), h("th", null, "Station"), h("th", null, "Système"), h("th.num", null, "Distance"), h("th", null, "État"))),
                h(
                  "tbody",
                  null,
                  m.spots.slice(0, 15).map((x) =>
                    h(
                      "tr",
                      { class: hot.has(x.system) ? "hot" : "" },
                      h("td.num", null, h("strong", null, `${fmt(x.price)} Cr`)),
                      h("td.num", null, fmt(x.demand)),
                      h("td", null, x.station, x.largePad ? h("span.badge.muted", null, "L") : null, x.updated ? h("div.sub", null, relTime(x.updated)) : null),
                      h("td", null, sys(x.system), hot.has(x.system) ? h("span.badge.ok", null, "point chaud ici") : null),
                      h("td.num", null, x.distance !== undefined ? `${fmt(Math.round(x.distance))} al` : ""),
                      h("td", null, x.state ?? ""),
                    ),
                  ),
                ),
              )
            : null,
        );
      }),
    );
    return [mineCard, sellCard];
  }

  private meritResults(): HTMLElement {
    const r = this.results!;
    return h("div.spot-results", null, this.spotResults(r, { mine: `Où miner (systèmes de ${r.power})`, sell: `Où vendre (${r.power})` }));
  }
}
