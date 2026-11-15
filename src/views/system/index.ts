// System page: everything public about one system, from Spansh — its allegiance, economy and
// security, Powerplay, the minor factions and their states, the stations with their pads and main
// services, and the stars and planets. Opened from a system name typed in Search (Auto); not in
// the menu. "Back" returns to the page it was opened from.

import { gameName, t } from "../../platform/i18n.js";
import { log } from "../../platform/logger.js";
import { distance, fmtLy, fmtPop, inaraSystem } from "../../services/spansh.js";
import { securityLabel, systemDetails, type SystemDetails } from "../../services/systemSearch.js";
import type { Ctx, View } from "../../state/context.js";
import { fmt, h, icon, replace } from "../../ui/dom.js";
import { relTime } from "../../ui/format.js";
import { systemLink } from "../shared/links.js";
import { setDestination } from "../navigation/index.js";
import { openUrl } from "../../platform/bridge.js";

/** Station services worth a glance, in this order (Spansh's names). */
const KEY_SERVICES = [
  "Market",
  "Shipyard",
  "Outfitting",
  "Material Trader",
  "Technology Broker",
  "Interstellar Factors Contact",
  "Universal Cartographics",
  "Black Market",
  "Vista Genomics",
  "Pioneer Supplies",
];

/** The system to show next, and the page to go back to. */
let wanted: { name: string; from: string } | null = null;

/** Asks the page to show `name` the next time it is drawn; `from` is the page "Back" returns to. */
export function presetSystemPage(name: string, from: string) {
  wanted = { name: name.trim(), from };
}

export class SystemView implements View {
  private root?: HTMLElement;
  /** The system shown (kept while the app runs) and the page "Back" returns to. */
  private name = "";
  private from = "search";
  private details?: SystemDetails | null;
  private error = "";
  private loading = false;
  /** Only the latest lookup may draw its answer. */
  private lookup = 0;

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    if (wanted) {
      const next = wanted;
      wanted = null;
      this.from = next.from === "system" ? this.from : next.from;
      if (next.name && next.name.toLowerCase() !== this.name.toLowerCase()) void this.load(next.name);
    }
    this.render();
  }

  update() {
    // The distance follows the commander; the rest only changes with a new lookup.
    this.render();
  }

  private async load(name: string) {
    const id = ++this.lookup;
    this.name = name;
    this.details = undefined;
    this.error = "";
    this.loading = true;
    this.render();
    try {
      const found = await systemDetails(name);
      if (id !== this.lookup) return;
      this.details = found;
      if (found) this.name = found.name;
    } catch (e) {
      if (id !== this.lookup) return;
      this.error = String((e as Error)?.message ?? e);
      log.warn("system", `Lookup failed: ${this.error}`);
    }
    this.loading = false;
    this.render();
  }

  private render() {
    if (!this.root) return;
    const back = h(
      "button.ghost",
      { onclick: () => this.ctx.store.setView(this.from || "search") },
      "‹ " + t("system.back"),
    );
    if (!this.name) {
      replace(this.root, h("header.view-head", null, h("h1", null, t("system.title"))), back);
      return;
    }
    const d = this.details;
    const head = h(
      "header.view-head",
      null,
      h(
        "div",
        null,
        h("h1", null, d?.name ?? this.name),
        h("p.sub", null, d ? this.subtitle(d) : this.loading ? t("system.loading") : ""),
      ),
      back,
    );
    if (this.loading) {
      replace(this.root, head, h("p.sub", null, h("span.spinner"), " " + t("system.loading")));
      return;
    }
    if (this.error) {
      replace(this.root, head, h("p.error", null, icon("warn"), " " + this.error));
      return;
    }
    if (!d) {
      replace(this.root, head, h("p.empty", null, t("system.notFound", { name: this.name })));
      return;
    }
    replace(
      this.root,
      head,
      this.actions(d),
      this.overview(d),
      this.powerplay(d),
      this.factions(d),
      this.stations(d),
      this.bodies(d),
    );
  }

  /** "42.5 ly from you · updated 3 h ago". */
  private subtitle(d: SystemDetails): string {
    const here = this.ctx.store.state.cmdr.location;
    const parts: string[] = [];
    if (here?.system && here.system.toLowerCase() === d.name.toLowerCase()) parts.push(t("system.youAreHere"));
    else {
      const ly = distance(here?.pos, d.coords);
      if (ly !== undefined) parts.push(t("system.fromYou", { distance: fmtLy(ly) }));
    }
    if (d.updatedAt) parts.push(t("system.updated", { when: relTime(d.updatedAt) }));
    return parts.join(" · ");
  }

  private actions(d: SystemDetails): HTMLElement {
    const link = (label: string, url: string) =>
      h("button.ghost", { onclick: () => void openUrl(url) }, icon("link"), " " + label);
    return h(
      "div.row.system-actions",
      null,
      systemLink(d.name, { navigate: false, text: t("system.copyName") }),
      h(
        "button.ghost",
        {
          onclick: () => {
            setDestination(d.name);
            this.ctx.store.setView("navigation");
          },
        },
        t("system.route"),
      ),
      h(
        "button.ghost",
        {
          title: t("system.searchAroundHelp"),
          onclick: () => {
            this.ctx.store.setReferenceSystem(d.name, d.coords);
            this.ctx.store.setView("search");
          },
        },
        icon("search"),
        " " + t("system.searchAround"),
      ),
      d.id64 ? link("Spansh", `https://spansh.co.uk/system/${d.id64}`) : null,
      link("Inara", inaraSystem(d.name)),
      link("EDSM", `https://www.edsm.net/en/system?systemName=${encodeURIComponent(d.name)}`),
    );
  }

  private overview(d: SystemDetails): HTMLElement {
    const stat = (value: string | undefined, label: string) =>
      value ? h("div.stat", null, h("strong", null, value), h("span.sub", null, label)) : null;
    const economy = [d.economy, d.secondEconomy]
      .filter(Boolean)
      .map((e) => gameName(e!))
      .join(" / ");
    const flags = [
      d.needsPermit ? { text: t("system.permit"), tone: "warn" } : null,
      d.beingColonised ? { text: t("system.beingColonised"), tone: "hit" } : null,
      d.colonised === false && !d.beingColonised ? { text: t("system.notColonised"), tone: "muted" } : null,
      d.thargoidState ? { text: gameName(d.thargoidState), tone: "warn" } : null,
    ].filter((f): f is { text: string; tone: string } => Boolean(f));
    return h(
      "section.card",
      null,
      h("h3", null, t("system.overview")),
      h(
        "div.stats",
        null,
        stat(d.population ? fmtPop(d.population) : t("system.unpopulated"), t("system.population")),
        stat(d.allegiance && gameName(d.allegiance), t("search.systemAllegiance")),
        stat(d.government && gameName(d.government), t("search.systemGovernment")),
        stat(economy || undefined, t("search.systemEconomy")),
        stat(d.security && securityLabel(d.security), t("search.systemSecurity")),
        stat(d.controllingFaction, t("system.controllingFaction")),
      ),
      flags.length
        ? h(
            "div.row.opts",
            null,
            flags.map((f) => h(`span.badge.${f.tone}`, null, f.text)),
          )
        : null,
    );
  }

  private powerplay(d: SystemDetails): HTMLElement | null {
    if (!d.power && !d.powers.length) return null;
    const others = d.powers.filter((p) => p !== d.power);
    return h(
      "section.card",
      null,
      h("h3", null, "Powerplay"),
      h(
        "div.stats",
        null,
        d.power
          ? h(
              "div.stat",
              null,
              h("strong", null, d.power),
              h("span.sub", null, d.powerState ? gameName(d.powerState) : t("system.controllingPower")),
            )
          : null,
        d.controlProgress !== undefined
          ? h(
              "div.stat",
              null,
              h("strong", null, `${fmt(d.controlProgress)} %`),
              h("span.sub", null, t("system.controlProgress")),
            )
          : null,
        d.reinforcement !== undefined
          ? h("div.stat", null, h("strong", null, fmt(d.reinforcement)), h("span.sub", null, t("system.reinforcement")))
          : null,
        d.undermining !== undefined
          ? h("div.stat", null, h("strong", null, fmt(d.undermining)), h("span.sub", null, t("system.undermining")))
          : null,
      ),
      others.length ? h("p.sub", null, t("system.otherPowers", { powers: others.join(", ") })) : null,
    );
  }

  private factions(d: SystemDetails): HTMLElement | null {
    if (!d.factions.length) return null;
    return h(
      "section.card",
      null,
      h("h3", null, t("system.factions", { count: d.factions.length })),
      h(
        "table.table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, t("search.faction")),
            h("th.num", null, t("system.influence")),
            h("th", null, t("system.state")),
            h("th", null, t("search.systemAllegiance")),
            h("th", null, t("search.systemGovernment")),
          ),
        ),
        h(
          "tbody",
          null,
          d.factions.map((f) =>
            h(
              "tr",
              null,
              h("td", { "data-no-tr": "" }, f.controls ? h("strong", null, f.name, " ★") : f.name),
              h("td.num", null, Number.isFinite(f.influence) ? `${fmt(f.influence)} %` : "—"),
              h("td", null, f.state ? gameName(f.state) : "—"),
              h("td", null, f.allegiance ? gameName(f.allegiance) : "—"),
              h("td", null, f.government ? gameName(f.government) : "—"),
            ),
          ),
        ),
      ),
    );
  }

  private stations(d: SystemDetails): HTMLElement | null {
    if (!d.stations.length) return null;
    // Fleet carriers come and go: counted, not listed.
    const carriers = d.stations.filter((s) => s.type === "Drake-Class Carrier");
    const listed = d.stations.filter((s) => s.type !== "Drake-Class Carrier");
    return h(
      "section.card",
      null,
      h("h3", null, t("system.stations", { count: listed.length })),
      carriers.length ? h("p.sub", null, t("system.carriers", { count: carriers.length })) : null,
      listed.length
        ? h(
            "table.table.system-stations",
            null,
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, t("system.station")),
                h("th", null, t("common.type")),
                h("th", null, t("system.pad")),
                h("th.num", null, t("system.distance")),
                h("th", null, t("system.services")),
              ),
            ),
            h(
              "tbody",
              null,
              listed.map((s) =>
                h(
                  "tr",
                  null,
                  h("td", { "data-no-tr": "" }, s.name, s.faction ? h("div.sub", null, s.faction) : null),
                  h("td", null, s.type ? gameName(s.type) : "—"),
                  h("td", null, s.largestPad ?? "—"),
                  h(
                    "td.num",
                    null,
                    s.distance !== undefined ? t("common.ls", { locale: fmt(Math.round(s.distance)) }) : "—",
                  ),
                  h(
                    "td",
                    null,
                    KEY_SERVICES.filter((service) => s.services.includes(service)).map((service) =>
                      h("span.badge.muted", null, gameName(service)),
                    ),
                  ),
                ),
              ),
            ),
          )
        : null,
    );
  }

  private bodies(d: SystemDetails): HTMLElement | null {
    if (!d.bodies.length && !d.bodyCount) return null;
    const stars = d.bodies.filter((b) => b.type === "Star");
    const planets = d.bodies.filter((b) => b.type !== "Star");
    // Planets by kind, the most common first ("Icy body ×12").
    const kinds = new Map<string, number>();
    for (const b of planets) kinds.set(b.subtype, (kinds.get(b.subtype) ?? 0) + 1);
    const byKind = [...kinds].sort((a, b) => b[1] - a[1]);
    return h(
      "section.card",
      null,
      h("h3", null, t("system.bodies", { count: d.bodyCount || d.bodies.length })),
      stars.length
        ? h(
            "div.row.opts",
            null,
            h("span.sub", null, t("system.stars")),
            stars.map((s) => h(`span.badge.${s.mainStar ? "hit" : "muted"}`, { title: s.name }, gameName(s.subtype))),
          )
        : null,
      byKind.length
        ? h(
            "div.row.opts",
            null,
            h("span.sub", null, t("system.planets")),
            byKind.map(([kind, count]) => h("span.badge.muted", null, `${gameName(kind)} ×${count}`)),
          )
        : null,
      d.bodyCount > d.bodies.length ? h("p.sub", null, t("system.bodiesPartial", { known: d.bodies.length })) : null,
      d.bodies.length
        ? h(
            "details",
            null,
            h("summary", null, t("system.allBodies")),
            h(
              "table.table",
              null,
              h(
                "tbody",
                null,
                d.bodies.map((b) =>
                  h(
                    "tr",
                    null,
                    h("td", { "data-no-tr": "" }, b.name),
                    h("td", null, gameName(b.subtype || b.type)),
                    h(
                      "td.num",
                      null,
                      b.distance !== undefined ? t("common.ls", { locale: fmt(Math.round(b.distance)) }) : "—",
                    ),
                  ),
                ),
              ),
            ),
          )
        : null,
    );
  }
}
