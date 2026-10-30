import { h, icon, fmt, replace, toast } from "../dom.js";
import { ownedOf, reserved, type Ctx, type View } from "../context.js";
import { blueprintGrades, bpKey, defaultRolls, wishNeeds, type WishItem } from "../store.js";
import { suggestTrades } from "../trade.js";
import type { Blueprint } from "../types.js";
import { kindFr } from "./detail.js";

export function addToWishlist(ctx: Ctx, bp: Blueprint, from?: number, to?: number) {
  const grades = blueprintGrades(ctx.game, bpKey(bp));
  const max = Math.max(...grades.keys());
  const item: WishItem = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    bp: bpKey(bp),
    gradeFrom: from ?? (bp.kind === "modification" ? 1 : bp.grade ?? 0),
    gradeTo: to ?? (bp.kind === "modification" ? bp.grade ?? max : bp.grade ?? 0),
    rolls: {},
    count: 1,
  };
  ctx.store.setWishlist([...ctx.store.state.wishlist, item]);
  toast(`Ajouté à la wishlist : ${bp.module} — ${bp.name}`);
}

export class WishlistView implements View {
  private root?: HTMLElement;
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.update();
  }

  private patch(id: string, change: Partial<WishItem>) {
    const list = this.ctx.store.state.wishlist.map((w) => (w.id === id ? { ...w, ...change } : w));
    this.ctx.store.setWishlist(list);
  }

  update() {
    if (!this.root) return;
    const { game, store } = this.ctx;
    const items = store.state.wishlist;
    if (!items.length) {
      replace(
        this.root,
        h("header.view-head", null, h("h1", null, "Wishlist")),
        h(
          "div.empty-state",
          null,
          h("p", null, "Ta wishlist est vide."),
          h("p.sub", null, "Ajoute des modifications depuis l'onglet Ingénierie, ou depuis la fiche d'un matériau (section « Utilisé dans »)."),
          h("button.primary", { onclick: () => store.setView("engineering") }, "Ouvrir l'ingénierie"),
        ),
      );
      return;
    }

    const needs = reserved(this.ctx);
    const rows = Object.entries(needs)
      .map(([id, need]) => ({ id, need, owned: ownedOf(this.ctx, id), m: game.material(id) }))
      .sort((a, b) => Number(a.owned >= a.need) - Number(b.owned >= b.need) || (a.m?.category ?? "").localeCompare(b.m?.category ?? "") || (b.m?.grade ?? 0) - (a.m?.grade ?? 0));
    const done = rows.filter((r) => r.owned >= r.need).length;

    const entries = items.map((item) => {
      const grades = blueprintGrades(game, item.bp);
      const any = [...grades.values()][0];
      if (!any) {
        return h("div.wish.card", null, h("p", null, `Recette introuvable : ${item.bp}`), h("button.ghost", { onclick: () => store.setWishlist(items.filter((w) => w.id !== item.id)) }, "Retirer"));
      }
      const graded = any.kind === "modification" && grades.size > 1;
      const local = wishNeeds(game, item);
      const ready = Object.entries(local).every(([id, n]) => ownedOf(this.ctx, id) >= n);
      const gradeOptions = [...grades.keys()].sort();
      return h(
        "div.wish.card",
        { class: ready ? "ready" : "" },
        h(
          "div.wish-head",
          null,
          h("div", null, h("strong", null, `${any.module} — ${any.name}`), h("p.sub", null, kindFr(any.kind), any.engineers?.length ? ` · ${any.engineers.join(", ")}` : "")),
          ready ? h("span.badge.hit", null, icon("check"), " Prêt") : null,
          h("button.icon-btn", { title: "Retirer", onclick: () => store.setWishlist(items.filter((w) => w.id !== item.id)) }, icon("close")),
        ),
        h(
          "div.wish-controls",
          null,
          graded
            ? [
                h("label", null, "Grades ", select(gradeOptions, item.gradeFrom, (v) => this.patch(item.id, { gradeFrom: v, gradeTo: Math.max(v, item.gradeTo) })), " → ", select(gradeOptions, item.gradeTo, (v) => this.patch(item.id, { gradeTo: v, gradeFrom: Math.min(v, item.gradeFrom) }))),
                h(
                  "span.rolls",
                  null,
                  "Jets : ",
                  gradeOptions
                    .filter((g) => g >= item.gradeFrom && g <= item.gradeTo)
                    .map((g) =>
                      h(
                        "label.roll",
                        { title: `Nombre de jets au grade ${g}` },
                        `G${g}`,
                        h("input", { type: "number", min: "0", max: "20", value: String(item.rolls[g] ?? defaultRolls(g)), onchange: (e: Event) => this.patch(item.id, { rolls: { ...item.rolls, [g]: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) } }) }),
                      ),
                    ),
                ),
              ]
            : null,
          h("label", null, "Quantité ", h("input", { type: "number", min: "1", max: "99", value: String(item.count), onchange: (e: Event) => this.patch(item.id, { count: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }) })),
        ),
        h(
          "div.wish-mats",
          null,
          Object.entries(local).map(([id, n]) => {
            const have = ownedOf(this.ctx, id);
            return h("button.mat-chip", { class: have >= n ? "ok" : "short", onclick: () => store.select(id) }, game.nameOf(id), h("small", null, `${fmt(Math.min(have, n))}/${fmt(n)}`));
          }),
        ),
      );
    });

    const shortRows = rows.map(({ id, need, owned, m }) => {
      const missing = Math.max(0, need - owned);
      let plan: HTMLElement | null = null;
      if (missing && m && m.ledger === "ship") {
        const best = suggestTrades(game, m, store.state.cmdr.materials, needs, missing)[0];
        if (best) plan = h("span.sub", null, `↹ ${fmt(best.pay)} ${best.from.name} → ${fmt(best.receive)}`);
      }
      return h(
        "tr",
        { class: missing ? "short" : "ok", onclick: () => store.select(id) },
        h("td", null, m?.name ?? game.nameOf(id), m?.grade ? h("small.grade", null, ` G${m.grade}`) : null),
        h("td.num", null, fmt(need)),
        h("td.num", null, fmt(owned)),
        h("td.num", null, missing ? h("strong", null, fmt(missing)) : icon("check")),
        h("td", null, h("div.bar.small", null, h("span", { style: { width: `${Math.min(100, (owned / need) * 100)}%` } })), plan),
      );
    });

    replace(
      this.root,
      h("header.view-head", null, h("h1", null, "Wishlist"), h("p.sub", null, `${items.length} recettes · ${done}/${rows.length} matériaux complets`)),
      h(
        "div.wish-layout",
        null,
        h("div.wish-list", null, entries),
        h(
          "div.card.needs",
          null,
          h("h3", null, "Matériaux nécessaires"),
          h("table.table", null, h("thead", null, h("tr", null, h("th", null, "Matériau"), h("th.num", null, "Requis"), h("th.num", null, "Possédé"), h("th.num", null, "Manque"), h("th", null, "Progression / échange"))), h("tbody", null, shortRows)),
        ),
      ),
    );
  }
}

function select(options: number[], value: number, onChange: (v: number) => void): HTMLSelectElement {
  return h(
    "select",
    { onchange: (e: Event) => onChange(Number((e.target as HTMLSelectElement).value)) },
    options.map((o) => h("option", { value: String(o), selected: o === value }, `G${o}`)),
  );
}
