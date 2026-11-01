import { fmt, h, replace } from "../dom.js";
import { credits, duration, relTime } from "../time.js";
import type { Ctx, View } from "../context.js";

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
      ["Primes", s.bounties],
      ["Obligations de combat", s.bonds],
      ["Commerce (bénéfice)", s.trade],
      ["Exploration", s.exploration],
      ["Exobiologie", s.exobiology],
      ["Missions", s.missions],
    ];
    const total = earned.reduce((t, [, v]) => t + v, 0);
    const max = Math.max(1, ...earned.map(([, v]) => Math.abs(v)));
    const elapsed = s.start ? Date.now() - Date.parse(s.start) : 0;
    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h("div", null, h("h1", null, "Bilan de session"), h("p.sub", null, s.start ? `Depuis le lancement du jeu, ${relTime(s.start)} (${duration(elapsed)})` : "Lance Elite Dangerous : le bilan démarre à la connexion.")),
      ),
      h(
        "section.card",
        null,
        h("div.sync-head", null, h("h3", null, "Crédits gagnés"), h("strong.big-number", null, `${credits(total)} Cr`)),
        h(
          "div.earn-bars",
          null,
          earned.map(([label, v]) =>
            h("div.earn-row", null, h("span", null, label), h("div.bar", null, h("span", { style: { width: `${(Math.abs(v) / max) * 100}%` } })), h("strong", null, `${credits(v)} Cr`)),
          ),
        ),
        elapsed > 10 * 60000 && total > 0 ? h("p.sub", null, `≈ ${credits((total / elapsed) * 3600000)} Cr par heure`) : null,
      ),
      h(
        "section.card",
        null,
        h("h3", null, "Activité"),
        h(
          "div.stats",
          null,
          h("div.stat", null, h("strong", null, fmt(s.jumps)), h("span.sub", null, "sauts")),
          h("div.stat", null, h("strong", null, fmt(Math.round(s.distance))), h("span.sub", null, "al parcourues")),
          h("div.stat", null, h("strong", null, fmt(s.missionsDone)), h("span.sub", null, "missions terminées")),
          h("div.stat", null, h("strong", null, fmt(s.kills)), h("span.sub", null, "éliminations")),
          h("div.stat", null, h("strong", null, fmt(s.materials)), h("span.sub", null, "matériaux ramassés")),
          h("div.stat", null, h("strong", null, fmt(s.refined)), h("span.sub", null, "t minées")),
          s.deaths ? h("div.stat.bad", null, h("strong", null, fmt(s.deaths)), h("span.sub", null, "destructions")) : null,
        ),
      ),
    );
  }
}
