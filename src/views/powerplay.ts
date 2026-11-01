import { meritsSince, meritsThisWeek, weekStart } from "../activity.js";
import { fmt, h, replace } from "../dom.js";
import { locale } from "../i18n.js";
import { duration } from "../time.js";
import type { Ctx, View } from "../context.js";

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
      return { start, merits: pp.gains.filter((g) => new Date(g.at) >= start && new Date(g.at) < end).reduce((s, g) => s + g.merits, 0) };
    });
    const max = Math.max(1, ...days.map((d) => d.merits));
    const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: "short" });

    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, "Powerplay"), h("p.sub", null, "Tes mérites et l'état Powerplay du système où tu es."))),
      pp.power
        ? h(
            "section.card",
            null,
            h("h3", { "data-no-tr": "" }, pp.power),
            h(
              "div.stats",
              null,
              pp.rank !== undefined ? h("div.stat", null, h("strong", null, fmt(pp.rank)), h("span.sub", null, "rang")) : null,
              pp.merits !== undefined ? h("div.stat", null, h("strong", null, fmt(pp.merits)), h("span.sub", null, "mérites au total")) : null,
              h("div.stat", null, h("strong", null, fmt(meritsThisWeek(pp, now))), h("span.sub", null, "mérites cette semaine")),
              h("div.stat", null, h("strong", null, fmt(session)), h("span.sub", null, "mérites cette session")),
              pp.timePledged ? h("div.stat", null, h("strong", null, duration(pp.timePledged * 1000)), h("span.sub", null, "d'engagement")) : null,
            ),
            h(
              "div.day-bars",
              null,
              days.map((d) => h("div.day-bar", { title: fmt(d.merits) }, h("span", { style: { height: `${(d.merits / max) * 100}%` } }), h("small", null, dayFmt.format(d.start)), h("small.sub", null, d.merits ? fmt(d.merits) : ""))),
            ),
            h("p.sub", null, `Nouveau cycle ${new Intl.DateTimeFormat(locale(), { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(nextWeek)}.`),
          )
        : h("section.card", null, h("p.empty", null, "Tu n'es engagé auprès d'aucune puissance (ou le jeu ne l'a pas encore écrit dans le journal). Engage-toi en jeu, puis reconnecte-toi.")),
      loc
        ? h(
            "section.card",
            null,
            h("h3", null, `Système actuel : ${loc.system}`),
            loc.controllingPower
              ? h(
                  "div.stats",
                  null,
                  h("div.stat", null, h("strong", { "data-no-tr": "" }, loc.controllingPower), h("span.sub", null, "puissance qui contrôle")),
                  loc.powerState ? h("div.stat", null, h("strong", null, loc.powerState), h("span.sub", null, "état")) : null,
                  loc.controlProgress !== undefined ? h("div.stat", null, h("strong", null, `${(loc.controlProgress * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })} %`), h("span.sub", null, "progression du contrôle")) : null,
                  loc.reinforcement !== undefined ? h("div.stat", null, h("strong", null, fmt(loc.reinforcement)), h("span.sub", null, "renforcement")) : null,
                  loc.undermining !== undefined ? h("div.stat", null, h("strong", null, fmt(loc.undermining)), h("span.sub", null, "sape")) : null,
                )
              : h("p.sub", null, loc.powerState ? loc.powerState : "Aucune puissance ne contrôle ce système."),
            loc.powers?.length ? h("p.sub", null, "Puissances présentes : ", h("span", { "data-no-tr": "" }, loc.powers.join(", "))) : null,
            pp.power && loc.controllingPower
              ? loc.controllingPower === pp.power
                ? h("p.ok", null, "Système de ta puissance : renforce-le (commerce, minage, missions, combat) pour gagner des mérites.")
                : h("p.sub", null, "Système d'une autre puissance : tu peux le saper pour gagner des mérites.")
              : null,
          )
        : null,
    );
  }
}
