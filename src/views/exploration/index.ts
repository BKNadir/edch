import { type OrganicFind, type Sampling, surfaceDistance, unsoldSummary } from "../../game/activity.js";
import { fmt, h, replace } from "../../ui/dom.js";
import { colonyDistance, possibleSpecies, speciesValue } from "../../game/exobio.js";
import { credits, relTime } from "../../ui/format.js";
import type { Ctx, View } from "../../state/context.js";
import { busy, sys } from "../missions/index.js";
import { openUrl } from "../../platform/bridge.js";
import { icon } from "../../ui/dom.js";
import { edsmCached, edsmSystem, edsmSystemUrl, type EdsmSystem } from "../../services/edsm.js";
import { t } from "../../platform/i18n.js";

type Tab = "bio" | "carto";


export class ExplorationView implements View {
  private root?: HTMLElement;
  private tab: Tab = "bio";
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    if (!busy(this.root)) this.render();
  }

  private render() {
    if (!this.root) return;
    const tabs = h(
      "div.segmented",
      null,
      ([
        ["bio", t("common.exobiology")],
        ["carto", t("exploration.cartography")],
      ] as [Tab, string][]).map(([tab, l]) => h("button", { class: this.tab === tab ? "active" : "", onclick: () => ((this.tab = tab), this.render()) }, l)),
    );
    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, t("common.exploration")), h("p.sub", null, t("exploration.whatUnsoldDataWorthHelpBiological"))), tabs),
      ...(this.tab === "bio" ? this.bio() : this.carto()),
    );
  }

  // ---------- exobiology ----------

  private bio(): (HTMLElement | null)[] {
    const st = this.ctx.store.state;
    const a = st.activity;
    const found = a.organics;
    const total = found.reduce((s, o) => s + this.value(o), 0);
    return [
      a.sampling ? this.sampling(a.sampling) : null,
      this.currentBodies(),
      h(
        "section.card",
        null,
        h("div.sync-head", null, h("h3", null, t("exploration.analysesSellVistaGenomics")), h("strong", null, `${credits(total)} Cr`)),
        found.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, t("exploration.species")), h("th", null, t("common.location")), h("th.num", null, t("exploration.value")), h("th", null, ""))),
              h(
                "tbody",
                null,
                found.map((o) => {
                  const b = Object.values(a.bodies).find((x) => x.address === o.address && x.bodyId === o.bodyId);
                  return h(
                    "tr",
                    null,
                    h("td", null, h("strong", null, o.species), o.variant ? h("div.sub", null, o.variant) : null),
                    h("td", null, o.body ?? o.system ?? ""),
                    h("td.num", null, `${credits(this.value(o))} Cr`),
                    h("td", null, b?.wasFootfalled === false ? h("span.badge.hit", { title: t("exploration.firstFootfallPlanetFirstDiscoveryBonus") }, t("exploration.n5Possible")) : null),
                  );
                }),
              ),
            )
          : h("p.empty", null, t("exploration.noAnalysesWaitingAnalysedSpecies3")),
        found.length ? h("p.sub.warn", null, t("exploration.carefulBeingDestroyedLosesEveryUnsold")) : null,
      ),
    ];
  }

  private value(o: OrganicFind): number {
    return speciesValue(o.symbol, "", o.species) ?? 0;
  }

  private sampling(s: Sampling): HTMLElement {
    const ccr = colonyDistance(s.genusSymbol);
    const value = speciesValue(s.symbol, s.genusSymbol, s.species);
    const surface = this.ctx.store.state.cmdr.surface;
    const here = surface ? { lat: surface.lat, lon: surface.lon } : null;
    const radius = surface?.radius;
    const distances = s.samples.map((p) => (here && radius && p.lat !== undefined && p.lon !== undefined ? surfaceDistance(here, { lat: p.lat, lon: p.lon }, radius) : null));
    const known = distances.filter((d): d is number => d !== null);
    const nearest = known.length ? Math.min(...known) : null;
    const farEnough = ccr !== undefined && nearest !== null ? nearest >= ccr : null;
    return h(
      "section.card.sampling",
      { class: farEnough === true ? "far" : farEnough === false ? "near" : "" },
      h("div.sync-head", null, h("div", null, h("h3", null, s.species), h("p.sub", null, s.variant ?? s.genus)), value ? h("strong", null, `${credits(value)} Cr`) : null),
      h("div.samples", null, [0, 1, 2].map((i) => h("span.sample", { class: i < s.samples.length ? "done" : "" }, String(i + 1)))),
      h(
        "div.stats",
        null,
        ccr !== undefined ? h("div.stat", null, h("strong", null, `${fmt(ccr)} m`), h("span.sub", null, t("exploration.minimumDistanceBetweenSamples"))) : null,
        nearest !== null ? h("div.stat", null, h("strong", null, `${fmt(Math.round(nearest))} m`), h("span.sub", null, t("exploration.fromNearestSample"))) : null,
      ),
      farEnough === null
        ? h("p.sub", null, t("exploration.distanceShowsWhenReSurfaceEdch"))
        : farEnough
          ? h("p.ok", null, t("exploration.farEnoughCanTakeNextSample"))
          : h("p.warn", null, t("exploration.tooCloseMoveAnotherMAway", { value: fmt(Math.ceil(ccr! - nearest!)) })),
    );
  }

  private currentBodies(): HTMLElement | null {
    const st = this.ctx.store.state;
    const a = st.activity;
    const address = a.system?.address ?? st.cmdr.location?.address;
    const bodies = Object.values(a.bodies).filter((b) => b.address === address && (b.bio ?? 0) > 0);
    if (!bodies.length) return null;
    const here = (st.cmdr.surface?.body ?? st.cmdr.location?.body ?? "").toLowerCase();
    return h(
      "section.card",
      null,
      h("h3", null, t("exploration.biologicalSignals", { name: a.system?.name ?? st.cmdr.location?.system ?? "" })),
      bodies.map((b) => {
        const possible = possibleSpecies(b, b.genera);
        const genera = new Map<string, number>();
        for (const sp of possible) genera.set(sp.g, Math.max(genera.get(sp.g) ?? 0, sp.v));
        const best = [...genera.values()].sort((x, y) => y - x).slice(0, b.bio ?? 0);
        const estimate = best.reduce((s, v) => s + v, 0);
        return h(
          "div.bio-body",
          { class: b.name.toLowerCase() === here ? "here" : "" },
          h(
            "div.sync-head",
            null,
            h("div", null, h("strong", null, b.name), h("span.sub", null, (" " + t("exploration.bioSignalCount", { count: b.bio }))), b.wasFootfalled === false ? h("span.badge.hit", null, t("exploration.firstFootfall5")) : null),
            estimate ? h("span", { title: t("exploration.estimateBestPossibleSpeciesEachGenus") }, t("exploration.upCr", { estimate: credits(estimate) })) : null,
          ),
          possible.length
            ? h(
                "div.chips",
                null,
                possible.slice(0, 10).map((sp) => h("span.chip", { title: `${fmt(sp.v)} Cr` }, `${sp.n} · ${credits(sp.v)}`)),
              )
            : h("p.sub", null, b.gravity === undefined ? t("exploration.scanPlanetFssDetailedScanSee") : t("exploration.noKnownSpeciesMatchesMayRare")),
        );
      }),
      h("p.sub", null, t("exploration.possibleSpeciesFromPlanetTypeAtmosphere")),
    );
  }

  // ---------- cartography ----------

  /** The system you are in, as EDSM knows it: who was here first, what is worth scanning. */
  private edsmCard(): HTMLElement | null {
    const system = this.ctx.store.state.cmdr.location?.system;
    if (!system) return null;
    const data = edsmCached(system);
    const failedRecently = this.edsmError.startsWith(`${system}:`) && Date.now() - this.edsmFailedAt < 2 * 60 * 1000;
    if ((!data || Date.now() - data.fetched > 10 * 60 * 1000) && !failedRecently) {
      edsmSystem(system)
        .then(() => {
          if (!busy(this.root)) this.render();
        })
        .catch((e) => {
          this.edsmError = `${system}: ${String((e as Error)?.message ?? e)}`;
          this.edsmFailedAt = Date.now();
          if (!busy(this.root)) this.render();
        });
    }
    const head = h(
      "div.sync-head",
      null,
      h("h3", null, t("exploration.currentSystemEdsm")),
      h("button.link", { title: t("exploration.openSystemSPageEdsm"), onclick: () => openUrl(edsmSystemUrl(system)) }, "EDSM", icon("link")),
    );
    if (!data) {
      const err = this.edsmError?.startsWith(`${system}:`) ? this.edsmError.slice(system.length + 2) : "";
      return h("section.card.edsm", null, head, sys(system), err ? h("p.sub", null, t("exploration.edsmUnavailable", { err })) : h("p.sub", null, h("span.spinner"), (" " + t("exploration.searchingEdsm"))));
    }
    return h("section.card.edsm", null, head, sys(system), ...this.edsmBody(data));
  }
  private edsmError = "";
  private edsmFailedAt = 0;

  private edsmBody(d: EdsmSystem): (HTMLElement | null)[] {
    if (d.unknown) return [h("p", null, h("span.badge.hit", null, t("exploration.unknownEdsm")), (" " + t("exploration.nobodyHasSentSystemEdsmYet")))];
    const firsts = new Map<string, number>();
    for (const b of d.bodies) if (b.discoveredBy) firsts.set(b.discoveredBy, (firsts.get(b.discoveredBy) ?? 0) + 1);
    const star = d.bodies.find((b) => b.type === "Star" && (b.distance ?? 0) === 0) ?? d.bodies.find((b) => b.type === "Star");
    return [
      h(
        "div.stats",
        null,
        h("div.stat", null, h("strong", null, d.bodyCount ? `${fmt(d.bodies.length)} / ${fmt(d.bodyCount)}` : fmt(d.bodies.length)), h("span.sub", null, t("exploration.bodiesKnownEdsm"))),
        d.value !== undefined ? h("div.stat", null, h("strong", null, `${credits(d.value)} Cr`), h("span.sub", null, t("exploration.estimatedValueScan"))) : null,
        d.valueMapped !== undefined ? h("div.stat", null, h("strong", null, `${credits(d.valueMapped)} Cr`), h("span.sub", null, t("exploration.mapping"))) : null,
      ),
      star?.discoveredBy ? h("p.sub", null, t("exploration.discovered", { discoveredBy: star.discoveredBy, value: star.discoveredAt ? ` (${star.discoveredAt.slice(0, 10)})` : "" })) : h("p.sub", null, t("exploration.edsmKnowsNoDiscovererMainStar")),
      d.bodyCount && d.bodies.length < d.bodyCount ? h("p.sub", null, t("exploration.bodiesNeverSentEdsm", { value: fmt(d.bodyCount - d.bodies.length) })) : null,
      d.valuable.length
        ? h(
            "table.table",
            null,
            h("thead", null, h("tr", null, h("th", null, t("exploration.valuableBodies")), h("th.num", null, t("common.distance")), h("th.num", null, t("exploration.maxValue")))),
            h(
              "tbody",
              null,
              d.valuable.slice(0, 8).map((v) => h("tr", null, h("td", null, v.name), h("td.num", null, v.distance !== undefined ? t("common.ls", { locale: fmt(Math.round(v.distance)) }) : ""), h("td.num", null, `${credits(v.value)} Cr`))),
            ),
          )
        : null,
    ];
  }

  private carto(): (HTMLElement | null)[] {
    const a = this.ctx.store.state.activity as typeof this.ctx.store.state.activity & { unsold?: ReturnType<typeof unsoldSummary> };
    const list = a.unsold ?? unsoldSummary(a.bodies, a.unsoldSystems);
    const total = list.reduce((s, x) => s + x.value, 0);
    return [
      this.edsmCard(),
      h(
        "section.card",
        null,
        h("div.sync-head", null, h("h3", null, t("exploration.cartographicDataSell")), h("strong", null, t("exploration.cr", { total: credits(total) }))),
        list.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, t("common.system")), h("th.num", null, t("exploration.bodies")), h("th.num", null, t("exploration.firstDiscoveries")), h("th.num", null, t("exploration.mapped")), h("th.num", null, t("exploration.estimatedValue")), h("th", null, t("exploration.scanned")))),
              h(
                "tbody",
                null,
                list.map((x) =>
                  h("tr", null, h("td", null, sys(x.system)), h("td.num", null, fmt(x.bodies)), h("td.num", null, x.first ? fmt(x.first) : ""), h("td.num", null, x.mapped ? fmt(x.mapped) : ""), h("td.num", null, `${credits(x.value)} Cr`), h("td", null, relTime(x.at))),
                ),
              ),
            )
          : h("p.empty", null, t("exploration.nothingSellScannedBodiesFssDetailed")),
        h("p.sub", null, t("exploration.valuesEstimatedCommunityFormulaWithinFew")),
      ),
    ];
  }
}

