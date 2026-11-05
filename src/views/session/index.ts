// Session page: what the current game session earned (bounties, trade, exploration…) and did.

import { fmt, h, replace } from "../../ui/dom.js";
import { credits, duration, relTime } from "../../ui/format.js";
import type { Ctx, View } from "../../state/context.js";
import { t } from "../../platform/i18n.js";

export class SessionView implements View {
  private root?: HTMLElement;
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    this.render();
  }

  private render() {
    if (!this.root) return;
    const s = this.ctx.store.state.activity.session;
    const earned: [string, number][] = [
      [t("session.bounties"), s.bounties],
      [t("session.combatBonds"), s.bonds],
      [t("session.tradeProfit"), s.trade],
      [t("common.exploration"), s.exploration],
      [t("common.exobiology"), s.exobiology],
      [t("common.missions"), s.missions],
    ];
    const total = earned.reduce((sum, [, v]) => sum + v, 0);
    const max = Math.max(1, ...earned.map(([, v]) => Math.abs(v)));
    const elapsed = s.start ? Date.now() - Date.parse(s.start) : 0;
    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h(
          "div",
          null,
          h("h1", null, t("session.sessionSummary")),
          h(
            "p.sub",
            null,
            s.start
              ? t("session.sinceGameStarted", { relTime: relTime(s.start), duration: duration(elapsed) })
              : t("session.startEliteDangerousSummaryBeginsWhen"),
          ),
        ),
      ),
      h(
        "section.card",
        null,
        h(
          "div.sync-head",
          null,
          h("h3", null, t("session.creditsEarned")),
          h("strong.big-number", null, `${credits(total)} Cr`),
        ),
        h(
          "div.earn-bars",
          null,
          earned.map(([label, v]) =>
            h(
              "div.earn-row",
              null,
              h("span", null, label),
              h("div.bar", null, h("span", { style: { width: `${(Math.abs(v) / max) * 100}%` } })),
              h("strong", null, `${credits(v)} Cr`),
            ),
          ),
        ),
        elapsed > 10 * 60000 && total > 0
          ? h("p.sub", null, t("session.crPerHour", { value: credits((total / elapsed) * 3600000) }))
          : null,
      ),
      h(
        "section.card",
        null,
        h("h3", null, t("common.activity")),
        h(
          "div.stats",
          null,
          h("div.stat", null, h("strong", null, fmt(s.jumps)), h("span.sub", null, t("session.jumps"))),
          h(
            "div.stat",
            null,
            h("strong", null, fmt(Math.round(s.distance))),
            h("span.sub", null, t("session.lyTravelled")),
          ),
          h(
            "div.stat",
            null,
            h("strong", null, fmt(s.missionsDone)),
            h("span.sub", null, t("session.missionsCompleted")),
          ),
          h("div.stat", null, h("strong", null, fmt(s.kills)), h("span.sub", null, t("session.kills"))),
          h(
            "div.stat",
            null,
            h("strong", null, fmt(s.materials)),
            h("span.sub", null, t("session.materialsCollected")),
          ),
          h("div.stat", null, h("strong", null, fmt(s.refined)), h("span.sub", null, t("session.tMined"))),
          s.deaths
            ? h("div.stat.bad", null, h("strong", null, fmt(s.deaths)), h("span.sub", null, t("session.deaths")))
            : null,
        ),
      ),
    );
  }
}
