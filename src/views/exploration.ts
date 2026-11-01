import { bodyValue, surfaceDistance, type BodyInfo, type OrganicFind, type Sampling } from "../activity.js";
import { fmt, h, replace } from "../dom.js";
import { colonyDistance, possibleSpecies, speciesValue } from "../exobio.js";
import { credits, relTime } from "../time.js";
import type { Ctx, View } from "../context.js";
import { busy, sys } from "./missions.js";
import { openUrl } from "../bridge.js";
import { icon } from "../dom.js";
import { edsmCached, edsmSystem, edsmSystemUrl, type EdsmSystem } from "../edsm.js";

type Tab = "bio" | "carto";

/** Unsold cartography, per system (computed on the PC, sent as-is to a phone). */
export function unsoldSummary(bodies: Record<string, BodyInfo>, systems: Record<string, string[]>) {
  return Object.entries(systems)
    .map(([system, keys]) => {
      const list = keys.map((k) => bodies[k]).filter(Boolean) as BodyInfo[];
      return {
        system,
        bodies: list.length,
        value: list.reduce((s, b) => s + bodyValue(b), 0),
        first: list.filter((b) => b.wasDiscovered === false).length,
        mapped: list.filter((b) => b.mapped).length,
        at: list.reduce((m, b) => (b.scannedAt > m ? b.scannedAt : m), ""),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

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
        ["bio", "Exobiologie"],
        ["carto", "Cartographie"],
      ] as [Tab, string][]).map(([t, l]) => h("button", { class: this.tab === t ? "active" : "", onclick: () => ((this.tab = t), this.render()) }, l)),
    );
    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, "Exploration"), h("p.sub", null, "Ce que valent tes données pas encore vendues, et l'aide aux prélèvements biologiques.")), tabs),
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
        h("div.sync-head", null, h("h3", null, "Analyses à vendre (Vista Genomics)"), h("strong", null, `${credits(total)} Cr`)),
        found.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, "Espèce"), h("th", null, "Lieu"), h("th.num", null, "Valeur"), h("th", null, ""))),
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
                    h("td", null, b?.wasFootfalled === false ? h("span.badge.hit", { title: "Premier pas sur cette planète : le bonus de première découverte multiplie la valeur par 5" }, "×5 possible") : null),
                  );
                }),
              ),
            )
          : h("p.empty", null, "Aucune analyse en attente. Les espèces analysées (3 prélèvements) s'ajoutent ici jusqu'à leur vente."),
        found.length ? h("p.sub.warn", null, "Attention : une destruction fait perdre toutes les analyses non vendues.") : null,
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
        ccr !== undefined ? h("div.stat", null, h("strong", null, `${fmt(ccr)} m`), h("span.sub", null, "distance minimale entre prélèvements")) : null,
        nearest !== null ? h("div.stat", null, h("strong", null, `${fmt(Math.round(nearest))} m`), h("span.sub", null, "du prélèvement le plus proche")) : null,
      ),
      farEnough === null
        ? h("p.sub", null, "La distance s'affiche quand tu es à la surface (EDCH lit ta position dans Status.json).")
        : farEnough
          ? h("p.ok", null, "Assez loin : tu peux faire le prélèvement suivant.")
          : h("p.warn", null, `Trop près : éloigne-toi encore de ${fmt(Math.ceil(ccr! - nearest!))} m.`),
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
      h("h3", null, `Signaux biologiques dans ${a.system?.name ?? st.cmdr.location?.system ?? ""}`),
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
            h("div", null, h("strong", null, b.name), h("span.sub", null, ` · ${b.bio} signal(s) biologique(s)`), b.wasFootfalled === false ? h("span.badge.hit", null, "Premier pas ×5") : null),
            estimate ? h("span", { title: "Estimation : meilleure espèce possible de chaque genre" }, `jusqu'à ${credits(estimate)} Cr`) : null,
          ),
          possible.length
            ? h(
                "div.chips",
                null,
                possible.slice(0, 10).map((sp) => h("span.chip", { title: `${fmt(sp.v)} Cr` }, `${sp.n} · ${credits(sp.v)}`)),
              )
            : h("p.sub", null, b.gravity === undefined ? "Scanne la planète (FSS ou scan détaillé) pour voir les espèces possibles." : "Aucune espèce connue ne correspond : elle est peut-être rare ou de région."),
        );
      }),
      h("p.sub", null, "Espèces possibles d'après le type de planète, l'atmosphère, la gravité, la température et la pression. La région galactique n'est pas vérifiée."),
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
      h("h3", null, "Système actuel sur EDSM"),
      h("button.link", { title: "Ouvrir la page du système sur EDSM", onclick: () => openUrl(edsmSystemUrl(system)) }, "EDSM", icon("link")),
    );
    if (!data) {
      const err = this.edsmError?.startsWith(`${system}:`) ? this.edsmError.slice(system.length + 2) : "";
      return h("section.card.edsm", null, head, sys(system), err ? h("p.sub", null, `EDSM indisponible : ${err}`) : h("p.sub", null, h("span.spinner"), " Recherche sur EDSM…"));
    }
    return h("section.card.edsm", null, head, sys(system), ...this.edsmBody(data));
  }
  private edsmError = "";
  private edsmFailedAt = 0;

  private edsmBody(d: EdsmSystem): (HTMLElement | null)[] {
    if (d.unknown) return [h("p", null, h("span.badge.hit", null, "Inconnu d'EDSM"), " Personne n'a encore envoyé ce système à EDSM : tu es peut-être le premier à l'explorer.")];
    const firsts = new Map<string, number>();
    for (const b of d.bodies) if (b.discoveredBy) firsts.set(b.discoveredBy, (firsts.get(b.discoveredBy) ?? 0) + 1);
    const star = d.bodies.find((b) => b.type === "Star" && (b.distance ?? 0) === 0) ?? d.bodies.find((b) => b.type === "Star");
    return [
      h(
        "div.stats",
        null,
        h("div.stat", null, h("strong", null, d.bodyCount ? `${fmt(d.bodies.length)} / ${fmt(d.bodyCount)}` : fmt(d.bodies.length)), h("span.sub", null, "corps connus d'EDSM")),
        d.value !== undefined ? h("div.stat", null, h("strong", null, `${credits(d.value)} Cr`), h("span.sub", null, "valeur estimée (scan)")) : null,
        d.valueMapped !== undefined ? h("div.stat", null, h("strong", null, `${credits(d.valueMapped)} Cr`), h("span.sub", null, "avec cartographie")) : null,
      ),
      star?.discoveredBy ? h("p.sub", null, `Découvert par ${star.discoveredBy}${star.discoveredAt ? ` (${star.discoveredAt.slice(0, 10)})` : ""}`) : h("p.sub", null, "Aucun découvreur connu d'EDSM pour l'étoile principale."),
      d.bodyCount && d.bodies.length < d.bodyCount ? h("p.sub", null, `${fmt(d.bodyCount - d.bodies.length)} corps jamais envoyés à EDSM.`) : null,
      d.valuable.length
        ? h(
            "table.table",
            null,
            h("thead", null, h("tr", null, h("th", null, "Corps intéressants"), h("th.num", null, "Distance"), h("th.num", null, "Valeur max"))),
            h(
              "tbody",
              null,
              d.valuable.slice(0, 8).map((v) => h("tr", null, h("td", null, v.name), h("td.num", null, v.distance !== undefined ? `${fmt(Math.round(v.distance))} ls` : ""), h("td.num", null, `${credits(v.value)} Cr`))),
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
        h("div.sync-head", null, h("h3", null, "Données cartographiques à vendre"), h("strong", null, `≈ ${credits(total)} Cr`)),
        list.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, "Système"), h("th.num", null, "Corps"), h("th.num", null, "Premières découvertes"), h("th.num", null, "Cartographiés"), h("th.num", null, "Valeur estimée"), h("th", null, "Scanné"))),
              h(
                "tbody",
                null,
                list.map((x) =>
                  h("tr", null, h("td", null, sys(x.system)), h("td.num", null, fmt(x.bodies)), h("td.num", null, x.first ? fmt(x.first) : ""), h("td.num", null, x.mapped ? fmt(x.mapped) : ""), h("td.num", null, `${credits(x.value)} Cr`), h("td", null, relTime(x.at))),
                ),
              ),
            )
          : h("p.empty", null, "Rien à vendre. Les corps scannés (FSS, scan détaillé, cartographie) s'ajoutent ici jusqu'à leur vente à Universal Cartographics."),
        h("p.sub", null, "Valeurs estimées avec la formule communautaire (à quelques % près), bonus de première découverte et de cartographie compris. Une destruction fait tout perdre."),
      ),
    ];
  }
}

