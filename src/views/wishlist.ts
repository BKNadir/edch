import { gameName } from "../i18n.js";
import { h, icon, fmt, replace, toast } from "../dom.js";
import { ownedOf, reserved, type Ctx, type View } from "../context.js";
import { blueprintGrades, bpKey, defaultRolls, wishNeeds, type WishItem } from "../store.js";
import { suggestTrades } from "../trade.js";
import type { Blueprint } from "../types.js";
import { kindFr } from "./detail.js";
import { extractLoadout, importLoadout } from "../importer.js";
import { moduleLink } from "../links.js";

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
  toast(`Ajouté à la wishlist : ${gameName(bp.module)} — ${gameName(bp.name)}`);
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
    const area = h("textarea", { rows: 6, spellcheck: false, placeholder: "Colle ici l'export EDSY ou Coriolis (format SLEF ou Loadout JSON)…" });
    const report = h("div.import-report");
    const run = (text: string, source: string) => {
      const loadout = extractLoadout(text);
      if (!loadout) {
        replace(report, h("p.error", null, icon("warn"), " Format non reconnu. Dans EDSY : Ship → Export → SLEF. Dans Coriolis : Export → SLEF (ou JSON du Loadout)."));
        return;
      }
      const res = importLoadout(this.ctx.game, loadout);
      if (!res.items.length) {
        replace(report, h("p.error", null, icon("warn"), ` Aucun module ingénié trouvé dans ${source}.`));
        return;
      }
      this.ctx.store.setWishlist([...this.ctx.store.state.wishlist, ...res.items]);
      area.value = "";
      replace(
        report,
        h("p", null, icon("check"), ` ${res.items.length} ligne(s) ajoutée(s) depuis ${source}`, res.ship ? ` (${res.ship})` : "", "."),
        res.skipped.length ? h("p.sub", null, `Non reconnu : ${res.skipped.join(", ")}`) : null,
      );
      toast(`Build importé : ${res.items.length} ligne(s)`);
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
      h("h3", null, "Importer un build"),
      h("p.sub", null, "Chaque module ingénié devient une ligne « blueprint G1 → grade du build », plus son effet expérimental. Les modules identiques sont regroupés."),
      area,
      h(
        "div.row",
        null,
        h("button.primary", { onclick: () => run(area.value, "le texte collé") }, "Importer le texte"),
        h("label.ghost.file-btn", null, "Choisir un fichier…", file),
        h(
          "button.ghost",
          {
            title: "Recrée la wishlist d'ingénierie de ton vaisseau actuel (utile pour un 2e vaisseau identique)",
            onclick: () => {
              const l = this.ctx.store.state.cmdr.loadout;
              if (!l) return toast("Pas encore de vaisseau lu dans le journal");
              const modules = l.modules
                .filter((m) => m.engineering)
                .map((m) => ({ Slot: m.slot, Item: m.item, Engineering: { BlueprintName: m.engineering!.blueprint, Level: m.engineering!.level, ExperimentalEffect: m.engineering!.experimental } }));
              run(JSON.stringify({ event: "Loadout", Ship: l.ship, ShipName: this.ctx.store.state.cmdr.ship?.name, Modules: modules }), "ton vaisseau actuel");
            },
          },
          "Depuis mon vaisseau actuel",
        ),
      ),
      report,
    );
  }

  private renderToolbar() {
    const store = this.ctx.store;
    replace(
      this.toolbar,
      h("button.ghost", { onclick: () => ((this.importOpen = !this.importOpen), this.update()) }, icon("plus"), this.importOpen ? " Fermer l'import" : " Importer EDSY / Coriolis"),
      store.state.wishlist.length
        ? h("button.ghost", { onclick: () => { if (confirmClear()) store.setWishlist([]); } }, icon("close"), " Vider")
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

  update() {
    if (!this.root) return;
    const { game, store } = this.ctx;
    const items = store.state.wishlist;
    this.renderToolbar();
    const importer = this.importOpen ? this.importPanel : null;
    if (!items.length) {
      replace(
        this.root,
        h("header.view-head", null, h("h1", null, "Wishlist"), this.toolbar),
        this.importPanel,
        h(
          "div.empty-state",
          null,
          h("p", null, "Ta wishlist est vide."),
          h("p.sub", null, "Importe un build EDSY / Coriolis ci-dessus, ou ajoute des modifications depuis l'onglet Ingénierie ou la fiche d'un matériau."),
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
          h("div", null, h("strong", null, moduleLink(any.module), ` — ${gameName(any.name)}`), h("p.sub", null, item.note ? h("span.badge.muted", null, item.note) : null, item.note ? " " : "", kindFr(any.kind), any.engineers?.length ? ` · ${any.engineers.join(", ")}` : "")),
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
        if (best) plan = h("span.sub", null, `↹ ${fmt(best.pay)} ${gameName(best.from.name)} → ${fmt(best.receive)}`);
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
      h("header.view-head", null, h("div", null, h("h1", null, "Wishlist"), h("p.sub", null, `${items.length} recettes · ${done}/${rows.length} matériaux complets`)), this.toolbar),
      importer,
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

// A single "are you sure" without a blocking browser dialog: second click within 3 s confirms.
let clearArmed = 0;
function confirmClear(): boolean {
  if (Date.now() - clearArmed < 3000) return true;
  clearArmed = Date.now();
  toast("Clique encore sur « Vider » pour confirmer");
  return false;
}

function select(options: number[], value: number, onChange: (v: number) => void): HTMLSelectElement {
  return h(
    "select",
    { onchange: (e: Event) => onChange(Number((e.target as HTMLSelectElement).value)) },
    options.map((o) => h("option", { value: String(o), selected: o === value }, `G${o}`)),
  );
}
