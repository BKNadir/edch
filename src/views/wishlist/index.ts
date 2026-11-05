import { gameName, t } from "../../platform/i18n.js";
import { h, icon, fmt, replace, toast } from "../../ui/dom.js";
import { ownedOf, reserved, type Ctx, type View } from "../../state/context.js";
import { blueprintGrades, bpKey, defaultRolls, wishNeeds, type WishItem } from "../../state/store.js";
import { suggestTrades } from "../../features/materials/trade.js";
import type { Blueprint } from "../../game/types.js";
import { kindFr } from "../detail/index.js";
import { extractLoadout, importLoadout } from "../../features/materials/buildImporter.js";
import { engineerLinks, moduleLink, openSystem } from "../shared/links.js";
import { pickEngineer, type Pick } from "../../features/engineers/engineerPick.js";
import {
  clearRoute,
  currentRoute,
  nextJump,
  planTour,
  plotTour,
  tourRange,
  type TourPlan,
} from "../../features/engineers/tour.js";
import { fmtLy } from "../../services/spansh.js";
import { copyText } from "../../platform/bridge.js";
import { superchargeMultiplier } from "../../features/navigation/jumpRange.js";
import type { Engineer } from "../../game/types.js";

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

  constructor(private ctx: Ctx) {
    this.importPanel = this.buildImport();
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

  private tourOut = h("div.tour-out");
  private plotting = false;

  private tourCard(): HTMLElement | null {
    const ctx = this.ctx;
    const plan = planTour(ctx);
    if (!plan.stops.length) return null;
    const s = ctx.store.state.settings.engineers;
    const tooFar = plan.total > s.maxTourLy;
    const range = tourRange(ctx);
    const here = ctx.store.state.cmdr.location?.system;
    const stopRows = plan.stops.map((st, i) => {
      const e = st.pick.engineer;
      const missing = Object.entries(st.missing);
      return h(
        "li.tour-stop",
        { class: missing.length ? "blocked" : "" },
        h("span.tour-num", null, String(i + 1)),
        h(
          "div",
          null,
          h(
            "div",
            null,
            engineerButton(e),
            st.pick.unlocked ? null : unlockBadge(e, Boolean(st.pick.status)),
            h("span.sub", null, ` · ${e.system} — ${e.station}`),
            st.leg !== undefined ? h("span.sub", null, ` · ${fmtLy(st.leg)}`) : null,
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
    });
    const plotBtn = h(
      "button.primary",
      {
        disabled: tooFar || this.plotting || !here || !range,
        title: !range ? t("wishlist.jumpRangeUnknownStartGameSo") : !here ? t("common.unknownLocation") : "",
        onclick: () => this.plot(plan, here!, range),
      },
      icon("search"),
      " " + t("wishlist.plotRouteRange", { value: range ? fmtLy(range) : "?" }),
    );
    if (!this.plotting) this.renderRoute(here);
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
        plotBtn,
      ),
      tooFar
        ? h(
            "p.notice.danger",
            null,
            icon("warn"),
            " " + t("wishlist.tourMoreThanLimitSettingsGame", { fmtLy: fmtLy(plan.total), fmtLy2: fmtLy(s.maxTourLy) }),
          )
        : null,
      h("ol.tour-stops", null, stopRows),
      this.tourOut,
    );
  }

  private async plot(plan: TourPlan, from: string, range: number) {
    // A second click while Spansh is still working would plot the whole tour twice.
    if (this.plotting) return;
    this.plotting = true;
    this.update(); // the button shows as disabled
    replace(this.tourOut, h("p.sub", null, h("span.spinner"), " " + t("common.spanshPlottingRoute")));
    try {
      await plotTour(
        from,
        plan.stops,
        range,
        (leg, of) =>
          replace(
            this.tourOut,
            h("p.sub", null, h("span.spinner"), " " + t("wishlist.spanshPlottingLeg", { leg, of })),
          ),
        superchargeMultiplier(this.ctx.store.state.cmdr.loadout?.fsd),
      );
      this.plotting = false;
      this.update();
    } catch (e) {
      this.plotting = false;
      this.update();
      replace(this.tourOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private renderRoute(here?: string) {
    const r = currentRoute();
    if (!r) return replace(this.tourOut);
    const auto = this.ctx.store.state.settings.engineers.autoCopyNext;
    const at = here ? nextJump(here).index : -1;
    const next = at >= 0 ? r.jumps[at + 1] : undefined;
    replace(
      this.tourOut,
      h(
        "div.row.tour-head",
        null,
        h("strong", null, t("wishlist.jumps", { totalJumps: fmt(r.totalJumps), fmtLy: fmtLy(r.distance) })),
        next
          ? h(
              "button.ghost.small",
              {
                onclick: () =>
                  copyText(next.system).then((ok) => ok && toast(t("common.nextJumpCopied", { next: next.system }))),
              },
              icon("copy"),
              " " + t("wishlist.copyNextJump", { system: next.system }),
            )
          : null,
        h("span.sub", null, auto ? t("wishlist.autoCopyNextJump") : t("wishlist.autoCopyNextJumpOffSettings")),
        h(
          "button.ghost.small",
          { onclick: () => (clearRoute(), this.update()) },
          icon("close"),
          " " + t("wishlist.clearRoute"),
        ),
      ),
      h(
        "ol.tour-route",
        null,
        r.jumps.map((j, i) =>
          h(
            "li",
            { class: `${j.engineer ? "stop" : ""}${i === at ? " here" : ""}` },
            h(
              "button.sys",
              { title: t("common.copy", { name: j.system }), onclick: () => openSystem(j.system, { navigate: false }) },
              icon("copy"),
              h("span", null, j.system),
            ),
            j.engineer ? h("span.badge.hit", { "data-no-tr": "" }, j.engineer) : null,
            j.neutron ? h("span.badge", null, "Neutron") : null,
            i === at ? h("span.badge.muted", null, t("common.areHere")) : null,
          ),
        ),
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

    const needs = reserved(this.ctx);
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
      const chosen = autoPick ? pickEngineer(this.ctx, item) : null;
      return h(
        "div.wish.card",
        { class: `${ready ? "ready" : ""}${chosen?.toMeet ? " no-engineer" : ""}` },
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
          ready ? h("span.badge.hit", null, icon("check"), " " + t("wishlist.ready")) : null,
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
      h(
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

// A single "are you sure" without a blocking browser dialog: second click within 3 s confirms.
let clearArmed = 0;
function confirmClear(): boolean {
  if (Date.now() - clearArmed < 3000) return true;
  clearArmed = Date.now();
  toast(t("wishlist.clickClearAgainConfirm"));
  return false;
}

function select(options: number[], value: number, onChange: (v: number) => void): HTMLSelectElement {
  return h(
    "select",
    { onchange: (e: Event) => onChange(Number((e.target as HTMLSelectElement).value)) },
    options.map((o) => h("option", { value: String(o), selected: o === value }, `G${o}`)),
  );
}

/** An engineer's name: copies the system of the workshop. */
function engineerButton(e: Engineer): HTMLElement {
  return h(
    "button.inline-link.ref-link.eng-link",
    {
      title: t("common.copySSystem", { name: e.name, system: e.system }),
      "data-no-tr": "",
      onclick: () => openSystem(e.system),
    },
    e.name,
  );
}

/** "To unlock" (or "to meet"): a click shows what the game asks for. */
function unlockBadge(e: Engineer, known: boolean): HTMLElement {
  const how = known ? e.unlock || e.meeting : e.meeting || e.discovery;
  return h(
    "details.unlock-badge",
    null,
    h("summary.badge.warn", null, known ? t("wishlist.unlock") : t("wishlist.meet")),
    h(
      "div.unlock-how",
      null,
      e.referredBy ? h("p", null, t("common.referredBy", { name: e.referredBy })) : null,
      how ? h("p", null, how) : h("p", null, t("wishlist.seeEngineersPage")),
    ),
  );
}

/** The engineer chosen for a wishlist line, or the red notice when nobody you know can do it. */
function engineerRow(pick: Pick | undefined, toMeet: Pick | undefined, want: number): HTMLElement {
  if (pick) {
    const e = pick.engineer;
    return h(
      "div.wish-eng",
      null,
      icon("pin"),
      " ",
      engineerButton(e),
      want ? h("span.badge.muted", { title: t("wishlist.highestGradeEngineerCanDo") }, `G${pick.grade}`) : null,
      want && pick.grade < want ? h("span.sub", null, " " + t("wishlist.gNoKnownEngineerDoesAround", { want })) : null,
      h("span.sub", null, ` · ${e.system} — ${e.station}`, pick.dist !== undefined ? ` · ${fmtLy(pick.dist)}` : ""),
      pick.unlocked ? null : unlockBadge(e, Boolean(pick.status)),
    );
  }
  const e = toMeet?.engineer;
  return h(
    "div.wish-eng.alert",
    null,
    icon("warn"),
    " " + t("wishlist.noKnownEngineerModuleUnlock"),
    e
      ? [
          h("span.sub", null, " " + t("wishlist.nearest") + " "),
          engineerButton(e),
          h("span.sub", null, ` · ${e.system}${toMeet!.dist !== undefined ? ` · ${fmtLy(toMeet!.dist)}` : ""}`),
          unlockBadge(e, false),
        ]
      : null,
  );
}

function lineLabel(ctx: Ctx, item: WishItem): string {
  const [kind, module, name] = item.bp.split("|");
  return kind === "modification"
    ? `${gameName(module)} — ${gameName(name)} G${item.gradeTo}`
    : `${gameName(module)} — ${gameName(name)}`;
}
