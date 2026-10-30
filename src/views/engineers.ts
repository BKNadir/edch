import { h, icon, replace } from "../dom.js";
import { referenceOf, type Ctx, type View } from "../context.js";
import { distance, fmtLy } from "../spansh.js";
import { copySystem } from "./results.js";

const PROGRESS_FR: Record<string, string> = {
  Unlocked: "Débloqué",
  Invited: "Invité",
  Acquainted: "Connu",
  Known: "Connu",
  Barred: "Interdit",
};

export class EngineersView implements View {
  private root?: HTMLElement;
  private mode: "ship" | "foot" = "ship";
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.update();
  }

  update() {
    if (!this.root) return;
    const { game, store } = this.ctx;
    const ref = referenceOf(this.ctx);
    const status = store.state.cmdr.engineers;
    const list = game.data.engineers
      .filter((e) => (this.mode === "foot") === e.odyssey)
      .map((e) => ({ e, d: distance(ref.coords, e.pos), st: status[e.name] }))
      .sort((a, b) => Number(b.st?.progress === "Unlocked") - Number(a.st?.progress === "Unlocked") || (a.d ?? 0) - (b.d ?? 0));

    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h("h1", null, "Ingénieurs"),
        h(
          "div.segmented",
          null,
          h("button", { class: this.mode === "ship" ? "active" : "", onclick: () => ((this.mode = "ship"), this.update()) }, "Vaisseau"),
          h("button", { class: this.mode === "foot" ? "active" : "", onclick: () => ((this.mode = "foot"), this.update()) }, "À pied (Odyssey)"),
        ),
      ),
      h(
        "div.eng-grid",
        null,
        list.map(({ e, d, st }) =>
          h(
            "article.eng.card",
            { class: st?.progress === "Unlocked" ? "unlocked" : "" },
            h(
              "div.eng-head",
              null,
              h("div", null, h("h3", null, e.name), h("p.sub", null, e.station)),
              st ? h(`span.badge${st.progress === "Unlocked" ? ".hit" : ""}`, null, PROGRESS_FR[st.progress] ?? st.progress, st.rank ? ` · rang ${st.rank}` : "") : h("span.badge.muted", null, "Inconnu"),
            ),
            h(
              "div.result-main",
              null,
              h("button.sys", { title: `Copier « ${e.system} »`, onclick: () => copySystem(e.system) }, icon("copy"), h("span", null, e.system)),
              h("span.dist", null, fmtLy(d)),
            ),
            h(
              "div.specs",
              null,
              e.specialities.map((s) => h("span.spec", null, s.name, s.grade ? h("small", null, ` G${s.grade}`) : null)),
            ),
            st?.progress !== "Unlocked"
              ? h(
                  "details.eng-unlock",
                  null,
                  h("summary", null, "Comment le débloquer"),
                  e.discovery ? h("p", null, h("strong", null, "Découverte : "), e.discovery) : null,
                  e.meeting ? h("p", null, h("strong", null, "Rencontre : "), e.meeting) : null,
                  e.unlock ? h("p", null, h("strong", null, "Déblocage : "), e.unlock) : null,
                )
              : null,
          ),
        ),
      ),
    );
  }
}
