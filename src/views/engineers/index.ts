// Engineers page: every engineer with their rank, unlock progress, specialities and distance, and
// what it takes to unlock the ones not known yet.

import { h, icon, fmt, replace } from "../../ui/dom.js";
import { referenceOf, type Ctx, type View } from "../../state/context.js";
import { distance, fmtLy, inaraSystem } from "../../services/spansh.js";
import { openUrl } from "../../platform/bridge.js";
import { engineerText } from "../../game/data.js";
import type { Engineer } from "../../game/types.js";
import type { EngineerStatus } from "../../game/journal/state.js";
import { moduleLink, openSystem } from "../shared/links.js";
import { t } from "../../platform/i18n.js";

const PROGRESS_LABELS: Record<string, string> = {
  Unlocked: t("engineers.unlocked"),
  Invited: t("engineers.invited"),
  Acquainted: t("engineers.acquainted"),
  Known: t("engineers.known"),
  Barred: t("engineers.barred"),
};

type Filter = "all" | "unlocked" | "todo";

interface Check {
  label: string;
  /** undefined when the journal can't tell (reputation, statistics…). */
  have?: number;
  need?: number;
}

/** Turns "locker factionassociates 10" / "contribution Commodity bromellite 50" into a checkable line. */
function checkOf(ctx: Ctx, test: string, text: string): Check | null {
  if (!test && !text) return null;
  const parts = test.split(/\s+/);
  const cmdr = ctx.store.state.cmdr;
  if (parts[0] === "locker" && parts.length >= 3) {
    return { label: text, have: cmdr.locker[parts[1].toLowerCase()] ?? 0, need: Number(parts[2]) };
  }
  if (parts[0] === "contribution" && parts.length >= 4) {
    const sym = parts[2].toLowerCase();
    const have = parts[1] === "Commodity" ? (cmdr.cargo[sym] ?? 0) : (cmdr.materials[sym] ?? cmdr.locker[sym] ?? 0);
    return { label: text, have, need: Number(parts[3]) };
  }
  return { label: text };
}

export class EngineersView implements View {
  private root?: HTMLElement;
  private mode: "ship" | "foot" = "ship";
  private filter: Filter = "all";
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.update();
  }

  private statusOf(e: Engineer): EngineerStatus | undefined {
    return this.ctx.store.state.cmdr.engineers[e.name];
  }

  update() {
    if (!this.root) return;
    const { game } = this.ctx;
    const ref = referenceOf(this.ctx);
    const all = game.data.engineers.filter((e) => (this.mode === "foot") === e.odyssey);
    const unlockedCount = all.filter((e) => this.statusOf(e)?.progress === "Unlocked").length;
    const list = all
      .map((e) => ({ e, d: distance(ref.coords, e.pos), st: this.statusOf(e) }))
      .filter(({ st }) => this.filter === "all" || (this.filter === "unlocked") === (st?.progress === "Unlocked"))
      .sort(
        (a, b) =>
          Number(b.st?.progress === "Unlocked") - Number(a.st?.progress === "Unlocked") || (a.d ?? 0) - (b.d ?? 0),
      );

    const seg = <T extends string>(value: T, options: [T, string][], set: (v: T) => void) =>
      h(
        "div.segmented",
        null,
        options.map(([v, l]) =>
          h("button", { class: value === v ? "active" : "", onclick: () => (set(v), this.update()) }, l),
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
          h("h1", null, t("common.engineers")),
          h(
            "p.sub",
            null,
            t("engineers.unlockedStatusReadFromJournalEngineerprogress", {
              unlockedCount,
              count: all.length,
              label: ref.label,
            }),
          ),
        ),
        h(
          "div.toolbar",
          null,
          seg(
            this.mode,
            [
              ["ship", t("common.ship")],
              ["foot", t("engineers.footOdyssey")],
            ],
            (v) => (this.mode = v),
          ),
          seg(
            this.filter,
            [
              ["all", t("common.all")],
              ["unlocked", t("engineers.unlocked2")],
              ["todo", t("engineers.unlock")],
            ],
            (v) => (this.filter = v),
          ),
        ),
      ),
      Object.keys(this.ctx.store.state.cmdr.engineers).length
        ? null
        : h("div.notice", null, icon("warn"), " " + t("engineers.statusesUnknownTheyComeEngineerprogressEvent")),
      h(
        "div.eng-grid",
        null,
        list.map(({ e, d, st }) => this.card(e, d, st)),
      ),
    );
  }

  private card(e: Engineer, d: number | undefined, st: EngineerStatus | undefined): HTMLElement {
    const unlocked = st?.progress === "Unlocked";
    const referrer = e.referredBy ? this.ctx.game.data.engineers.find((x) => x.name === e.referredBy) : undefined;
    const refStatus = referrer ? this.statusOf(referrer) : undefined;
    const checks = [
      checkOf(this.ctx, e.meetingTest, engineerText(e, "meeting")),
      checkOf(this.ctx, e.unlockTest, engineerText(e, "unlock")),
    ].filter(Boolean) as Check[];
    const rank = st?.rank ?? 0;

    return h(
      "article.eng.card",
      { class: unlocked ? "unlocked" : st ? "known" : "" },
      h(
        "div.eng-head",
        null,
        h(
          "div",
          null,
          h(
            "h3",
            null,
            h(
              "button.eng-name",
              {
                title: t("common.copySSystem", { name: e.name, system: e.system }),
                "data-no-tr": "",
                onclick: () => openSystem(e.system),
              },
              e.name,
            ),
          ),
          h("p.sub", null, e.body ? t("engineers.stationBody", { station: e.station, body: e.body }) : e.station),
        ),
        st
          ? h(`span.badge${unlocked ? ".hit" : ""}`, null, PROGRESS_LABELS[st.progress] ?? st.progress)
          : h("span.badge.muted", null, t("engineers.notMetYet")),
      ),
      h(
        "div.result-main",
        null,
        h(
          "button.sys",
          { title: t("common.copy", { name: e.system }), onclick: () => openSystem(e.system) },
          icon("copy"),
          h("span", null, e.system),
        ),
        h("span.dist", null, fmtLy(d)),
        h(
          "button.link",
          { title: t("engineers.viewSystemInara"), onclick: () => openUrl(inaraSystem(e.system)) },
          "Inara",
          icon("link"),
        ),
      ),
      unlocked && !e.odyssey
        ? h(
            "div.rank",
            null,
            h(
              "div.rank-pips",
              null,
              [1, 2, 3, 4, 5].map((n) => h("span", { class: n <= rank ? "on" : "" })),
            ),
            h(
              "span.sub",
              null,
              rank >= 5
                ? t("engineers.maxRank")
                : st?.rankProgress !== undefined
                  ? t("engineers.rankProgress", { rank, progress: st.rankProgress, next: rank + 1 })
                  : t("engineers.rankNumber", { rank }),
            ),
          )
        : null,
      h(
        "div.specs",
        null,
        e.specialities.map((s) =>
          h("span.spec", null, moduleLink(s.name, s.name), s.grade ? h("small", null, ` G${s.grade}`) : null),
        ),
      ),
      !unlocked
        ? h(
            "div.unlock",
            null,
            referrer
              ? h(
                  "p.check-line",
                  {
                    class:
                      refStatus?.progress === "Unlocked" && (refStatus.rank ?? 0) >= (e.referralGrade ?? 0) ? "ok" : "",
                  },
                  refStatus?.progress === "Unlocked" && (refStatus.rank ?? 0) >= (e.referralGrade ?? 0)
                    ? icon("check")
                    : h("span.dot"),
                  " " + t("common.referredBy", { name: referrer.name }),
                  e.referralGrade ? " " + t("engineers.rank", { referralGrade: e.referralGrade }) : "",
                )
              : e.discovery
                ? h("p.check-line", null, h("span.dot"), ` ${engineerText(e, "discovery")}`)
                : null,
            checks.map((c) => {
              const done = c.need !== undefined && (c.have ?? 0) >= c.need;
              return h(
                "p.check-line",
                { class: done ? "ok" : "" },
                done ? icon("check") : h("span.dot"),
                ` ${c.label}`,
                c.need !== undefined
                  ? h("small.sub", null, ` (${fmt(Math.min(c.have ?? 0, c.need))}/${fmt(c.need)})`)
                  : null,
              );
            }),
          )
        : null,
    );
  }
}
