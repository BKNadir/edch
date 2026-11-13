// BGS page: follow a minor faction. Its systems (your own visits from the journal; Spansh's list
// and EDSM's influence history on request, kept between sessions), the trend and forecast of
// each, what needs attention and what to do there, what you did for it since the tick or over
// a day or a week, and a tour of the systems whose data is old. Nothing is sent from here: in
// BGS or Invisible mode, the tour reads fresh data but shares nothing (services/sync).

import { HISTORY_DAYS } from "../../game/activity/index.js";
import { gameName, t } from "../../platform/i18n.js";
import { log } from "../../platform/logger.js";
import { knownTick, refreshTick } from "../../services/bgsTick.js";
import { edsmFactions } from "../../services/edsm.js";
import { factionSystems, fmtLy } from "../../services/spansh.js";
import {
  type BgsHistory,
  HISTORY_KEEP_DAYS,
  loadBgsHistory,
  recordSystem,
  sampleOf,
  saveBgsHistory,
} from "../../state/bgsHistory.js";
import type { Ctx, View } from "../../state/context.js";
import { referenceOf } from "../../state/context.js";
import { callout, fmt, h, replace } from "../../ui/dom.js";
import { credits, relTime } from "../../ui/format.js";
import {
  activityFor,
  adviceFor,
  FORECAST_DAYS,
  type BgsAlertKind,
  type BgsSystemRow,
  factionRows,
  knownFactions,
  refreshTour,
} from "../../features/bgs/analysis.js";
import { systemLink } from "../shared/links.js";

/** Periods of "what you did": since the last BGS tick (when known), the last 24 hours, 7 days. */
const PERIODS = { tick: 0, day: 86_400_000, week: 7 * 86_400_000 } as const;
type Period = keyof typeof PERIODS;

const ALERT_LABELS = (): Record<BgsAlertKind, string> => ({
  expansion: t("bgs.alertExpansion"),
  retreat: t("bgs.alertRetreat"),
  rivalClose: t("bgs.alertRivalClose"),
  conflict: t("bgs.alertConflict"),
  staleData: t("bgs.alertStaleData"),
  notVisited: t("bgs.alertNotVisited"),
  atRisk: t("bgs.alertAtRisk"),
});

const ADVICE_LABELS = (): Record<string, string> => ({
  conflictZones: t("bgs.adviceConflictZones"),
  election: t("bgs.adviceElection"),
  trade: t("bgs.adviceTrade"),
  food: t("bgs.adviceFood"),
  medicines: t("bgs.adviceMedicines"),
  bounties: t("bgs.adviceBounties"),
  supplies: t("bgs.adviceSupplies"),
  rescue: t("bgs.adviceRescue"),
  usual: t("bgs.adviceUsual"),
});

/** Alerts that make a row stand out (the others are informative). */
const SERIOUS: BgsAlertKind[] = ["retreat", "conflict", "rivalClose", "atRisk"];

/** EDSM is asked about this many systems at most per update, nearest to trouble first. */
const EDSM_MAX_PER_UPDATE = 40;
/** A system EDSM was asked about this recently is skipped (its data changes once a day). */
const EDSM_RECHECK_MS = 2 * 3_600_000;
/** Pause between two EDSM requests, to stay well under its rate limit. */
const EDSM_PAUSE_MS = 400;
/** EDSM failing this many times in a row ends the update. */
const EDSM_MAX_FAILURES = 3;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where an update stands, and how it ended. */
type Progress = { step: "spansh"; found: number; total: number } | { step: "edsm"; done: number; total: number };
interface UpdateResult {
  spansh?: { count: number; total: number; partial: boolean };
  spanshFailed: boolean;
  edsm: number;
  edsmFailed: boolean;
}

export class BgsView implements View {
  private root?: HTMLElement;
  private period: Period = "tick";
  /** What Spansh and EDSM told, kept between sessions (state/bgsHistory.ts). */
  private known: BgsHistory = loadBgsHistory();
  private loading?: Progress;
  private result?: UpdateResult;

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  /** The tick is asked only while this page is shown with a faction followed (not at start-up). */
  private checkTick() {
    if (!this.faction || !this.root?.isConnected) return;
    const before = knownTick();
    void refreshTick().then((tick) => {
      if (tick !== before) this.render();
    });
  }

  update() {
    // Typing the faction's name: don't redraw under the cursor.
    if (this.root?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") return;
    this.render();
  }

  private get faction() {
    return this.ctx.store.state.settings.bgs.faction;
  }

  private setFaction(faction: string) {
    const name = faction.trim().slice(0, 120);
    if (name === this.faction) return;
    this.ctx.store.updateSettings({ bgs: { faction: name } });
    this.result = undefined;
    this.render();
  }

  /**
   * The update, on request only: Spansh's list of the faction's systems, then EDSM's influence
   * history for those that need it most. Everything read is kept (state/bgsHistory.ts); nothing
   * is sent about the commander.
   */
  private async updateSystems() {
    const faction = this.faction;
    if (!faction || this.loading) return;
    const result: UpdateResult = { spanshFailed: false, edsm: 0, edsmFailed: false };
    this.loading = { step: "spansh", found: 0, total: 0 };
    this.result = undefined;
    this.render();
    try {
      const list = await factionSystems(faction, referenceOf(this.ctx), (found, total) => {
        this.loading = { step: "spansh", found, total };
        this.render();
      });
      for (const system of list.systems) {
        const sample = system.updatedAt ? sampleOf(system.updatedAt, system.factions) : null;
        recordSystem(this.known, system.name, {
          coords: system.coords,
          snapshot: system.updatedAt
            ? { at: system.updatedAt, source: "spansh", controlling: system.controlling, factions: system.factions }
            : undefined,
          samples: sample ? [sample] : [],
        });
      }
      result.spansh = { count: list.systems.length, total: list.total, partial: list.partial };
      saveBgsHistory(this.known);
    } catch (error) {
      log.warn("bgs", `Spansh faction search failed: ${(error as Error)?.message ?? error}`);
      result.spanshFailed = true;
    }

    const now = Date.now();
    const rows = factionRows(faction, this.known, this.ctx.store.state.activity.bgs.observed, now);
    const due = rows
      .filter((row) => {
        const checked = this.known[row.system.toLowerCase()]?.edsmCheckedAt;
        return !checked || now - Date.parse(checked) >= EDSM_RECHECK_MS;
      })
      .slice(0, EDSM_MAX_PER_UPDATE);
    const since = now - HISTORY_KEEP_DAYS * 86_400_000;
    let failures = 0;
    for (const [index, row] of due.entries()) {
      this.loading = { step: "edsm", done: index, total: due.length };
      this.render();
      try {
        const answer = await edsmFactions(row.system, since);
        recordSystem(this.known, row.system, {
          snapshot: answer?.updatedAt
            ? { at: answer.updatedAt, source: "edsm", controlling: answer.controlling, factions: answer.factions }
            : undefined,
          samples: answer?.history ?? [],
          edsmCheckedAt: new Date().toISOString(),
        });
        if (answer) result.edsm += 1;
        failures = 0;
      } catch (error) {
        log.warn("bgs", `EDSM factions failed: ${(error as Error)?.message ?? error}`);
        if (++failures >= EDSM_MAX_FAILURES) {
          result.edsmFailed = true;
          break;
        }
      }
      await pause(EDSM_PAUSE_MS);
    }
    saveBgsHistory(this.known);
    this.loading = undefined;
    this.result = result;
    this.render();
  }

  private render() {
    if (!this.root) return;
    const { activity, settings, cmdr } = this.ctx.store.state;
    const faction = this.faction;
    const position = cmdr.location?.pos;
    const rows = factionRows(faction, this.known, activity.bgs.observed, Date.now(), position);
    this.checkTick();
    const tick = knownTick();
    const period: Period = this.period === "tick" && !tick ? "day" : this.period;
    const since = period === "tick" ? tick! : new Date(Date.now() - PERIODS[period]).toISOString();
    const done = faction ? activityFor(activity.bgs.actions, faction, since) : [];
    const tour = refreshTour(rows, position);
    const shareMode = settings.sync.shareMode;

    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, t("bgs.title")), h("p.sub", null, t("bgs.subtitle")))),
      this.factionCard(faction, activity.bgs.observed, rows),
      faction ? this.alertsSummary(rows) : null,
      faction ? this.activityCard(done, period, tick) : null,
      faction ? this.systemsCard(rows, tick) : null,
      faction ? this.tourCard(tour, shareMode) : null,
    );
  }

  private factionCard(
    faction: string,
    observed: Parameters<typeof knownFactions>[0],
    rows: BgsSystemRow[],
  ): HTMLElement {
    const known = knownFactions(observed);
    const listId = "bgs-known-factions";
    const input = h("input", {
      type: "text",
      value: faction,
      list: listId,
      maxlength: "120",
      placeholder: t("bgs.factionPlaceholder"),
      onchange: (e: Event) => this.setFaction((e.target as HTMLInputElement).value),
    });
    const status = this.loading
      ? h(
          "p.sub",
          null,
          h("span.spinner"),
          " ",
          this.loading.step === "spansh"
            ? t("bgs.loading", { found: this.loading.found, total: this.loading.total || "…" })
            : t("bgs.loadingEdsm", { done: this.loading.done, total: this.loading.total }),
        )
      : this.result
        ? h(
            "p.sub",
            null,
            this.result.spanshFailed
              ? h("span.bad", null, t("bgs.loadFailed"))
              : this.result.spansh?.partial
                ? t("bgs.loadedPartial", { count: this.result.spansh.count, total: this.result.spansh.total })
                : t("bgs.loaded", { count: this.result.spansh?.count ?? 0 }),
            " ",
            this.result.edsmFailed
              ? h("span.bad", null, t("bgs.edsmFailed"))
              : t("bgs.edsmUpdated", { count: this.result.edsm }),
          )
        : faction
          ? h(
              "p.sub",
              null,
              rows.some((row) => row.source !== "journal" || this.known[row.system.toLowerCase()])
                ? t("bgs.keptData", { days: HISTORY_KEEP_DAYS })
                : t("bgs.journalOnly"),
            )
          : null;
    return h(
      "section.card",
      null,
      h("h3", null, t("bgs.followedFaction")),
      h(
        "div.row",
        null,
        input,
        h(
          "datalist",
          { id: listId },
          known.slice(0, 200).map((name) => h("option", { value: name })),
        ),
        h(
          "button.primary",
          { disabled: !faction || Boolean(this.loading), onclick: () => void this.updateSystems() },
          t("bgs.loadFromSpansh"),
        ),
      ),
      status,
    );
  }

  private alertsSummary(rows: BgsSystemRow[]): HTMLElement {
    const labels = ALERT_LABELS();
    const count = (kind: BgsAlertKind) => rows.filter((row) => row.alerts.includes(kind)).length;
    return h(
      "section.card",
      null,
      h("h3", null, t("bgs.overview")),
      h(
        "div.stats",
        null,
        h("div.stat", null, h("strong", null, fmt(rows.length)), h("span.sub", null, t("bgs.systems"))),
        h(
          "div.stat",
          null,
          h("strong", null, fmt(rows.filter((row) => row.controls).length)),
          h("span.sub", null, t("bgs.controlled")),
        ),
        (["conflict", "atRisk", "retreat", "rivalClose", "expansion", "staleData"] as BgsAlertKind[]).map((kind) =>
          h("div.stat", null, h("strong", null, fmt(count(kind))), h("span.sub", null, labels[kind])),
        ),
      ),
    );
  }

  private activityCard(done: ReturnType<typeof activityFor>, shown: Period, tick?: string): HTMLElement {
    const periodButton = (period: Period, label: string) =>
      h(
        `button${shown === period ? ".active" : ""}`,
        {
          disabled: period === "tick" && !tick,
          title:
            period === "tick" ? (tick ? t("bgs.tickAt", { time: relTime(tick) }) : t("bgs.tickUnknown")) : undefined,
          onclick: () => {
            this.period = period;
            this.render();
          },
        },
        label,
      );
    const cr = (n: number) => (n ? credits(n) : "—");
    return h(
      "section.card",
      null,
      h(
        "div.bgs-card-head",
        null,
        h("h3", null, t("bgs.yourActivity")),
        h(
          "div.segmented",
          null,
          periodButton("tick", t("bgs.sinceTick")),
          periodButton("day", t("bgs.last24h")),
          periodButton("week", t("bgs.last7days")),
        ),
      ),
      h("p.sub", null, t("bgs.activityHelp", { days: HISTORY_DAYS })),
      done.length
        ? h(
            "div.bgs-table-wrap",
            null,
            h(
              "table.table.bgs-table",
              null,
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  [
                    t("bgs.system"),
                    t("bgs.missions"),
                    t("bgs.bounties"),
                    t("bgs.combatBonds"),
                    t("bgs.trade"),
                    t("bgs.exploration"),
                    t("bgs.against"),
                  ].map((label) => h("th", null, label)),
                ),
              ),
              h(
                "tbody",
                null,
                done.map((row) =>
                  h(
                    "tr",
                    null,
                    h("td", null, systemLink(row.system)),
                    h(
                      "td",
                      null,
                      row.missions
                        ? `${fmt(row.missions)} (${row.influence >= 0 ? "+" : ""}${fmt(row.influence)} ${t("bgs.influencePlus")})`
                        : "—",
                    ),
                    h("td", null, cr(row.bounties)),
                    h("td", null, cr(row.combatBonds)),
                    h("td", null, cr(row.tradeProfit + row.blackMarket)),
                    h("td", null, cr(row.exploration)),
                    h(`td${row.against ? ".bad" : ""}`, null, row.against ? fmt(row.against) : "—"),
                  ),
                ),
              ),
            ),
          )
        : h("p.sub", null, t("bgs.nothingDone")),
    );
  }

  private systemsCard(rows: BgsSystemRow[], tick?: string): HTMLElement {
    const labels = ALERT_LABELS();
    const advice = ADVICE_LABELS();
    const percent = (n?: number) => (n === undefined ? "?" : `${n.toFixed(1)} %`);
    /** The trend per day and the forecast, e.g. "▼ 1.2/d → 38.4 % in 3 d". */
    const trend = (row: BgsSystemRow) =>
      row.trend === undefined
        ? null
        : h(
            "div",
            { title: t("bgs.trendHelp", { days: FORECAST_DAYS }) },
            h(
              `span.${row.trend > 0 ? "ok" : row.trend < 0 ? "bad" : "sub"}`,
              null,
              `${row.trend > 0 ? "▲" : row.trend < 0 ? "▼" : "="} ${t("bgs.perDay", { value: Math.abs(row.trend).toFixed(1) })}`,
            ),
            row.forecast === undefined
              ? null
              : h("small.sub", null, ` → ${percent(row.forecast)} ${t("bgs.inDays", { days: FORECAST_DAYS })}`),
          );
    const states = (row: BgsSystemRow) =>
      [...new Set([row.state, ...row.active].filter((s) => s && s !== "None"))].map((s) => gameName(s));
    return h(
      "section.card",
      null,
      h("h3", null, t("bgs.factionSystems")),
      h("p.sub", null, t("bgs.systemsHelp"), tick ? ` ${t("bgs.lastTick", { time: relTime(tick) })}` : null),
      rows.length
        ? h(
            "div.bgs-table-wrap",
            null,
            h(
              "table.table.bgs-table",
              null,
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  [
                    t("bgs.system"),
                    t("bgs.influence"),
                    t("bgs.rival"),
                    t("bgs.states"),
                    t("bgs.data"),
                    t("bgs.lastVisit"),
                    t("bgs.toDo"),
                  ].map((label) => h("th", null, label)),
                ),
              ),
              h(
                "tbody",
                null,
                rows.map((row) =>
                  h(
                    `tr${row.alerts.some((a) => SERIOUS.includes(a)) ? ".bgs-attention" : ""}`,
                    null,
                    h(
                      "td",
                      null,
                      systemLink(row.system),
                      row.controls ? h("span.badge.hit", { title: t("bgs.controlsHelp") }, t("bgs.controls")) : null,
                      row.distance !== undefined ? h("small.sub", null, ` ${fmtLy(row.distance)}`) : null,
                    ),
                    h("td", null, percent(row.influence), trend(row)),
                    h(
                      "td",
                      null,
                      row.rival
                        ? h(
                            "span",
                            { title: row.rival.name },
                            `${row.rival.gap >= 0 ? "+" : ""}${row.rival.gap.toFixed(1)} · ${row.rival.name}`,
                            row.rival.forecastGap === undefined
                              ? null
                              : h(
                                  `small.${row.rival.forecastGap <= 0 ? "bad" : "sub"}`,
                                  null,
                                  ` → ${row.rival.forecastGap >= 0 ? "+" : ""}${row.rival.forecastGap.toFixed(1)} ${t("bgs.inDays", { days: FORECAST_DAYS })}`,
                                ),
                          )
                        : "—",
                    ),
                    h(
                      "td",
                      null,
                      states(row).map((s) => h("span.badge", null, s)),
                      row.pending.length
                        ? h("small.sub", null, ` ${t("bgs.pending")} ${row.pending.map((s) => gameName(s)).join(", ")}`)
                        : null,
                      row.alerts
                        .filter((a) => a !== "staleData" && a !== "notVisited")
                        .map((a) => h(`span.badge.${SERIOUS.includes(a) ? "warn" : "muted"}`, null, labels[a])),
                    ),
                    h(
                      `td${row.alerts.includes("staleData") ? ".bad" : ""}`,
                      null,
                      row.dataAt ? relTime(row.dataAt) : "?",
                      h(
                        "small.sub",
                        null,
                        ` ${row.source === "journal" ? t("bgs.sourceJournal") : row.source === "edsm" ? "EDSM" : "Spansh"}`,
                      ),
                      tick && row.dataAt && row.dataAt < tick
                        ? h("span.badge.muted", { title: t("bgs.beforeTickHelp") }, t("bgs.beforeTick"))
                        : null,
                    ),
                    h(
                      `td${row.alerts.includes("notVisited") ? ".bad" : ""}`,
                      null,
                      row.lastVisit ? relTime(row.lastVisit) : "—",
                    ),
                    h(
                      "td",
                      null,
                      adviceFor(row)
                        .map((key) => advice[key])
                        .join(" · "),
                    ),
                  ),
                ),
              ),
            ),
          )
        : h("p.sub", null, t("bgs.noSystems")),
    );
  }

  private tourCard(tour: BgsSystemRow[], shareMode: string): HTMLElement {
    return h(
      "section.card",
      null,
      h("h3", null, t("bgs.refreshTour")),
      h("p.sub", null, t("bgs.refreshTourHelp")),
      shareMode === "normal"
        ? null
        : shareMode === "bgs"
          ? callout("info", t("shareMode.bgs"), t("bgs.tourBgsMode"))
          : callout("info", t("shareMode.invisible"), t("bgs.tourInvisibleMode")),
      tour.length
        ? h(
            "ol.bgs-tour",
            null,
            tour.map((row) =>
              h("li", null, systemLink(row.system), h("small.sub", null, ` ${row.dataAt ? relTime(row.dataAt) : "?"}`)),
            ),
          )
        : h("p.sub", null, t("bgs.nothingToRefresh")),
    );
  }
}
