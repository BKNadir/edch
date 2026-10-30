import { h, icon, fmt, replace } from "../dom.js";
import { ownedOf, type Ctx, type View } from "../context.js";
import type { Blueprint, BlueprintKind } from "../types.js";
import { kindFr } from "./detail.js";
import { addToWishlist } from "./wishlist.js";

const KINDS: { kind: BlueprintKind[]; label: string }[] = [
  { kind: ["modification"], label: "Modules" },
  { kind: ["experimental"], label: "Expérimentaux" },
  { kind: ["synthesis"], label: "Synthèse" },
  { kind: ["tech-broker"], label: "Courtier tech." },
  { kind: ["suit", "weapon", "merchant"], label: "Odyssey" },
  { kind: ["unlock", "bartender"], label: "Déblocages" },
];

export class EngineeringView implements View {
  private root?: HTMLElement;
  private tab = 0;
  private module = "";
  private query = "";
  private side = h("nav.module-list");
  private main = h("div.bp-main");
  private tabs = h("div.segmented");

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const search = h("input.search", {
      type: "search",
      placeholder: "Module ou modification…",
      value: this.query,
      oninput: (e: Event) => {
        this.query = (e.target as HTMLInputElement).value.trim().toLowerCase();
        this.update();
      },
    });
    replace(
      root,
      h("header.view-head", null, h("h1", null, "Ingénierie"), h("div.toolbar", null, h("label.search-wrap", null, icon("search"), search), this.tabs)),
      h("div.bp-layout", null, this.side, this.main),
    );
    this.update();
  }

  private blueprints(): Blueprint[] {
    const kinds = KINDS[this.tab].kind;
    return this.ctx.game.data.blueprints.filter((b) => kinds.includes(b.kind));
  }

  update() {
    if (!this.root) return;
    replace(
      this.tabs,
      KINDS.map((k, i) => h("button", { class: i === this.tab ? "active" : "", onclick: () => ((this.tab = i), (this.module = ""), this.update()) }, k.label)),
    );

    const all = this.blueprints();
    const q = this.query;
    const visible = q ? all.filter((b) => b.module.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)) : all;
    const modules = [...new Set(visible.map((b) => b.module))].sort((a, b) => a.localeCompare(b));
    if (!modules.includes(this.module)) this.module = modules[0] ?? "";

    replace(
      this.side,
      modules.map((mod) =>
        h(
          "button",
          { class: mod === this.module ? "active" : "", onclick: () => ((this.module = mod), this.update()) },
          mod,
          h("small", null, ` ${new Set(visible.filter((b) => b.module === mod).map((b) => b.name)).size}`),
        ),
      ),
    );

    const ofModule = visible.filter((b) => b.module === this.module);
    const names = [...new Set(ofModule.map((b) => b.name))].sort((a, b) => a.localeCompare(b));
    replace(
      this.main,
      h("h2", null, this.module || "—"),
      names.map((name) => this.card(ofModule.filter((b) => b.name === name).sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0)))),
    );
  }

  private ingredients(bp: Blueprint): HTMLElement {
    return h(
      "div.ingredients",
      null,
      Object.entries(bp.ingredients).map(([id, n]) => {
        const have = ownedOf(this.ctx, id);
        const known = Boolean(this.ctx.game.material(id));
        return h(
          "button.mat-chip",
          { class: !known ? "commodity" : have >= n ? "ok" : "short", onclick: () => known && this.ctx.store.select(id), title: known ? `${have} possédés` : "Marchandise (soute)" },
          this.ctx.game.nameOf(id),
          h("small", null, known ? `${fmt(Math.min(have, n))}/${n}` : `×${n}`),
        );
      }),
    );
  }

  private card(grades: Blueprint[]): HTMLElement {
    const first = grades[0];
    const max = grades[grades.length - 1];
    const engineers = [...new Set(grades.flatMap((g) => g.engineers ?? []))];
    return h(
      "article.bp.card",
      null,
      h(
        "div.bp-head",
        null,
        h("div", null, h("h3", null, first.name), h("p.sub", null, kindFr(first.kind), engineers.length ? ` · ${engineers.join(", ")}` : "")),
        h(
          "button.primary.small",
          { onclick: () => addToWishlist(this.ctx, max, first.kind === "modification" ? 1 : undefined, max.grade) },
          icon("plus"),
          grades.length > 1 && first.kind === "modification" ? ` G1→G${max.grade}` : " Wishlist",
        ),
      ),
      max.effects?.length
        ? h("p.effects", null, max.effects.map((e) => h(`span.effect.${e.good ? "good" : "bad"}`, null, `${e.label} ${e.value}`)))
        : null,
      h(
        "div.grades",
        null,
        grades.map((bp) =>
          h(
            "div.grade",
            null,
            h(
              "div.grade-title",
              null,
              bp.grade ? h("strong", null, `Grade ${bp.grade}`) : null,
              grades.length > 1 ? h("button.ghost.small", { title: "Ajouter seulement ce grade", onclick: () => addToWishlist(this.ctx, bp, bp.grade, bp.grade) }, icon("plus")) : null,
            ),
            this.ingredients(bp),
          ),
        ),
      ),
    );
  }
}
