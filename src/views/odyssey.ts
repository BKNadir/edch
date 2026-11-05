import { nameMatches, t } from "../i18n.js";
import { CATEGORY_FR } from "../data.js";
import { h, icon, fmt, replace } from "../dom.js";
import { reserved, type Ctx, type View } from "../context.js";
import type { Material } from "../types.js";

const CATS = ["Data", "Component", "Item", "Consumable"] as const;

/** Odyssey ship locker (on-foot materials). */
export class OdysseyView implements View {
  private root?: HTMLElement;
  private body = h("div");
  private head = h("div.toolbar");
  private cat: (typeof CATS)[number] = "Data";
  private query = "";
  private ownedOnly = false;

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const search = h("input.search", {
      type: "search",
      placeholder: t("odyssey.search"),
      value: this.query,
      oninput: (e: Event) => {
        this.query = (e.target as HTMLInputElement).value.trim().toLowerCase();
        this.update();
      },
    });
    replace(root, h("header.view-head", null, h("h1", null, t("odyssey.odysseyShipLocker")), h("div.toolbar", null, h("label.search-wrap", null, icon("search"), search), this.head)), this.body);
    this.update();
  }

  update() {
    if (!this.root) return;
    const { game, store } = this.ctx;
    const locker = store.state.cmdr.locker;
    const needs = reserved(this.ctx);

    replace(
      this.head,
      h(
        "div.segmented",
        null,
        CATS.map((c) => {
          const count = game.data.materials.filter((m) => m.category === c).reduce((s, m) => s + (locker[m.id] ?? 0), 0);
          return h("button", { class: this.cat === c ? "active" : "", onclick: () => ((this.cat = c), this.update()) }, CATEGORY_FR[c], h("small", null, ` ${fmt(count)}`));
        }),
      ),
      h("label.check", null, h("input", { type: "checkbox", checked: this.ownedOnly, onchange: (e: Event) => ((this.ownedOnly = (e.target as HTMLInputElement).checked), this.update()) }), (" " + t("odyssey.ownedOnly"))),
    );

    const usedBy = (m: Material) => (game.usedIn.get(m.id) ?? []).filter((b) => ["suit", "weapon", "merchant", "unlock", "bartender"].includes(b.kind));
    const mats = game.data.materials
      .filter((m) => m.ledger === "locker" && m.category === this.cat)
      .filter((m) => !this.ownedOnly || (locker[m.id] ?? 0) > 0)
      .filter((m) => !this.query || nameMatches(m.name, this.query))
      .sort((a, b) => (locker[b.id] ?? 0) - (locker[a.id] ?? 0) || a.name.localeCompare(b.name));

    const empty = !Object.keys(locker).length;
    replace(
      this.body,
      empty ? h("div.notice", null, icon("warn"), (" " + t("odyssey.lockerEmptyNotReadYetFills"))) : null,
      h(
        "div.locker-grid",
        null,
        mats.map((m) => {
          const owned = locker[m.id] ?? 0;
          const need = needs[m.id] ?? 0;
          const uses = usedBy(m).length;
          return h(
            "button.locker-item",
            {
              class: [store.state.selected === m.id ? "selected" : "", owned ? "" : "zero", need > owned ? "short" : need ? "covered" : ""].filter(Boolean).join(" "),
              onclick: () => store.select(store.state.selected === m.id ? undefined : m.id),
            },
            h("span.mat-name", null, m.name),
            h("span.mat-count", null, h("strong", null, fmt(owned)), need ? h("em", null, (" " + t("common.needed", { need }))) : null),
            h("span.sub", null, uses ? t("odyssey.recipes", { count: uses }) : t("odyssey.noRecipe"), m.barter ? (" " + t("odyssey.barter", { barter: m.barter })) : ""),
          );
        }),
      ),
    );
  }
}
