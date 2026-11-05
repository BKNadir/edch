import { gameName, nameMatches, t } from "../../platform/i18n.js";
import { CATEGORY_FR } from "../../game/data.js";
import { h, icon, fmt, replace } from "../../ui/dom.js";
import { reserved, type Ctx, type View } from "../../state/context.js";
import type { Material } from "../../game/types.js";

type Filter = "all" | "owned" | "wish";

/** Ship materials laid out like the material trader: one row per trader line, grades 1→5. */
export class MaterialsView implements View {
  private root?: HTMLElement;
  private list = h("div.mat-sections");
  private query = "";
  private filter: Filter = "all";
  private tabs?: HTMLElement;

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const search = h("input.search", {
      type: "search",
      placeholder: t("materials.searchMaterialCtrlF"),
      value: this.query,
      oninput: (e: Event) => {
        this.query = (e.target as HTMLInputElement).value.trim().toLowerCase();
        this.update();
      },
    });
    this.tabs = h("div.segmented");
    replace(
      root,
      h("header.view-head", null, h("h1", null, t("materials.engineeringMaterials")), h("div.toolbar", null, h("label.search-wrap", null, icon("search"), search), this.tabs)),
      this.list,
    );
    this.update();
  }

  private matches(m: Material, owned: number, need: number): boolean {
    if (this.filter === "owned" && owned <= 0) return false;
    if (this.filter === "wish" && need <= 0) return false;
    if (!this.query) return true;
    return nameMatches(m.name, this.query) || m.origins.some((o) => nameMatches(o, this.query));
  }

  private cell(m: Material, owned: number, need: number): HTMLElement {
    const cap = this.ctx.game.capacityOf(m.id) ?? 1;
    const selected = this.ctx.store.state.selected === m.id;
    const short = need > 0 && owned < need;
    const hidden = !this.matches(m, owned, need);
    return h(
      "button.mat",
      {
        class: [selected ? "selected" : "", short ? "short" : "", need > 0 && !short ? "covered" : "", owned === 0 ? "zero" : "", owned >= cap ? "full" : "", hidden ? "dim" : ""].filter(Boolean).join(" "),
        title: m.origins.map(gameName).join("\n"),
        onclick: () => this.ctx.store.select(selected ? undefined : m.id),
      },
      h("span.mat-name", null, m.name),
      h("span.mat-count", null, h("strong", null, fmt(owned)), h("small", null, `/${cap}`), need ? h("em", null, (" " + t("common.needed", { need: fmt(need) }))) : null),
      h("span.bar", null, h("span", { style: { width: `${Math.min(100, (owned / cap) * 100)}%` } })),
    );
  }

  update() {
    if (!this.root || !this.tabs) return;
    const { game, store } = this.ctx;
    const owned = store.state.cmdr.materials;
    const needs = reserved(this.ctx);

    replace(
      this.tabs,
      (["all", "owned", "wish"] as Filter[]).map((f) =>
        h(
          "button",
          { class: this.filter === f ? "active" : "", onclick: () => ((this.filter = f), this.update()) },
          f === "all" ? t("common.all") : f === "owned" ? t("materials.owned") : t("common.wishlist"),
        ),
      ),
    );

    const sections = (["Raw", "Manufactured", "Encoded"] as const).map((cat) => {
      const lines = game.linesOf(cat);
      const total = game.data.materials.filter((m) => m.category === cat && m.ledger === "ship").reduce((sum, m) => sum + (owned[m.id] ?? 0), 0);
      const rows = lines
        .map((line) => {
          const mats = game.byLine.get(line)!;
          const anyVisible = mats.some((m) => this.matches(m, owned[m.id] ?? 0, needs[m.id] ?? 0));
          if (!anyVisible) return null;
          return h(
            "div.line-row",
            null,
            h("span.line-name", null, game.lineName(line)),
            [1, 2, 3, 4, 5].map((g) => {
              const m = mats.find((x) => x.grade === g);
              return m ? this.cell(m, owned[m.id] ?? 0, needs[m.id] ?? 0) : h("span.mat.empty");
            }),
          );
        })
        .filter(Boolean);
      const others = game.data.materials
        .filter((m) => m.category === cat && m.ledger === "ship" && !m.line)
        .filter((m) => this.matches(m, owned[m.id] ?? 0, needs[m.id] ?? 0));
      if (!rows.length && !others.length) return null;
      return h(
        "section.mat-section",
        null,
        h("h2", null, CATEGORY_FR[cat], h("span.sub", null, (" " + t("materials.units", { total: fmt(total) })))),
        rows.length
          ? h("div.grade-head", null, h("span"), [1, 2, 3, 4, 5].map((g) => h("span", null, t("common.grade", { grade: g }))))
          : null,
        rows,
        others.length
          ? h(
              "div.others",
              null,
              h("h3", null, cat === "Encoded" ? t("materials.guardianThargoidData") : t("materials.guardianThargoidNotTradeable")),
              h("div.other-grid", null, others.map((m) => this.cell(m, owned[m.id] ?? 0, needs[m.id] ?? 0))),
            )
          : null,
      );
    });

    const visible = sections.filter(Boolean);
    replace(this.list, visible.length ? visible : h("p.empty", null, t("materials.noMatchingMaterial")));
    if (!Object.keys(owned).length) {
      this.list.prepend(
        h("div.notice", null, icon("warn"), (" " + t("materials.noInventoryYetStartEliteDangerous"))),
      );
    }
  }
}
