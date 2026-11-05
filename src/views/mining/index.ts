// Mining page: prospecting results with alerts for target minerals, where to mine and sell them
// (Spansh), and the Powerplay "Merit Miner" search.

import { findRingSpots, findSellSpots, type RingSpot, type SellSpot } from "../../features/mining/miningSpots.js";
import { gameName, t } from "../../platform/i18n.js";
import { type Ctx, referenceOf, type View } from "../../state/context.js";
import type { MiningSettings } from "../../state/store.js";
import { fmt, h, icon, replace } from "../../ui/dom.js";
import { duration, relTime } from "../../ui/format.js";
import { spotResults } from "./spotResults.js";
import { busy } from "../missions/index.js";
import { openSettingsTab } from "../settings/index.js";

type Tab = "prospect" | "merit";

type Json = Record<string, any>;

export const POWERS = [
  "A. Lavigny-Duval",
  "Aisling Duval",
  "Archon Delaine",
  "Denton Patreus",
  "Edmund Mahon",
  "Felicia Winters",
  "Jerome Archer",
  "Li Yong-Rui",
  "Nakato Kaine",
  "Pranav Antal",
  "Yuri Grom",
  "Zemina Torval",
];

/** Minerals: market spelling, and whether rings can hold a hotspot of it. */
const MINERALS: [string, boolean][] = [
  ["Platinum", true],
  ["Painite", true],
  ["Low Temperature Diamonds", true],
  ["Void Opal", true],
  ["Monazite", true],
  ["Musgravite", true],
  ["Rhodplumsite", true],
  ["Serendibite", true],
  ["Benitoite", true],
  ["Grandidierite", true],
  ["Alexandrite", true],
  ["Bromellite", true],
  ["Tritium", true],
  ["Osmium", false],
  ["Palladium", false],
  ["Gold", false],
  ["Silver", false],
  ["Bertrandite", true],
  ["Indite", true],
  ["Gallite", true],
  ["Coltan", true],
  ["Uraninite", true],
  ["Lepidolite", true],
  ["Samarium", true],
  ["Praseodymium", true],
  ["Bauxite", true],
  ["Rutile", true],
  ["Cobalt", true],
  ["Lithium Hydroxide", true],
  ["Methane Clathrate", true],
  ["Methanol Monohydrate Crystals", true],
  ["Liquid oxygen", true],
  ["Water", true],
  ["Hydrogen Peroxide", true],
];

/** Journal symbol of a mineral (ProspectedAsteroid uses these). */
const symbolOf = (name: string) =>
  name === "Low Temperature Diamonds"
    ? "lowtemperaturediamond"
    : name === "Void Opal"
      ? "opal"
      : name.toLowerCase().replace(/\s+/g, "");

export interface SpotResults {
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
      (
        [
          ["prospect", t("mining.prospecting")],
          ["merit", t("mining.meritMiner")],
        ] as [Tab, string][]
      ).map(([tab, l]) =>
        h("button", { class: this.tab === tab ? "active" : "", onclick: () => ((this.tab = tab), this.render()) }, l),
      ),
    );
    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h(
          "div",
          null,
          h("h1", null, t("common.mining")),
          h("p.sub", null, t("mining.liveProspectorResultsWhereMineSell")),
        ),
        tabs,
      ),
      ...(this.tab === "prospect" ? this.prospect() : this.merit()),
    );
  }

  // ---------- live prospecting ----------

  private prospect(): (HTMLElement | null)[] {
    const st = this.ctx.store.state;
    const m = st.activity.mining;
    const s = st.settings.mining;
    const targets = new Map(s.targets.map((target) => [target.id, target.min]));
    const last = m.last[0];
    const elapsed = m.started ? Date.now() - Date.parse(m.started) : 0;
    const refined = Object.entries(m.refined).sort((a, b) => b[1].count - a[1].count);
    const totalRefined = refined.reduce((sum, [, r]) => sum + r.count, 0);
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
      s.targets.map((target, i) =>
        h(
          "span.chip.edit",
          null,
          gameName(MINERALS.find(([n]) => symbolOf(n) === target.id)?.[0] ?? target.id),
          " ≥ ",
          h("input", {
            type: "number",
            min: "0",
            max: "100",
            step: "1",
            value: String(target.min),
            onchange: (e: Event) => {
              const targetsNext = [...s.targets];
              targetsNext[i] = { ...target, min: Number((e.target as HTMLInputElement).value) || 0 };
              this.set({ targets: targetsNext });
            },
          }),
          " %",
          h(
            "button.ghost.small",
            {
              title: t("common.remove"),
              onclick: () => (this.set({ targets: s.targets.filter((_, j) => j !== i) }), this.render()),
            },
            icon("close"),
          ),
        ),
      ),
      h(
        "select",
        {
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v && !s.targets.some((target) => target.id === symbolOf(v)))
              this.set({ targets: [...s.targets, { id: symbolOf(v), min: 10 }] });
            this.render();
          },
        },
        h("option", { value: "" }, t("mining.addTarget")),
        MINERALS.map(([n]) => h("option", { value: n }, gameName(n))),
      ),
    );

    return [
      h(
        "section.card",
        null,
        h("h3", null, t("mining.targets")),
        h("p.sub", null, t("mining.whenProspectorFindsOneTheseTargets")),
        targetEditor,
        h(
          "p.sub",
          null,
          s.alert ? t("mining.alert") + " " : t("mining.alertOff") + " ",
          h(
            "button.inline-link",
            { onclick: () => openSettingsTab(this.ctx.store, "notifications") },
            t("common.settingsNotifications"),
          ),
        ),
      ),
      this.finder(
        s.targets.map((target) => MINERALS.find(([n]) => symbolOf(n) === target.id)?.[0]).filter(Boolean) as string[],
      ),
      last
        ? h(
            "section.card.prospect",
            {
              class:
                last.motherlode || last.materials.some((x) => (targets.get(x.name) ?? Infinity) <= x.pct) ? "hit" : "",
            },
            h(
              "div.sync-head",
              null,
              h("h3", null, t("mining.lastAsteroid")),
              h(
                "div.badges",
                null,
                last.content ? h("span.badge", null, t("mining.content", { content: last.content })) : null,
                last.motherlode
                  ? h(
                      "span.badge.hit",
                      null,
                      t("common.motherlode", { MotherlodeMaterialLocalised: gameName(last.motherlode) }),
                    )
                  : null,
                last.remaining !== undefined && last.remaining < 100
                  ? h("span.badge.muted", null, t("mining.left", { remaining: fmt(last.remaining) }))
                  : null,
                h("span.sub", null, relTime(last.at)),
              ),
            ),
            materialBars(last, true),
            m.last.length > 1
              ? h(
                  "div.prospect-history",
                  null,
                  h("h4", null, t("mining.previous")),
                  m.last
                    .slice(1, 8)
                    .map((p) =>
                      h(
                        "div.prospect-row",
                        null,
                        h("span.sub", null, relTime(p.at)),
                        p.motherlode ? h("span.badge.hit", null, gameName(p.motherlode)) : null,
                        materialBars(p, false),
                      ),
                    ),
                )
              : null,
          )
        : h("section.card", null, h("p.empty", null, t("mining.fireProspectorLimpetAsteroidCompositionWill"))),
      h(
        "section.card",
        null,
        h("h3", null, t("mining.session")),
        h(
          "div.stats",
          null,
          h("div.stat", null, h("strong", null, fmt(totalRefined)), h("span.sub", null, t("mining.tRefined"))),
          perHour !== null
            ? h("div.stat", null, h("strong", null, fmt(Math.round(perHour))), h("span.sub", null, t("mining.tHour")))
            : null,
          h(
            "div.stat",
            null,
            h("strong", null, fmt(m.prospected)),
            h("span.sub", null, t("mining.asteroidsProspected")),
          ),
          h("div.stat", null, h("strong", null, fmt(m.prospectors)), h("span.sub", null, t("mining.prospectors"))),
          h("div.stat", null, h("strong", null, fmt(m.collectors)), h("span.sub", null, t("mining.collectors"))),
          m.cracked
            ? h("div.stat", null, h("strong", null, fmt(m.cracked)), h("span.sub", null, t("mining.coresCracked")))
            : null,
          m.started
            ? h("div.stat", null, h("strong", null, duration(elapsed)), h("span.sub", null, t("mining.mining")))
            : null,
        ),
        refined.length
          ? h(
              "div.chips",
              null,
              refined.map(([, r]) => h("span.chip", null, `${gameName(r.label)} · ${fmt(r.count)} t`)),
            )
          : null,
      ),
    ];
  }

  /** Where to mine and sell a mineral, nearest first (prospecting tab, any power). */
  private finder(targets: string[]): HTMLElement {
    if (!this.findMineral || !MINERALS.some(([n]) => n === this.findMineral))
      this.findMineral = targets[0] ?? "Platinum";
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
        h("h3", null, t("mining.whereMine")),
        h(
          "p.sub",
          null,
          t("mining.ringsHotspotChosenMineralNearestFirst", {
            maxDistance: fmt(this.ctx.store.state.settings.maxDistance),
          }),
        ),
        h(
          "div.row",
          null,
          h(
            "select",
            {
              onchange: (e: Event) => (
                (this.findMineral = (e.target as HTMLSelectElement).value),
                (this.found = null),
                this.render()
              ),
            },
            MINERALS.map(([n]) => h("option", { value: n, selected: n === this.findMineral }, gameName(n))),
          ),
          h(
            "button.primary",
            { disabled: this.finding, onclick: run },
            this.finding ? t("mining.searching") : t("common.search"),
          ),
          h("span.sub", null, t("mining.around", { place: referenceOf(this.ctx).label })),
        ),
        this.error && this.tab === "prospect" ? h("p.error", null, this.error) : null,
      ),
      this.found ? spotResults(this.found, { mine: t("mining.whereMine"), sell: t("mining.whereSell") }) : null,
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
        h("h3", null, t("mining.whereMineSellPowerSSystems")),
        h("p.sub", null, t("mining.findsStationsSystemsControlledChosenPower")),
        h(
          "div.merit-form",
          null,
          h(
            "label.field",
            null,
            h("span", null, t("mining.power")),
            h(
              "select",
              { onchange: (e: Event) => this.set({ power: (e.target as HTMLSelectElement).value }) },
              h("option", { value: "", selected: !s.power }, pledged ? t("mining.power2", { pledged }) : "—"),
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
            h(
              "button.primary",
              { disabled: this.running || !power || !s.minerals.length, onclick: () => this.search(power, s.minerals) },
              this.running ? t("mining.searching") : t("common.search"),
            ),
            h(
              "span.sub",
              null,
              t("common.aroundLyMax", { label: referenceOf(this.ctx).label, maxDistance: st.settings.maxDistance }),
            ),
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
      const [rings, buyers] = await Promise.all([
        ringable ? findRingSpots(this.ctx, mineral, extra) : Promise.resolve(null),
        findSellSpots(this.ctx, mineral, extra),
      ]);
      mine.push({ mineral, ringable: Boolean(ringable), ...(rings ?? { spots: [], radius: 0, widened: false }) });
      sell.push({ mineral, ...buyers });
    }
    return { mine, sell, start: this.ctx.store.state.settings.maxDistance };
  }

  private meritResults(): HTMLElement {
    const r = this.results!;
    return h(
      "div.spot-results",
      null,
      spotResults(r, {
        mine: t("mining.whereMineSystems", { power: r.power }),
        sell: t("mining.whereSell2", { power: r.power }),
      }),
    );
  }
}
