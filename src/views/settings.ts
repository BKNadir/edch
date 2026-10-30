import { defaultJournalDir, isTauri, openUrl, startJournal } from "../bridge.js";
import { h, replace, toast } from "../dom.js";
import type { Ctx, View } from "../context.js";
import type { Settings } from "../store.js";

export class SettingsView implements View {
  private root?: HTMLElement;
  constructor(private ctx: Ctx, private restart: () => void) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  // Inputs keep focus: only re-render on mount.
  update() {
    const status = this.root?.querySelector(".watch-status");
    if (status) status.textContent = this.statusText();
  }

  private statusText(): string {
    const w = this.ctx.store.state.watch;
    if (w.state === "live") return `Lecture en direct : ${w.file ?? ""}`;
    if (w.state === "waiting") return w.message ?? "En attente du jeu…";
    if (w.state === "error") return `Erreur : ${w.message ?? ""}`;
    if (w.state === "demo") return "Mode démo (navigateur) : journal d'exemple";
    return "Lecture arrêtée";
  }

  private render() {
    if (!this.root) return;
    const s = this.ctx.store.state.settings;
    const set = (patch: Partial<Settings>) => this.ctx.store.updateSettings(patch);
    const number = (label: string, value: number, key: keyof Settings, help: string, attrs: Record<string, string> = {}) =>
      h(
        "label.field",
        null,
        h("span", null, label),
        h("input", { type: "number", value: String(value), ...attrs, onchange: (e: Event) => set({ [key]: Number((e.target as HTMLInputElement).value) } as Partial<Settings>) }),
        h("small", null, help),
      );

    const dir = h("input", { type: "text", value: s.journalDir, placeholder: "C:\\Users\\…\\Saved Games\\Frontier Developments\\Elite Dangerous", spellcheck: false });

    replace(
      this.root,
      h("header.view-head", null, h("h1", null, "Paramètres")),
      h(
        "div.settings",
        null,
        h(
          "section.card",
          null,
          h("h3", null, "Journal du jeu"),
          h("p.sub.watch-status", null, this.statusText()),
          h("label.field.wide", null, h("span", null, "Dossier du journal"), dir),
          h(
            "div.row",
            null,
            h(
              "button.ghost",
              {
                disabled: !isTauri(),
                onclick: async () => {
                  const found = await defaultJournalDir();
                  if (found) dir.value = found;
                },
              },
              "Détecter",
            ),
            h(
              "button.primary",
              {
                disabled: !isTauri(),
                onclick: async () => {
                  set({ journalDir: dir.value.trim() });
                  try {
                    this.restart();
                    await startJournal(dir.value.trim());
                    toast("Lecture du journal démarrée");
                  } catch (e) {
                    toast(String(e));
                  }
                },
              },
              "Enregistrer et lire",
            ),
          ),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Recherche de systèmes (Spansh)"),
          number("Distance max (al)", s.maxDistance, "maxDistance", "Rayon de recherche autour de ta position.", { min: "10", max: "5000", step: "10" }),
          number("Population min. pour les HGE", s.hgeMinPopulation, "hgeMinPopulation", "« Haute population » : 1 000 000 par défaut.", { min: "0", step: "100000" }),
          number("Données BGS max. (jours)", s.maxAgeDays, "maxAgeDays", "Ignore les états de faction plus vieux (Boom, Guerre…). 0 = pas de limite.", { min: "0", max: "60" }),
          h(
            "label.field",
            null,
            h("span", null, "Système de repli"),
            h("input", { type: "text", value: s.fallbackSystem, onchange: (e: Event) => set({ fallbackSystem: (e.target as HTMLInputElement).value.trim() || "Sol" }) }),
            h("small", null, "Utilisé tant que le jeu n'a pas donné ta position."),
          ),
          h("label.check", null, h("input", { type: "checkbox", checked: s.largePadOnly, onchange: (e: Event) => set({ largePadOnly: (e.target as HTMLInputElement).checked }) }), " Traders avec pad L seulement"),
        ),
        h(
          "section.card",
          null,
          h("h3", null, "À propos"),
          h("p", null, "ED Companion lit le journal local d'Elite Dangerous en temps réel. Les systèmes proposés viennent de ", h("button.inline-link", { onclick: () => openUrl("https://spansh.co.uk") }, "Spansh"), " (données EDDN, mises à jour par les joueurs)."),
          h("p.sub", null, this.ctx.game.data.credits),
          h("p.sub", null, "Elite Dangerous est une marque de Frontier Developments plc. Outil communautaire non officiel, non commercial."),
        ),
      ),
    );
  }
}
