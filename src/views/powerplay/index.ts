// Powerplay page: the commander's merits (this week, recent) and the Powerplay state of the
// current system.

import { meritsSince, meritsThisWeek, weekStart } from "../../game/activity/powerplay.js";
import { fmt, h, replace } from "../../ui/dom.js";
import { locale, t } from "../../platform/i18n.js";
import { duration } from "../../ui/format.js";
import type { Ctx, View } from "../../state/context.js";

export class PowerplayView implements View {
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
    const st = this.ctx.store.state;
    const pp = st.activity.powerplay;
    const loc = st.cmdr.location;
    const now = new Date();
    const week = weekStart(now);
    const nextWeek = new Date(week.getTime() + 7 * 86400000);
    const session = st.activity.session.start ? meritsSince(pp, new Date(st.activity.session.start)) : 0;
    // Last 7 days, one bar per day.
    const days = [...Array(7)].map((_, i) => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - i)));
      const end = new Date(start.getTime() + 86400000);
      return {
        start,
        merits: pp.gains
          .filter((g) => new Date(g.at) >= start && new Date(g.at) < end)
          .reduce((s, g) => s + g.merits, 0),
      };
    });
    const max = Math.max(1, ...days.map((d) => d.merits));
    const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: "short" });

    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h(
          "div",
          null,
          h("h1", null, t("common.powerplay")),
          h("p.sub", null, t("powerplay.meritsPowerplayStateSystemRe")),
        ),
      ),
      pp.power
        ? h(
            "section.card",
            null,
            h("h3", { "data-no-tr": "" }, pp.power),
            h(
              "div.stats",
              null,
              pp.rank !== undefined
                ? h("div.stat", null, h("strong", null, fmt(pp.rank)), h("span.sub", null, t("powerplay.rank")))
                : null,
              pp.merits !== undefined
                ? h(
                    "div.stat",
                    null,
                    h("strong", null, fmt(pp.merits)),
                    h("span.sub", null, t("powerplay.totalMerits")),
                  )
                : null,
              h(
                "div.stat",
                null,
                h("strong", null, fmt(meritsThisWeek(pp, now))),
                h("span.sub", null, t("powerplay.meritsWeek")),
              ),
              h("div.stat", null, h("strong", null, fmt(session)), h("span.sub", null, t("powerplay.meritsSession"))),
              pp.timePledged
                ? h(
                    "div.stat",
                    null,
                    h("strong", null, duration(pp.timePledged * 1000)),
                    h("span.sub", null, t("powerplay.pledged")),
                  )
                : null,
            ),
            h(
              "div.day-bars",
              null,
              days.map((d) =>
                h(
                  "div.day-bar",
                  { title: fmt(d.merits) },
                  h("span", { style: { height: `${(d.merits / max) * 100}%` } }),
                  h("small", null, dayFmt.format(d.start)),
                  h("small.sub", null, d.merits ? fmt(d.merits) : ""),
                ),
              ),
            ),
            h(
              "p.sub",
              null,
              t("powerplay.newCycle", {
                nextWeek: new Intl.DateTimeFormat(locale(), {
                  weekday: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(nextWeek),
              }),
            ),
          )
        : h("section.card", null, h("p.empty", null, t("powerplay.reNotPledgedAnyPowerGame"))),
      loc
        ? h(
            "section.card",
            null,
            h("h3", null, t("powerplay.currentSystem", { system: loc.system })),
            loc.controllingPower
              ? h(
                  "div.stats",
                  null,
                  h(
                    "div.stat",
                    null,
                    h("strong", { "data-no-tr": "" }, loc.controllingPower),
                    h("span.sub", null, t("powerplay.controllingPower")),
                  ),
                  loc.powerState
                    ? h("div.stat", null, h("strong", null, loc.powerState), h("span.sub", null, t("powerplay.state")))
                    : null,
                  loc.controlProgress !== undefined
                    ? h(
                        "div.stat",
                        null,
                        h(
                          "strong",
                          null,
                          `${(loc.controlProgress * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })} %`,
                        ),
                        h("span.sub", null, t("powerplay.controlProgress")),
                      )
                    : null,
                  loc.reinforcement !== undefined
                    ? h(
                        "div.stat",
                        null,
                        h("strong", null, fmt(loc.reinforcement)),
                        h("span.sub", null, t("powerplay.reinforcement")),
                      )
                    : null,
                  loc.undermining !== undefined
                    ? h(
                        "div.stat",
                        null,
                        h("strong", null, fmt(loc.undermining)),
                        h("span.sub", null, t("powerplay.undermining")),
                      )
                    : null,
                )
              : h("p.sub", null, loc.powerState ? loc.powerState : t("powerplay.noPowerControlsSystem")),
            loc.powers?.length
              ? h(
                  "p.sub",
                  null,
                  t("powerplay.powersPresent") + " ",
                  h("span", { "data-no-tr": "" }, loc.powers.join(", ")),
                )
              : null,
            pp.power && loc.controllingPower
              ? loc.controllingPower === pp.power
                ? h("p.ok", null, t("powerplay.powerSSystemReinforceTradeMining"))
                : h("p.sub", null, t("powerplay.anotherPowerSSystemCanUndermine"))
              : null,
          )
        : null,
    );
  }
}
