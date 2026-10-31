import { exportConfig, importConfig, isTauri, listOptionFiles, readOptionFile, revealPath, type OptionFile } from "../bridge.js";
import {
  actionName,
  comboLabel,
  deviceInfo,
  fileForPreset,
  groupOf,
  keyLabel,
  padControl,
  parseBinds,
  parseStartPreset,
  presetLineFor,
  type Bind,
  type BindsMeta,
} from "../binds.js";
import { h, icon, replace, toast } from "../dom.js";
import type { Ctx, View } from "../context.js";
import { DEMO_BINDS } from "../demo.js";

const GROUP_FR: Record<string, string> = {
  Ship: "Vaisseau",
  Fighter: "Chasseur",
  Scanners: "Scanners",
  Multicrew: "Multi-équipage",
  SRV: "SRV",
  OnFoot: "À pied",
  "Holo-Me": "Holo-Me",
  "Galaxy map": "Carte galactique",
  UI: "Interface",
  Camera: "Caméra",
  "Head look": "Regard libre",
  Misc: "Divers",
};
const MODES: [string, string, string[] | null][] = [
  ["all", "Tout", null],
  ["ship", "Vaisseau", ["Ship", "Fighter", "Scanners", "Multicrew"]],
  ["srv", "SRV", ["SRV"]],
  ["foot", "À pied", ["OnFoot", "Holo-Me"]],
  ["ui", "Cartes & interface", ["Galaxy map", "UI", "Camera", "Head look", "Misc"]],
];
const groupClass = (g: string) => `g-${g.toLowerCase().replace(/[^a-z]/g, "")}`;

let metaPromise: Promise<BindsMeta> | undefined;
const loadMeta = () =>
  (metaPromise ??= fetch("data/binds.json").then((r) => {
    if (!r.ok) throw new Error(`binds.json: HTTP ${r.status}`);
    return r.json();
  }));

export class ControlsView implements View {
  private meta?: BindsMeta;
  private files: OptionFile[] = [];
  private presets: string[] = [];
  private chosen = ""; // "" = active presets, else a file name
  private binds: Bind[] = [];
  private layout = "en-US";
  private note = "";
  private device = "";
  private mode = "all";
  private query = "";
  private body = h("div.controls-body");
  private backupOut = h("div.backup-out");

  constructor(_ctx: Ctx) {}

  async mount(root: HTMLElement) {
    replace(root, h("header.view-head", null, h("h1", null, "Commandes & contrôleurs")), this.backupCard(), this.body);
    replace(this.body, h("p.sub", null, h("span.spinner"), " Lecture de tes raccourcis…"));
    try {
      this.meta = await loadMeta();
      await this.load();
    } catch (e) {
      replace(this.body, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  update() {
    /* bindings only change on import or reload */
  }

  // ---------------- loading ----------------

  private async load() {
    const meta = this.meta!;
    this.note = "";
    if (!isTauri()) {
      const f = parseBinds(DEMO_BINDS);
      this.binds = f.binds;
      this.layout = f.keyboardLayout;
      this.presets = [f.preset];
      this.note = "Mode démo : raccourcis d'exemple.";
      return this.render();
    }
    this.files = (await listOptionFiles()).filter((f) => f.folder === "Bindings");
    const names = this.files.map((f) => f.name);
    if (this.chosen) {
      const f = parseBinds(await readOptionFile("Bindings", this.chosen));
      this.binds = f.binds;
      this.layout = f.keyboardLayout;
      this.presets = [f.preset];
      return this.render();
    }
    const startName = names.find((n) => n.toLowerCase() === "startpreset.4.start") ?? names.find((n) => n.toLowerCase().startsWith("startpreset") && n.endsWith(".start"));
    const lines = startName ? parseStartPreset(await readOptionFile("Bindings", startName)) : [];
    this.presets = lines;
    const parsed = new Map<string, ReturnType<typeof parseBinds> | null>();
    for (const p of new Set(lines)) {
      const file = fileForPreset(p, names);
      parsed.set(p, file ? parseBinds(await readOptionFile("Bindings", file)) : null);
    }
    const missing = [...parsed.entries()].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) this.note = `Préréglage(s) d'origine du jeu, non copiés dans ton dossier : ${missing.join(", ")}. Crée un préréglage personnalisé en jeu pour les voir ici.`;
    this.binds = [];
    for (const [preset, f] of parsed) {
      if (!f) continue;
      this.layout = f.keyboardLayout;
      for (const b of f.binds) {
        const line = presetLineFor(groupOf(meta, b.action));
        if ((lines[line] ?? lines[0]) === preset) this.binds.push(b);
      }
    }
    if (!lines.length && names.some((n) => n.endsWith(".binds"))) {
      this.note = "Aucun préréglage actif trouvé (StartPreset). Choisis un fichier ci-dessous.";
    }
    this.render();
  }

  // ---------------- backup card ----------------

  private backupCard(): HTMLElement {
    const doExport = async (graphics: boolean) => {
      try {
        const path = await exportConfig(graphics);
        replace(this.backupOut, h("p", null, icon("check"), " Exporté : ", h("code", null, path), " ", h("button.ghost.small", { onclick: () => revealPath(path) }, "Afficher dans l'explorateur")));
      } catch (e) {
        replace(this.backupOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
      }
    };
    const file = h("input", {
      type: "file",
      accept: ".zip,application/zip",
      onchange: async (e: Event) => {
        const input = e.target as HTMLInputElement;
        const f = input.files?.[0];
        input.value = "";
        if (!f) return;
        try {
          const report = await importConfig(new Uint8Array(await f.arrayBuffer()));
          replace(
            this.backupOut,
            h("p", null, icon("check"), ` ${report.written.length} fichier(s) restauré(s). Ancienne config sauvegardée : `, h("code", null, report.backup), " ", h("button.ghost.small", { onclick: () => revealPath(report.backup) }, "Afficher")),
            h("p.sub", null, report.written.join(" · ")),
            report.skipped.length ? h("p.sub", null, `Ignoré : ${report.skipped.join(", ")}`) : null,
            h("p.notice", null, icon("warn"), " Relance Elite Dangerous (ou va dans Options → Commandes) pour que le jeu relise les fichiers."),
          );
          toast("Configuration importée");
          this.chosen = "";
          await this.load();
        } catch (err) {
          replace(this.backupOut, h("p.error", null, icon("warn"), ` ${String((err as Error).message ?? err)}`));
        }
      },
    });
    return h(
      "section.card.backup",
      null,
      h("div", null, h("h3", null, "Sauvegarder / restaurer ta configuration"), h("p.sub", null, "Exporte tes raccourcis (et tes réglages graphiques) dans un zip, dans Documents\\EDCH. L'import sauvegarde d'abord ta configuration actuelle. Ferme le jeu avant d'importer.")),
      h(
        "div.row",
        null,
        h("button.primary", { onclick: () => doExport(false) }, "Exporter les raccourcis"),
        h("button.ghost", { onclick: () => doExport(true) }, "Raccourcis + graphismes"),
        h("label.file-btn", null, "Importer un zip…", file),
      ),
      this.backupOut,
    );
  }

  // ---------------- main render ----------------

  private visible(): Bind[] {
    const meta = this.meta!;
    const groups = MODES.find(([m]) => m === this.mode)?.[2];
    const q = this.query.toLowerCase();
    return this.binds.filter((b) => {
      const g = groupOf(meta, b.action);
      if (groups && !groups.includes(g)) return false;
      if (q && !actionName(meta, b.action).toLowerCase().includes(q) && !comboLabel(meta, b).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  private render() {
    const meta = this.meta!;
    const devices = [...new Set(this.binds.map((b) => b.device))].sort((a, b) => rank(meta, a) - rank(meta, b));
    if (!devices.includes(this.device)) this.device = devices[0] ?? "";
    const binds = this.visible();
    const mine = binds.filter((b) => b.device === this.device);

    const fileSelect = this.files.length
      ? h(
          "select",
          { onchange: (e: Event) => ((this.chosen = (e.target as HTMLSelectElement).value), this.load()) },
          h("option", { value: "", selected: !this.chosen }, "Préréglage actif"),
          this.files.filter((f) => f.name.endsWith(".binds")).map((f) => h("option", { value: f.name, selected: f.name === this.chosen }, f.name)),
        )
      : null;

    replace(
      this.body,
      h(
        "div.controls-bar",
        null,
        h("div", null, h("strong", null, this.presets.length ? [...new Set(this.presets)].join(" / ") : "—"), h("span.sub", null, ` · ${this.binds.length} raccourcis · clavier ${this.layout}`)),
        fileSelect,
        h("div.segmented", null, MODES.map(([m, l]) => h("button", { class: this.mode === m ? "active" : "", onclick: () => ((this.mode = m), this.render()) }, l))),
        h("label.search-wrap", null, icon("search"), h("input.search", { type: "search", placeholder: "Chercher une commande…", value: this.query, oninput: (e: Event) => ((this.query = (e.target as HTMLInputElement).value), this.renderDebounced()) })),
        h("button.ghost", { onclick: () => window.print() }, "Imprimer la fiche"),
      ),
      this.note ? h("p.notice", null, icon("warn"), ` ${this.note}`) : null,
      devices.length
        ? h(
            "div.device-tabs",
            null,
            devices.map((d) => {
              const info = deviceInfo(meta, d);
              const count = binds.filter((b) => b.device === d).length;
              return h("button", { class: d === this.device ? "active" : "", onclick: () => ((this.device = d), this.render()) }, h("span", null, info.label), h("small", null, ` ${count}`));
            }),
          )
        : h("p.empty", null, "Aucun raccourci trouvé."),
      this.device ? this.diagram(this.device, mine) : null,
      h("p.sub.credits", null, meta.credits),
    );
  }

  private debounce?: number;
  private renderDebounced() {
    window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      this.render();
      const input = this.body.querySelector<HTMLInputElement>("input.search");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 200);
  }

  private diagram(device: string, binds: Bind[]): HTMLElement {
    const info = deviceInfo(this.meta!, device);
    const title = h("div.device-title", null, h("h2", null, info.label), h("span.sub", null, device !== info.label ? device : ""));
    let drawing: HTMLElement;
    if (info.kind === "keyboard") drawing = this.keyboard(binds);
    else if (info.kind === "gamepad") drawing = this.gamepad(device, binds);
    else drawing = this.board(binds, info.kind === "mouse");
    return h("section.card.diagram", null, title, drawing);
  }

  // ---------------- legend helpers ----------------

  private chips(list: Bind[]): HTMLElement[] {
    const meta = this.meta!;
    return list.map((b) => {
      const g = groupOf(meta, b.action);
      const mod = b.modifiers.length ? `${b.modifiers.map((m) => keyLabel(meta, m.key)).join(" + ")} + ` : "";
      return h(
        `span.act.${groupClass(g)}`,
        { title: `${GROUP_FR[g] ?? g} · ${b.action}${b.slot === "secondary" ? " (secondaire)" : ""}` },
        mod ? h("em", null, mod) : null,
        actionName(meta, b.action),
        b.inverted ? h("small", null, " (inversé)") : null,
      );
    });
  }

  private legendKey(): HTMLElement {
    const used = new Set(this.visible().map((b) => groupOf(this.meta!, b.action)));
    return h("div.legend-key", null, [...used].map((g) => h(`span.act.${groupClass(g)}`, null, GROUP_FR[g] ?? g)));
  }

  // ---------------- keyboard ----------------

  private keyboard(binds: Bind[]): HTMLElement {
    const meta = this.meta!;
    const byKey = new Map<string, Bind[]>();
    for (const b of binds) byKey.set(b.key, [...(byKey.get(b.key) ?? []), b]);
    // Modifier keys used in combos are highlighted too.
    const modKeys = new Set(binds.flatMap((b) => b.modifiers.filter((m) => m.device === "Keyboard").map((m) => m.key)));
    const drawn = new Set<string>();
    const key = (id: string, label: string, w = 1): HTMLElement => {
      drawn.add(id);
      const list = byKey.get(id) ?? [];
      const g = list[0] ? groupOf(meta, list[0].action) : "";
      return h(
        `div.kb-key${list.length ? `.bound.${groupClass(g)}` : ""}${modKeys.has(id) ? ".modkey" : ""}`,
        { style: { flexGrow: String(w), flexBasis: `${w * 44}px` }, title: list.length ? list.map((b) => `${comboLabel(meta, b)} → ${actionName(meta, b.action)}`).join("\n") : label },
        h("span.kb-cap", null, label),
        list.length ? h("span.kb-act", null, actionName(meta, list[0].action)) : null,
        list.length > 1 ? h("span.kb-more", null, `+${list.length - 1}`) : null,
      );
    };
    const gap = () => h("div.kb-gap");
    const letters = keyboardLetters(this.layout);
    const rows: HTMLElement[][] = [
      [key("Key_Escape", "Échap"), gap(), ...[1, 2, 3, 4].map((n) => key(`Key_F${n}`, `F${n}`)), gap(), ...[5, 6, 7, 8].map((n) => key(`Key_F${n}`, `F${n}`)), gap(), ...[9, 10, 11, 12].map((n) => key(`Key_F${n}`, `F${n}`))],
      [key("Key_Grave", letters.grave), ..."1234567890".split("").map((c) => key(`Key_${c}`, c)), key("Key_Minus", "-"), key("Key_Equals", "="), key("Key_Backspace", "⌫", 2)],
      [key("Key_Tab", "Tab", 1.5), ...letters.row1.map((c) => key(`Key_${c}`, c)), key("Key_LeftBracket", "["), key("Key_RightBracket", "]"), key("Key_BackSlash", "\\", 1.5)],
      [key("Key_CapsLock", "Verr. maj", 1.75), ...letters.row2.map((c) => key(`Key_${c}`, c)), key("Key_SemiColon", ";"), key("Key_Apostrophe", "'"), key("Key_Enter", "Entrée", 2.25)],
      [key("Key_LeftShift", "Maj G", 2.25), ...letters.row3.map((c) => key(`Key_${c}`, c)), key("Key_Comma", ","), key("Key_Period", "."), key("Key_Slash", "/"), key("Key_RightShift", "Maj D", 2.75)],
      [key("Key_LeftControl", "Ctrl G", 1.5), key("Key_LeftWin", "Win", 1.25), key("Key_LeftAlt", "Alt", 1.25), key("Key_Space", "Espace", 6.25), key("Key_RightAlt", "Alt Gr", 1.25), key("Key_Apps", "Menu", 1.25), key("Key_RightControl", "Ctrl D", 1.5)],
    ];
    const nav: HTMLElement[][] = [
      [key("Key_PrintScreen", "Impr"), key("Key_ScrollLock", "Arrêt défil"), key("Key_Pause", "Pause")],
      [key("Key_Insert", "Inser"), key("Key_Home", "Début"), key("Key_PageUp", "Pg ↑")],
      [key("Key_Delete", "Suppr"), key("Key_End", "Fin"), key("Key_PageDown", "Pg ↓")],
      [h("div.kb-key.blank"), h("div.kb-key.blank"), h("div.kb-key.blank")],
      [h("div.kb-key.blank"), key("Key_UpArrow", "↑"), h("div.kb-key.blank")],
      [key("Key_LeftArrow", "←"), key("Key_DownArrow", "↓"), key("Key_RightArrow", "→")],
    ];
    const pad: HTMLElement[][] = [
      [h("div.kb-key.blank"), h("div.kb-key.blank"), h("div.kb-key.blank"), h("div.kb-key.blank")],
      [key("Key_NumLock", "Verr num"), key("Key_Numpad_Divide", "/"), key("Key_Numpad_Multiply", "*"), key("Key_Numpad_Subtract", "-")],
      [key("Key_Numpad_7", "7"), key("Key_Numpad_8", "8"), key("Key_Numpad_9", "9"), key("Key_Numpad_Add", "+")],
      [key("Key_Numpad_4", "4"), key("Key_Numpad_5", "5"), key("Key_Numpad_6", "6"), h("div.kb-key.blank")],
      [key("Key_Numpad_1", "1"), key("Key_Numpad_2", "2"), key("Key_Numpad_3", "3"), key("Key_Numpad_Enter", "Entrée")],
      [key("Key_Numpad_0", "0", 2), key("Key_Numpad_Decimal", ".")],
    ];
    const block = (rs: HTMLElement[][], cls: string) => h(`div.kb-block.${cls}`, null, rs.map((r) => h("div.kb-row", null, r)));
    const others = binds.filter((b) => !drawn.has(b.key));
    return h(
      "div",
      null,
      h("div.kb", null, block(rows, "main"), block(nav, "nav"), block(pad, "numpad")),
      this.legendKey(),
      others.length ? h("p.sub", null, `Touches hors schéma : ${[...new Set(others.map((b) => keyLabel(meta, b.key)))].join(", ")}`) : null,
      this.legendTable(binds),
    );
  }

  private legendTable(binds: Bind[]): HTMLElement {
    const meta = this.meta!;
    const byCombo = new Map<string, Bind[]>();
    for (const b of binds) {
      const k = comboLabel(meta, b);
      byCombo.set(k, [...(byCombo.get(k) ?? []), b]);
    }
    const rows = [...byCombo.entries()].sort(([a], [b]) => a.localeCompare(b, "fr", { numeric: true }));
    return h("div.legend-grid", null, rows.map(([combo, list]) => h("div.legend-row", null, h("kbd", null, combo), h("div.acts", null, this.chips(list)))));
  }

  // ---------------- gamepad ----------------

  private gamepad(device: string, binds: Bind[]): HTMLElement {
    const ps = device === "DualShock4" || device === "Playstation3Controller";
    const label: Record<string, string> = ps
      ? { A: "✕", B: "○", X: "□", Y: "△", LBumper: "L1", RBumper: "R1", LTrigger: "L2", RTrigger: "R2", Back: "Share", Start: "Options", LThumb: "L3", RThumb: "R3", Guide: "PS", Touchpad: "Pavé tactile" }
      : { A: "A", B: "B", X: "X", Y: "Y", LBumper: "LB", RBumper: "RB", LTrigger: "LT", RTrigger: "RT", Back: "View / Back", Start: "Menu / Start", LThumb: "L3 (clic stick G)", RThumb: "R3 (clic stick D)", Guide: "Guide", Touchpad: "Pavé" };
    Object.assign(label, { DPadUp: "Croix ↑", DPadDown: "Croix ↓", DPadLeft: "Croix ←", DPadRight: "Croix →", LStickX: "Stick G ↔", LStickY: "Stick G ↕", RStickX: "Stick D ↔", RStickY: "Stick D ↕" });
    const POS: Record<string, [number, number]> = {
      LTrigger: [200, 38], RTrigger: [560, 38], LBumper: [200, 82], RBumper: [560, 82],
      LStickX: [178, 170], LStickY: [230, 222], LThumb: [230, 170],
      RStickX: [408, 250], RStickY: [460, 302], RThumb: [460, 250],
      DPadUp: [300, 220], DPadDown: [300, 280], DPadLeft: [270, 250], DPadRight: [330, 250],
      Y: [540, 132], X: [503, 170], B: [577, 170], A: [540, 208],
      Back: [335, 150], Start: [425, 150], Guide: [380, 118], Touchpad: [380, 185],
    };
    const byControl = new Map<string, Bind[]>();
    const unknown: Bind[] = [];
    for (const b of binds) {
      const c = padControl(device, b.key)?.replace(/[+-]$/, "");
      if (c && POS[c]) byControl.set(c, [...(byControl.get(c) ?? []), b]);
      else unknown.push(b);
    }
    const order = Object.keys(POS).filter((c) => byControl.has(c));
    const num = new Map(order.map((c, i) => [c, i + 1]));

    const NS = "http://www.w3.org/2000/svg";
    const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const svg = el("svg", { viewBox: "0 0 760 380", class: "pad-svg", role: "img", "aria-label": "Schéma de la manette" });
    // Body.
    svg.append(
      el("path", { class: "pad-body", d: "M210 95 Q380 70 550 95 Q640 105 670 190 L700 300 Q712 352 660 360 Q615 366 585 320 L545 270 Q380 262 215 270 L175 320 Q145 366 100 360 Q48 352 60 300 L90 190 Q120 105 210 95 Z" }),
      el("rect", { class: "pad-part", x: 165, y: 26, width: 70, height: 26, rx: 10 }),
      el("rect", { class: "pad-part", x: 525, y: 26, width: 70, height: 26, rx: 10 }),
      el("rect", { class: "pad-part", x: 160, y: 72, width: 80, height: 20, rx: 9 }),
      el("rect", { class: "pad-part", x: 520, y: 72, width: 80, height: 20, rx: 9 }),
      el("circle", { class: "pad-part", cx: 230, cy: 170, r: 36 }),
      el("circle", { class: "pad-part", cx: 460, cy: 250, r: 36 }),
      el("path", { class: "pad-part", d: "M288 208h24v30h30v24h-30v30h-24v-30h-30v-24h30z" }),
      ...["Y", "X", "B", "A"].map((k) => el("circle", { class: "pad-part", cx: POS[k][0], cy: POS[k][1], r: 17 })),
      el("rect", { class: "pad-part", x: 320, y: 140, width: 30, height: 20, rx: 8 }),
      el("rect", { class: "pad-part", x: 410, y: 140, width: 30, height: 20, rx: 8 }),
      el("circle", { class: "pad-part", cx: 380, cy: 118, r: 14 }),
    );
    for (const k of ["Y", "X", "B", "A"]) svg.append(el("text", { class: "pad-face", x: POS[k][0], y: POS[k][1] + 5 }, label[k]));
    for (const c of order) {
      const [x, y] = POS[c];
      const g = groupOf(this.meta!, byControl.get(c)![0].action);
      svg.append(el("circle", { class: `pad-marker ${groupClass(g)}`, cx: x, cy: y, r: 13 }), el("text", { class: "pad-num", x, y: y + 4.5 }, String(num.get(c))));
    }
    return h(
      "div",
      null,
      h("div.pad-wrap", null, svg),
      this.legendKey(),
      h(
        "div.legend-grid",
        null,
        order.map((c) => h("div.legend-row", null, h("kbd.num", null, h("b", null, String(num.get(c))), ` ${label[c] ?? c}`), h("div.acts", null, this.chips(byControl.get(c)!)))),
        unknown.length ? h("div.legend-row", null, h("kbd", null, "Autres"), h("div.acts", null, this.chips(unknown))) : null,
      ),
    );
  }

  // ---------------- joystick / HOTAS / mouse ----------------

  private board(binds: Bind[], mouse: boolean): HTMLElement {
    const meta = this.meta!;
    const axes = new Map<string, Bind[]>();
    const hats = new Map<string, Map<string, Bind[]>>();
    const buttons = new Map<string, Bind[]>();
    for (const b of binds) {
      const k = b.key.replace(/^(Pos|Neg)_/, "");
      const pov = /^Joy_POV(\d)(Up|Down|Left|Right)$/.exec(k);
      if (pov) {
        const m = hats.get(pov[1]) ?? new Map<string, Bind[]>();
        m.set(pov[2], [...(m.get(pov[2]) ?? []), b]);
        hats.set(pov[1], m);
      } else if (/Axis$/.test(k)) axes.set(k, [...(axes.get(k) ?? []), b]);
      else buttons.set(b.key, [...(buttons.get(b.key) ?? []), b]);
    }
    const n = (k: string) => Number(/(\d+)$/.exec(k)?.[1] ?? 999);
    const tile = (label: string, list: Bind[]) => {
      const g = groupOf(meta, list[0].action);
      return h(`div.btn-tile.${groupClass(g)}`, null, h("span.btn-label", null, label), h("div.acts", null, this.chips(list)));
    };
    return h(
      "div",
      null,
      this.legendKey(),
      axes.size
        ? h("div.board-section", null, h("h4", null, mouse ? "Axes et molette" : "Axes"), h("div.axis-list", null, [...axes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => h("div.axis-row", null, h("span.axis-name", null, keyLabel(meta, k)), h("span.axis-bar", null, h("span")), h("div.acts", null, this.chips(list))))))
        : null,
      hats.size
        ? h(
            "div.board-section",
            null,
            h("h4", null, "Chapeaux (POV)"),
            h(
              "div.hat-list",
              null,
              [...hats.entries()].map(([id, dirs]) => {
                const cell = (d: string, arrow: string) => {
                  const list = dirs.get(d);
                  return h(`div.hat-cell.${d.toLowerCase()}${list ? ".bound" : ""}`, null, h("span.btn-label", null, arrow), list ? h("div.acts", null, this.chips(list)) : null);
                };
                return h("div.hat", null, h("span.hat-title", null, `Chapeau ${id}`), cell("Up", "↑"), cell("Left", "←"), h("div.hat-center"), cell("Right", "→"), cell("Down", "↓"));
              }),
            ),
          )
        : null,
      buttons.size
        ? h("div.board-section", null, h("h4", null, "Boutons"), h("div.btn-grid", null, [...buttons.entries()].sort(([a], [b]) => n(a) - n(b)).map(([k, list]) => tile(keyLabel(meta, k), list))))
        : null,
    );
  }
}

function rank(meta: BindsMeta, device: string): number {
  const kind = deviceInfo(meta, device).kind;
  return { joystick: 0, gamepad: 1, keyboard: 2, mouse: 3, vr: 4 }[kind];
}

/** Letter rows for the common layouts (Elite names keys after the layout's printed letters). */
function keyboardLetters(layout: string): { grave: string; row1: string[]; row2: string[]; row3: string[] } {
  const l = layout.toLowerCase();
  if (l.startsWith("fr")) return { grave: "²", row1: "AZERTYUIOP".split(""), row2: "QSDFGHJKLM".split(""), row3: "WXCVBN".split("") };
  if (l.startsWith("de")) return { grave: "^", row1: "QWERTZUIOP".split(""), row2: "ASDFGHJKL".split(""), row3: "YXCVBNM".split("") };
  return { grave: "`", row1: "QWERTYUIOP".split(""), row2: "ASDFGHJKL".split(""), row3: "ZXCVBNM".split("") };
}
