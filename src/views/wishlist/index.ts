// Wishlist page: the blueprints wanted with their grades and materials, build import (Coriolis,
// EDSY), the engineer for each line, and the engineer tour route.

import { doneOnShip } from "../../features/engineers/doneOnShip.js";
import { pickEngineer } from "../../features/engineers/engineerPick.js";
import { goToStop, passStop, planTour, stopTour, type Stop, tourProgress } from "../../features/engineers/tour.js";
import { extractLoadout, importLoadout } from "../../features/materials/buildImporter.js";
import { suggestTrades } from "../../features/materials/trade.js";
import type { Blueprint } from "../../game/types.js";
import { gameName, t } from "../../platform/i18n.js";
import { fmtLy } from "../../services/spansh.js";
import { type Ctx, ownedOf, reserved, type View } from "../../state/context.js";
import {
  blueprintGrades,
  bpKey,
  defaultRolls,
  type WishlistMode,
  totalNeeds,
  type WishItem,
  wishNeeds,
} from "../../state/store.js";
import { fmt, h, icon, replace, toast } from "../../ui/dom.js";
import { kindFr } from "../detail/index.js";
import { engineerLinks, moduleLink } from "../shared/links.js";
import { engineerRow, unlockBadge } from "./engineerRow.js";
import { confirmClear, lineLabel, select } from "./widgets.js";

export function addToWishlist(ctx: Ctx, bp: Blueprint, from?: number, to?: number) {
  const grades = blueprintGrades(ctx.game, bpKey(bp));
  const max = Math.max(...grades.keys());
  const item: WishItem = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    bp: bpKey(bp),
    gradeFrom: from ?? (bp.kind === "modification" ? 1 : (bp.grade ?? 0)),
    gradeTo: to ?? (bp.kind === "modification" ? (bp.grade ?? max) : (bp.grade ?? 0)),
    rolls: {},
    count: 1,
  };
  ctx.store.setWishlist([...ctx.store.state.wishlist, item]);
  toast(t("wishlist.addedWishlist", { module: gameName(bp.module), name: gameName(bp.name) }));
}

export class WishlistView implements View {
  private root?: HTMLElement;
  /** Kept across re-renders so a pasted build is not lost. */
  private importPanel: HTMLElement;
  private importOpen = false;
  private toolbar = h("div.toolbar");
  /** Simple (the tour only) or advanced (every line, the materials): starts on the setting. */
  private mode: WishlistMode;

  constructor(private ctx: Ctx) {
    this.importPanel = this.buildImport();
    this.mode = ctx.store.state.settings.engineers.wishlistMode;
  }

  /** The Simple / Advanced switch at the top of the page. */
  private modeSwitch(): HTMLElement {
    const modes: [WishlistMode, string][] = [
      ["advanced", t("wishlist.modeAdvanced")],
      ["simple", t("wishlist.modeSimple")],
    ];
    return h(
      "div.segmented",
      { title: t("wishlist.modeHelp") },
      modes.map(([mode, label]) =>
        h(
          "button",
          { class: this.mode === mode ? "active" : "", onclick: () => ((this.mode = mode), this.update()) },
          label,
        ),
      ),
    );
  }

  private buildImport(): HTMLElement {
    const area = h("textarea", {
      rows: 6,
      spellcheck: false,
      placeholder: t("wishlist.pasteEdsyCoriolisExportHereSlef"),
    });
    const report = h("div.import-report");
    const run = (text: string, source: string) => {
      const loadout = extractLoadout(text);
      if (!loadout) {
        replace(report, h("p.error", null, icon("warn"), " " + t("wishlist.unrecognisedFormatEdsyShipExportSlef")));
        return;
      }
      const res = importLoadout(this.ctx.game, loadout);
      if (!res.items.length) {
        replace(report, h("p.error", null, icon("warn"), " " + t("wishlist.noEngineeredModuleFound", { source })));
        return;
      }
      this.ctx.store.setWishlist([...this.ctx.store.state.wishlist, ...res.items]);
      area.value = "";
      replace(
        report,
        h(
          "p",
          null,
          icon("check"),
          " " + t("wishlist.linesAdded", { count: res.items.length, source }),
          res.ship ? ` (${res.ship})` : "",
          ".",
        ),
        res.skipped.length ? h("p.sub", null, t("wishlist.notRecognised", { value: res.skipped.join(", ") })) : null,
      );
      toast(t("wishlist.buildImported", { count: res.items.length }));
    };
    const file = h("input", {
      type: "file",
      accept: ".json,.txt,application/json",
      onchange: async (e: Event) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) run(await f.text(), f.name);
        (e.target as HTMLInputElement).value = "";
      },
    });
    return h(
      "section.card.import",
      null,
      h("h3", null, t("wishlist.importBuild")),
      h("p.sub", null, t("wishlist.eachEngineeredModuleBecomesBlueprintG1")),
      area,
      h(
        "div.row",
        null,
        h("button.primary", { onclick: () => run(area.value, t("wishlist.pastedText")) }, t("wishlist.importText")),
        h("label.ghost.file-btn", null, t("wishlist.chooseFile"), file),
        h(
          "button.ghost",
          {
            title: t("wishlist.rebuildsEngineeringWishlistCurrentShipHandy"),
            onclick: () => {
              const l = this.ctx.store.state.cmdr.loadout;
              if (!l) return toast(t("wishlist.noShipReadFromJournalYet"));
              const modules = l.modules
                .filter((m) => m.engineering)
                .map((m) => ({
                  Slot: m.slot,
                  Item: m.item,
                  Engineering: {
                    BlueprintName: m.engineering!.blueprint,
                    Level: m.engineering!.level,
                    ExperimentalEffect: m.engineering!.experimental,
                  },
                }));
              run(
                JSON.stringify({
                  event: "Loadout",
                  Ship: l.ship,
                  ShipName: this.ctx.store.state.cmdr.ship?.name,
                  Modules: modules,
                }),
                t("wishlist.currentShip"),
              );
            },
          },
          t("wishlist.fromMyCurrentShip"),
        ),
      ),
      report,
    );
  }

  private renderToolbar() {
    const store = this.ctx.store;
    replace(
      this.toolbar,
      store.state.wishlist.length && store.state.settings.engineers.autoPick ? this.modeSwitch() : null,
      h(
        "button.ghost",
        { onclick: () => ((this.importOpen = !this.importOpen), this.update()) },
        icon("plus"),
        this.importOpen ? " " + t("wishlist.closeImport") : " " + t("wishlist.importEdsyCoriolis"),
      ),
      store.state.wishlist.length
        ? h(
            "button.ghost",
            {
              onclick: () => {
                if (confirmClear()) store.setWishlist([]);
              },
            },
            icon("close"),
            " " + t("wishlist.clear"),
          )
        : null,
    );
  }

  mount(root: HTMLElement) {
    this.root = root;
    this.update();
  }

  private patch(id: string, change: Partial<WishItem>) {
    const list = this.ctx.store.state.wishlist.map((w) => (w.id === id ? { ...w, ...change } : w));
    this.ctx.store.setWishlist(list);
  }

  // ---------------- engineer tour ----------------

  private tourCard(): HTMLElement | null {
    const ctx = this.ctx;
    const plan = planTour(ctx);
    const doneLines = plan.doneOnShip.length
      ? h(
          "div.tour-done",
          null,
          h("span.badge.muted", null, icon("check"), " " + t("wishlist.doneOnShip")),
          " ",
          h("span.sub", null, plan.doneOnShip.map((l) => lineLabel(ctx, l)).join(" · ")),
        )
      : null;
    if (!plan.stops.length) {
      if (!doneLines) return null;
      return h("section.card.tour", null, h("h3", null, t("wishlist.engineerTour")), doneLines);
    }
    const limit = ctx.store.state.settings.engineers.maxTourLy;
    const tooFar = plan.total > limit;
    const progress = tourProgress();
    const current = progress ? plan.stops.find((st) => st.pick.engineer.name === progress.engineer) : undefined;
    const stopRows = plan.stops.map((st, i) => this.stopRow(st, i, st === current ? progress!.arrived : undefined));
    const actions = current
      ? [
          h(
            "button.primary",
            { title: t("wishlist.passStopHelp"), onclick: () => passStop(ctx) },
            icon("play"),
            " " + t("wishlist.nextEngineer"),
          ),
          h("button.ghost", { onclick: () => stopTour(ctx) }, icon("close"), " " + t("wishlist.stopTour")),
        ]
      : h(
          "button.primary",
          {
            disabled: tooFar,
            title: t("wishlist.startTourHelp"),
            onclick: () => goToStop(ctx, plan.stops[0]),
          },
          icon("copy"),
          " " + t("wishlist.startTour"),
        );
    return h(
      "section.card.tour",
      null,
      h(
        "div.sync-head",
        null,
        h(
          "div",
          null,
          h("h3", null, t("wishlist.engineerTour")),
          h("p.sub", null, t("wishlist.tourStops", { count: plan.stops.length, fmtLy: fmtLy(plan.total) })),
        ),
        h("div.row", null, actions),
      ),
      tooFar
        ? h(
            "p.notice.danger",
            null,
            icon("warn"),
            " " + t("wishlist.tourMoreThanLimitSettingsGame", { fmtLy: fmtLy(plan.total), fmtLy2: fmtLy(limit) }),
          )
        : null,
      h("p.sub", null, current ? t("wishlist.tourRunningHelp") : t("wishlist.tourHowItWorks")),
      h("ol.tour-stops", null, stopRows),
      doneLines,
    );
  }

  /** One stop of the tour; `arrived` is set for the current stop only. */
  private stopRow(st: Stop, index: number, arrived: boolean | undefined): HTMLElement {
    const ctx = this.ctx;
    const e = st.pick.engineer;
    const missing = Object.entries(st.missing);
    const isCurrent = arrived !== undefined;
    return h(
      "li.tour-stop",
      { class: `${missing.length ? "blocked" : ""}${isCurrent ? " current" : ""}` },
      h("span.tour-num", null, String(index + 1)),
      h(
        "div",
        null,
        h(
          "div",
          null,
          h(
            "button.inline-link.ref-link.eng-link",
            {
              title: t("wishlist.goToStop", { name: e.name, system: e.system }),
              "data-no-tr": "",
              onclick: () => goToStop(ctx, st),
            },
            e.name,
          ),
          st.pick.unlocked ? null : [" ", unlockBadge(e, Boolean(st.pick.status))],
          h("span.sub", null, ` · ${e.system} — ${e.station}`),
          st.leg !== undefined ? h("span.sub", null, ` · ${fmtLy(st.leg)}`) : null,
          isCurrent
            ? h(
                "span.badge.hit",
                null,
                arrived ? t("wishlist.stopArrived") : t("wishlist.stopOnTheWay", { system: e.system }),
              )
            : null,
        ),
        h("div.sub", null, st.lines.map((l) => lineLabel(ctx, l)).join(" · ")),
        missing.length
          ? h(
              "div.tour-missing",
              null,
              icon("warn"),
              " " + t("wishlist.missing") + " ",
              missing.flatMap(([id, n], i) => [
                i ? ", " : "",
                h("span", { "data-no-tr": "" }, `${fmt(n)} × `),
                h("span", null, ctx.game.nameOf(id)),
              ]),
            )
          : h("div.tour-ok", null, icon("check"), " " + t("wishlist.materialsOkStop")),
      ),
    );
  }

  update() {
    if (!this.root) return;
    const { game, store } = this.ctx;
    const items = store.state.wishlist;
    this.renderToolbar();
    const importer = this.importOpen ? this.importPanel : null;
    if (!items.length) {
      replace(
        this.root,
        h("header.view-head", null, h("h1", null, t("common.wishlist")), this.toolbar),
        this.importPanel,
        h(
          "div.empty-state",
          null,
          h("p", null, t("wishlist.wishlistEmpty")),
          h("p.sub", null, t("wishlist.importEdsyCoriolisBuildAboveAdd")),
          h("button.primary", { onclick: () => store.setView("engineering") }, t("wishlist.openEngineering")),
        ),
      );
      return;
    }

    const simple = this.mode === "simple" && store.state.settings.engineers.autoPick;
    // Lines the ship already has need no materials here.
    const toDo = items.filter((item) => !doneOnShip(this.ctx, item));
    const needs = toDo.length === items.length ? reserved(this.ctx) : totalNeeds(game, toDo);
    const rows = Object.entries(needs)
      .map(([id, need]) => ({ id, need, owned: ownedOf(this.ctx, id), m: game.material(id) }))
      .sort(
        (a, b) =>
          Number(a.owned >= a.need) - Number(b.owned >= b.need) ||
          (a.m?.category ?? "").localeCompare(b.m?.category ?? "") ||
          (b.m?.grade ?? 0) - (a.m?.grade ?? 0),
      );
    const done = rows.filter((r) => r.owned >= r.need).length;

    const entries = items.map((item) => {
      const grades = blueprintGrades(game, item.bp);
      const any = [...grades.values()][0];
      if (!any) {
        return h(
          "div.wish.card",
          null,
          h("p", null, t("wishlist.recipeNotFound", { bp: item.bp })),
          h(
            "button.ghost",
            { onclick: () => store.setWishlist(items.filter((w) => w.id !== item.id)) },
            t("common.remove"),
          ),
        );
      }
      const graded = any.kind === "modification" && grades.size > 1;
      const local = wishNeeds(game, item);
      const ready = Object.entries(local).every(([id, n]) => ownedOf(this.ctx, id) >= n);
      const gradeOptions = [...grades.keys()].sort();
      const autoPick = store.state.settings.engineers.autoPick;
      const onShip = doneOnShip(this.ctx, item);
      const chosen = autoPick && !onShip ? pickEngineer(this.ctx, item) : null;
      return h(
        "div.wish.card",
        { class: `${ready ? "ready" : ""}${chosen?.toMeet ? " no-engineer" : ""}${onShip ? " done-ship" : ""}` },
        h(
          "div.wish-head",
          null,
          h(
            "div",
            null,
            h("strong", null, moduleLink(any.module), ` — ${gameName(any.name)}`),
            h(
              "p.sub",
              null,
              item.note ? h("span.badge.muted", null, item.note) : null,
              item.note ? " " : "",
              kindFr(any.kind),
              !autoPick && any.engineers?.length ? [" · ", ...engineerLinks(any.engineers)] : "",
            ),
          ),
          onShip
            ? h("span.badge.muted", null, icon("check"), " " + t("wishlist.doneOnShip"))
            : ready
              ? h("span.badge.hit", null, icon("check"), " " + t("wishlist.ready"))
              : null,
          h(
            "button.icon-btn",
            { title: t("common.remove"), onclick: () => store.setWishlist(items.filter((w) => w.id !== item.id)) },
            icon("close"),
          ),
        ),
        chosen ? engineerRow(chosen.pick, chosen.toMeet, any.kind === "modification" ? item.gradeTo : 0) : null,
        h(
          "div.wish-controls",
          null,
          graded
            ? [
                h(
                  "label",
                  null,
                  t("wishlist.grades") + " ",
                  select(gradeOptions, item.gradeFrom, (v) =>
                    this.patch(item.id, { gradeFrom: v, gradeTo: Math.max(v, item.gradeTo) }),
                  ),
                  " → ",
                  select(gradeOptions, item.gradeTo, (v) =>
                    this.patch(item.id, { gradeTo: v, gradeFrom: Math.min(v, item.gradeFrom) }),
                  ),
                ),
                h(
                  "span.rolls",
                  null,
                  t("wishlist.rolls") + " ",
                  gradeOptions
                    .filter((g) => g >= item.gradeFrom && g <= item.gradeTo)
                    .map((g) =>
                      h(
                        "label.roll",
                        { title: t("wishlist.numberRollsGrade", { g }) },
                        `G${g}`,
                        h("input", {
                          type: "number",
                          min: "0",
                          max: "20",
                          value: String(item.rolls[g] ?? defaultRolls(g)),
                          onchange: (e: Event) =>
                            this.patch(item.id, {
                              rolls: {
                                ...item.rolls,
                                [g]: Math.max(0, Number((e.target as HTMLInputElement).value) || 0),
                              },
                            }),
                        }),
                      ),
                    ),
                ),
              ]
            : null,
          h(
            "label",
            null,
            t("wishlist.quantity") + " ",
            h("input", {
              type: "number",
              min: "1",
              max: "99",
              value: String(item.count),
              onchange: (e: Event) =>
                this.patch(item.id, { count: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }),
            }),
          ),
        ),
        h(
          "div.wish-mats",
          null,
          Object.entries(local).map(([id, n]) => {
            const have = ownedOf(this.ctx, id);
            return h(
              "button.mat-chip",
              { class: have >= n ? "ok" : "short", onclick: () => store.select(id) },
              game.nameOf(id),
              h("small", null, `${fmt(Math.min(have, n))}/${fmt(n)}`),
            );
          }),
        ),
      );
    });

    const shortRows = rows.map(({ id, need, owned, m }) => {
      const missing = Math.max(0, need - owned);
      let plan: HTMLElement | null = null;
      if (missing && m && m.ledger === "ship") {
        const best = suggestTrades(game, m, store.state.cmdr.materials, needs, missing)[0];
        if (best) plan = h("span.sub", null, `↹ ${fmt(best.pay)} ${gameName(best.from.name)} → ${fmt(best.receive)}`);
      }
      return h(
        "tr",
        { class: missing ? "short" : "ok", onclick: () => store.select(id) },
        h("td", null, m?.name ?? game.nameOf(id), m?.grade ? h("small.grade", null, ` G${m.grade}`) : null),
        h("td.num", null, fmt(need)),
        h("td.num", null, fmt(owned)),
        h("td.num", null, missing ? h("strong", null, fmt(missing)) : icon("check")),
        h(
          "td",
          null,
          h("div.bar.small", null, h("span", { style: { width: `${Math.min(100, (owned / need) * 100)}%` } })),
          plan,
        ),
      );
    });

    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h(
          "div",
          null,
          h("h1", null, t("common.wishlist")),
          h("p.sub", null, t("wishlist.recipesMaterialsComplete", { count: items.length, done, count2: rows.length })),
        ),
        this.toolbar,
      ),
      importer,
      store.state.settings.engineers.autoPick ? this.tourCard() : null,
      simple
        ? null
        : h(
            "div.wish-layout",
            null,
            h("div.wish-list", null, entries),
            h(
              "div.card.needs",
              null,
              h("h3", null, t("wishlist.materialsNeeded")),
              h(
                "table.table",
                null,
                h(
                  "thead",
                  null,
                  h(
                    "tr",
                    null,
                    h("th", null, t("wishlist.material")),
                    h("th.num", null, t("wishlist.needed")),
                    h("th.num", null, t("wishlist.owned")),
                    h("th.num", null, t("wishlist.missing2")),
                    h("th", null, t("wishlist.progressTrade")),
                  ),
                ),
                h("tbody", null, shortRows),
              ),
            ),
          ),
    );
  }
}
