import {
  exportConfig,
  importConfig,
  isTauri,
  listOptionFiles,
  readOptionFile,
  revealPath,
  type OptionFile,
} from "../../platform/bridge.js";
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
  templateBox,
  type Bind,
  type BindsMeta,
  type DeviceTemplate,
} from "../../features/controls/binds.js";
import { h, icon, replace, toast } from "../../ui/dom.js";
import { fold, gameText, lang, t } from "../../platform/i18n.js";
import type { Ctx, View } from "../../state/context.js";
import { DEMO_BINDS } from "../../game/demo.js";

const GROUP_FR: Record<string, string> = {
  Ship: t("common.ship"),
  Fighter: t("controls.fighter"),
  Scanners: t("common.scanners"),
  Multicrew: t("controls.multicrew"),
  SRV: "SRV",
  OnFoot: t("common.foot"),
  "Holo-Me": "Holo-Me",
  "Galaxy map": t("controls.galaxyMap"),
  UI: t("controls.interface"),
  Camera: t("controls.camera"),
  "Head look": t("controls.headLook"),
  Misc: t("controls.misc"),
};
const MODES: [string, string, string[] | null][] = [
  ["all", t("controls.all"), null],
  ["ship", t("common.ship"), ["Ship", "Fighter", "Scanners", "Multicrew"]],
  ["srv", "SRV", ["SRV"]],
  ["foot", t("common.foot"), ["OnFoot", "Holo-Me"]],
  ["ui", t("controls.mapsUi"), ["Galaxy map", "UI", "Camera", "Head look", "Misc"]],
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
  /** Per device: chosen template id ("" = none / simple diagram). */
  private tplChoice: Record<string, string> = (() => {
    try {
      return JSON.parse(localStorage.getItem("edch.templates") ?? "{}");
    } catch {
      return {};
    }
  })();
  private mode = "all";
  private query = "";
  private body = h("div.controls-body");
  private backupOut = h("div.backup-out");

  constructor(private ctx: Ctx) {}

  async mount(root: HTMLElement) {
    replace(
      root,
      h("header.view-head", null, h("h1", null, t("controls.controlsDevices"))),
      this.backupCard(),
      this.body,
    );
    replace(this.body, h("p.sub", null, h("span.spinner"), " " + t("controls.readingBindings")));
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
      this.note = t("controls.demoModeSampleBindings");
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
    const startName =
      names.find((n) => n.toLowerCase() === "startpreset.4.start") ??
      names.find((n) => n.toLowerCase().startsWith("startpreset") && n.endsWith(".start"));
    const lines = startName ? parseStartPreset(await readOptionFile("Bindings", startName)) : [];
    this.presets = lines;
    const parsed = new Map<string, ReturnType<typeof parseBinds> | null>();
    for (const p of new Set(lines)) {
      const file = fileForPreset(p, names);
      parsed.set(p, file ? parseBinds(await readOptionFile("Bindings", file)) : null);
    }
    const missing = [...parsed.entries()].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) this.note = t("controls.builtGamePresetSNotCopied", { value: missing.join(", ") });
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
      this.note = t("controls.noActivePresetFoundStartpresetPick");
    }
    this.render();
  }

  // ---------------- backup card ----------------

  private backupCard(): HTMLElement {
    const doExport = async (graphics: boolean) => {
      try {
        const path = await exportConfig(graphics);
        replace(
          this.backupOut,
          h(
            "p",
            null,
            icon("check"),
            " " + t("controls.exported") + " ",
            h("code", null, path),
            " ",
            h("button.ghost.small", { onclick: () => revealPath(path) }, t("controls.showExplorer")),
          ),
        );
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
            h(
              "p",
              null,
              icon("check"),
              " " + t("controls.filesRestored", { count: report.written.length }) + " ",
              h("code", null, report.backup),
              " ",
              h("button.ghost.small", { onclick: () => revealPath(report.backup) }, t("controls.show")),
            ),
            h("p.sub", null, report.written.join(" · ")),
            report.skipped.length
              ? h("p.sub", null, t("controls.skipped", { value: report.skipped.join(", ") }))
              : null,
            h("p.notice", null, icon("warn"), " " + t("controls.restartEliteDangerousOpenOptionsControls")),
          );
          toast(t("controls.configurationImported"));
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
      h(
        "div",
        null,
        h("h3", null, t("controls.backUpRestoreConfiguration")),
        h("p.sub", null, t("controls.exportsBindingsGraphicsSettingsZipDocuments")),
      ),
      h(
        "div.row",
        null,
        h("button.primary", { onclick: () => doExport(false) }, t("controls.exportBindings")),
        h("button.ghost", { onclick: () => doExport(true) }, t("controls.bindingsGraphics")),
        h("label.file-btn", null, t("controls.importZip"), file),
      ),
      this.backupOut,
    );
  }

  // ---------------- main render ----------------

  private visible(): Bind[] {
    const meta = this.meta!;
    const groups = MODES.find(([m]) => m === this.mode)?.[2];
    // Searched in English and in the language shown, accents and case ignored.
    const q = fold(this.query);
    return this.binds.filter((b) => {
      const g = groupOf(meta, b.action);
      if (groups && !groups.includes(g)) return false;
      if (!q) return true;
      const name = actionName(meta, b.action);
      const combo = comboLabel(meta, b);
      return [name, gameText(name), combo, gameText(combo), b.action, GROUP_FR[g] ?? g].some((candidate) =>
        fold(candidate).includes(q),
      );
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
          h("option", { value: "", selected: !this.chosen }, t("controls.activePreset")),
          this.files
            .filter((f) => f.name.endsWith(".binds"))
            .map((f) => h("option", { value: f.name, selected: f.name === this.chosen }, f.name)),
        )
      : null;

    replace(
      this.body,
      h(
        "div.controls-bar",
        null,
        h(
          "div",
          null,
          h("strong", null, this.presets.length ? [...new Set(this.presets)].join(" / ") : "—"),
          h("span.sub", null, " " + t("controls.bindingsKeyboard", { count: this.binds.length, layout: this.layout })),
        ),
        fileSelect,
        h(
          "div.segmented",
          null,
          MODES.map(([m, l]) =>
            h("button", { class: this.mode === m ? "active" : "", onclick: () => ((this.mode = m), this.render()) }, l),
          ),
        ),
        h(
          "label.search-wrap",
          null,
          icon("search"),
          h("input.search", {
            type: "search",
            placeholder: t("controls.searchControl"),
            value: this.query,
            oninput: (e: Event) => ((this.query = (e.target as HTMLInputElement).value), this.renderDebounced()),
          }),
        ),
        h("button.ghost", { onclick: () => window.print() }, t("controls.printSheet")),
      ),
      this.note ? h("p.notice", null, icon("warn"), ` ${this.note}`) : null,
      devices.length
        ? h(
            "div.device-tabs",
            null,
            devices.map((d) => {
              const info = deviceInfo(meta, d);
              const count = binds.filter((b) => b.device === d).length;
              return h(
                "button",
                { class: d === this.device ? "active" : "", onclick: () => ((this.device = d), this.render()) },
                h("span", null, info.label),
                h("small", null, ` ${count}`),
              );
            }),
          )
        : h("p.empty", null, t("controls.noBindingsFound")),
      this.device ? this.diagram(this.device, mine) : null,
      h("p.sub.credits", null, t("controls.credits")),
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
    const meta = this.meta!;
    const info = deviceInfo(meta, device);
    const tplId = device in this.tplChoice ? this.tplChoice[device] : meta.templates[device] ? device : "";
    const tpl = tplId ? meta.templates[tplId] : undefined;
    const choose = (id: string) => {
      this.tplChoice[device] = id;
      try {
        localStorage.setItem("edch.templates", JSON.stringify(this.tplChoice));
      } catch {
        /* per-viewer convenience only */
      }
      this.render();
    };
    const options = Object.entries(meta.templates)
      .filter(
        ([id, template], i, all) =>
          all.findIndex(([, u]) => u.image === template.image && u.name === template.name) === i && id,
      )
      .sort(([, a], [, b]) => a.name.localeCompare(b.name));
    const picker =
      info.kind === "keyboard" || info.kind === "mouse"
        ? null
        : h(
            "label.tpl-picker",
            { title: t("controls.modelIsnTRecognisedPickClosest") },
            t("controls.template") + " ",
            h(
              "select",
              { onchange: (e: Event) => choose((e.target as HTMLSelectElement).value) },
              h("option", { value: "", selected: !tplId }, t("controls.simpleDiagramNoPicture")),
              options.map(([id, template]) => h("option", { value: id, selected: id === tplId }, template.name)),
            ),
          );
    const title = h(
      "div.device-title",
      null,
      h("h2", null, tpl && !meta.devices[device] ? tpl.name : info.label),
      h("span.sub", null, device !== info.label ? device : ""),
      picker,
    );
    let drawing: HTMLElement;
    if (info.kind === "keyboard") drawing = this.keyboard(binds);
    else if (tpl) drawing = this.templateView(device, tpl, binds, info.kind === "gamepad");
    else if (info.kind === "gamepad") drawing = this.gamepad(device, binds);
    else drawing = this.board(binds, info.kind === "mouse");
    return h("section.card.diagram", null, title, drawing);
  }

  /** EDRefCard picture of the device with each control's actions written in its box. */
  private templateView(device: string, tpl: DeviceTemplate, binds: Bind[], gamepad: boolean): HTMLElement {
    const meta = this.meta!;
    const [w, hgt] = tpl.size;
    const placed = new Map<string, Bind[]>();
    const unplaced: Bind[] = [];
    for (const b of binds) {
      const box = templateBox(tpl, device, b.key);
      if (box) placed.set(box, [...(placed.get(box) ?? []), b]);
      else unplaced.push(b);
    }
    const fallback = () => (gamepad ? this.gamepad(device, binds) : this.board(binds, false));
    const img = h("img.tpl-img", {
      src: `${meta.templateBase}${tpl.image}.jpg`,
      alt: tpl.name,
      onerror: () => {
        stage.replaceWith(
          h(
            "div",
            null,
            h("p.notice", null, icon("warn"), " " + t("controls.templatePictureUnavailableOfflineShowingSimple")),
            fallback(),
          ),
        );
      },
    });
    const boxes = [...placed.entries()].map(([key, list]) => {
      const [x, y, bw, bh] = tpl.boxes[key];
      const g = groupOf(meta, list[0].action);
      const text = list
        .map(
          (b) =>
            `${b.modifiers.length ? `${b.modifiers.map((m) => keyLabel(meta, m.key)).join("+")}+` : ""}${actionName(meta, b.action)}${b.inverted ? " (inv.)" : ""}`,
        )
        .join(" · ");
      return h(
        `div.tpl-box.${groupClass(g)}`,
        {
          title: `${keyLabel(meta, key)} : ${text}`,
          style: {
            left: `${(x / w) * 100}%`,
            top: `${(y / hgt) * 100}%`,
            width: `${(bw / w) * 100}%`,
            height: `${(bh / hgt) * 100}%`,
            fontSize: `${Math.min(0.95, (bh / w) * 100 * (list.length > 1 ? 0.4 : 0.62))}cqw`,
          },
        },
        text,
      );
    });
    const stage = h("div.tpl-stage", { style: { aspectRatio: `${w} / ${hgt}` } }, img, boxes);
    const scroller = h("div.tpl-scroll", null, stage);
    return h(
      "div",
      null,
      h(
        "div.row",
        null,
        h(
          "button.ghost.small",
          { onclick: () => scroller.classList.toggle("zoom") },
          icon("search"),
          " " + t("controls.zoomOut"),
        ),
      ),
      scroller,
      h("p.sub.credits", null, t("controls.edrefcardTemplateMitPictureLoadedFrom")),
      this.legendKey(),
      unplaced.length
        ? h("div", null, h("h4.sub", null, t("controls.noBoxTemplate")), this.legendTable(unplaced))
        : null,
    );
  }

  // ---------------- legend helpers ----------------

  private chips(list: Bind[]): HTMLElement[] {
    const meta = this.meta!;
    return list.map((b) => {
      const g = groupOf(meta, b.action);
      const mod = b.modifiers.length ? `${b.modifiers.map((m) => keyLabel(meta, m.key)).join(" + ")} + ` : "";
      return h(
        `span.act.${groupClass(g)}`,
        { title: `${GROUP_FR[g] ?? g} · ${b.action}${b.slot === "secondary" ? ` (${t("controls.secondary")})` : ""}` },
        mod ? h("em", null, mod) : null,
        actionName(meta, b.action),
        b.inverted ? h("small", null, " " + t("controls.inverted")) : null,
      );
    });
  }

  private legendKey(): HTMLElement {
    const used = new Set(this.visible().map((b) => groupOf(this.meta!, b.action)));
    return h(
      "div.legend-key",
      null,
      [...used].map((g) => h(`span.act.${groupClass(g)}`, null, GROUP_FR[g] ?? g)),
    );
  }

  // ---------------- keyboard ----------------

  private keyboard(binds: Bind[]): HTMLElement {
    const meta = this.meta!;
    const byKey = new Map<string, Bind[]>();
    for (const b of binds) byKey.set(b.key, [...(byKey.get(b.key) ?? []), b]);
    // Modifier keys used in combos are highlighted too.
    const modKeys = new Set(binds.flatMap((b) => b.modifiers.filter((m) => m.device === "Keyboard").map((m) => m.key)));
    const drawn = new Set<string>();
    /** A key; `ids` are the names the game may give it (the first that is bound wins the colour). */
    const key = (ids: string | string[], label: string, w = 1, tail = false): HTMLElement => {
      const all = Array.isArray(ids) ? ids : [ids];
      for (const id of all) drawn.add(id);
      const list = all.flatMap((id) => byKey.get(id) ?? []);
      const g = list[0] ? groupOf(meta, list[0].action) : "";
      return h(
        `div.kb-key${list.length ? `.bound.${groupClass(g)}` : ""}${all.some((id) => modKeys.has(id)) ? ".modkey" : ""}${tail ? ".enter-tail" : ""}`,
        {
          style: { flexGrow: String(w), flexBasis: `${w * 44}px` },
          title: list.length
            ? list.map((b) => `${comboLabel(meta, b)} → ${actionName(meta, b.action)}`).join("\n")
            : label,
        },
        tail ? null : h("span.kb-cap", null, label),
        list.length && !tail ? h("span.kb-act", null, actionName(meta, list[0].action)) : null,
        list.length > 1 && !tail ? h("span.kb-more", null, `+${list.length - 1}`) : null,
      );
    };
    const gap = () => h("div.kb-gap");
    // Where each key is: the game names keys after the layout written in the bindings file;
    // the labels are those of the keyboard chosen here (by default, the same one).
    const ids = KEY_IDS[layoutFamily(this.layout)];
    const kb = this.keyboardChoice();
    const caps = KEY_CAPS[kb.layout];
    const iso = kb.format === "iso";
    const at = (row: Id[], cap: string[]) => row.map((id, i) => key(id, cap[i] ?? ""));
    const rows: HTMLElement[][] = [
      [
        key("Key_Escape", t("controls.esc")),
        gap(),
        ...[1, 2, 3, 4].map((n) => key(`Key_F${n}`, `F${n}`)),
        gap(),
        ...[5, 6, 7, 8].map((n) => key(`Key_F${n}`, `F${n}`)),
        gap(),
        ...[9, 10, 11, 12].map((n) => key(`Key_F${n}`, `F${n}`)),
      ],
      [...at(ids.num, caps.num), key("Key_Backspace", "⌫", 2)],
      iso
        ? [key("Key_Tab", "Tab", 1.5), ...at(ids.r1, caps.r1), key("Key_Enter", t("controls.enter"), 1.5)]
        : [key("Key_Tab", "Tab", 1.5), ...at(ids.r1, caps.r1), key(ids.extra, caps.extra, 1.5)],
      iso
        ? [
            key("Key_CapsLock", t("controls.capsLock"), 1.75),
            ...at(ids.r2, caps.r2),
            key(ids.extra, caps.extra),
            key("Key_Enter", "", 1.25, true),
          ]
        : [
            key("Key_CapsLock", t("controls.capsLock"), 1.75),
            ...at(ids.r2, caps.r2),
            key("Key_Enter", t("controls.enter"), 2.25),
          ],
      iso
        ? [
            key("Key_LeftShift", t("controls.lShift"), 1.25),
            key(ids.iso, caps.iso),
            ...at(ids.r3, caps.r3),
            key("Key_RightShift", t("controls.rShift"), 2.75),
          ]
        : [
            key("Key_LeftShift", t("controls.lShift"), 2.25),
            ...at(ids.r3, caps.r3),
            key("Key_RightShift", t("controls.rShift"), 2.75),
          ],
      [
        key("Key_LeftControl", t("controls.lCtrl"), 1.5),
        key("Key_LeftWin", "Win", 1.25),
        key("Key_LeftAlt", "Alt", 1.25),
        key("Key_Space", t("controls.space"), 6.25),
        key("Key_RightAlt", "Alt Gr", 1.25),
        key("Key_Apps", "Menu", 1.25),
        key("Key_RightControl", t("controls.rCtrl"), 1.5),
      ],
    ];
    const nav: HTMLElement[][] = [
      [
        key("Key_PrintScreen", t("controls.prtsc")),
        key("Key_ScrollLock", t("controls.scrollLock")),
        key("Key_Pause", "Pause"),
      ],
      [key("Key_Insert", t("controls.ins")), key("Key_Home", t("controls.home")), key("Key_PageUp", "Pg ↑")],
      [key("Key_Delete", t("controls.del")), key("Key_End", t("common.end")), key("Key_PageDown", "Pg ↓")],
      [h("div.kb-key.blank"), h("div.kb-key.blank"), h("div.kb-key.blank")],
      [h("div.kb-key.blank"), key("Key_UpArrow", "↑"), h("div.kb-key.blank")],
      [key("Key_LeftArrow", "←"), key("Key_DownArrow", "↓"), key("Key_RightArrow", "→")],
    ];
    const pad: HTMLElement[][] = [
      [h("div.kb-key.blank"), h("div.kb-key.blank"), h("div.kb-key.blank"), h("div.kb-key.blank")],
      [
        key("Key_NumLock", t("controls.numLock")),
        key("Key_Numpad_Divide", "/"),
        key("Key_Numpad_Multiply", "*"),
        key("Key_Numpad_Subtract", "-"),
      ],
      [key("Key_Numpad_7", "7"), key("Key_Numpad_8", "8"), key("Key_Numpad_9", "9"), key("Key_Numpad_Add", "+")],
      [key("Key_Numpad_4", "4"), key("Key_Numpad_5", "5"), key("Key_Numpad_6", "6"), h("div.kb-key.blank")],
      [
        key("Key_Numpad_1", "1"),
        key("Key_Numpad_2", "2"),
        key("Key_Numpad_3", "3"),
        key("Key_Numpad_Enter", t("controls.enter")),
      ],
      [key("Key_Numpad_0", "0", 2), key("Key_Numpad_Decimal", ".")],
    ];
    const block = (rs: HTMLElement[][], cls: string) =>
      h(
        `div.kb-block.${cls}`,
        null,
        rs.map((r) => h("div.kb-row", null, r)),
      );
    const others = binds.filter((b) => !drawn.has(b.key));
    return h(
      "div",
      null,
      this.keyboardSwitches(),
      h("div.kb", null, block(rows, "main"), block(nav, "nav"), block(pad, "numpad")),
      this.legendKey(),
      others.length
        ? h(
            "p.sub",
            null,
            t("controls.keysNotDiagram", { value: [...new Set(others.map((b) => keyLabel(meta, b.key)))].join(", ") }),
          )
        : null,
      this.legendTable(binds),
    );
  }

  /** The keyboard to draw: chosen in EDCH, or guessed from the bindings file. */
  private keyboardChoice(): { layout: Family; format: "iso" | "ansi" } {
    const s = this.ctx.store.state.settings;
    // Until one is chosen here: the usual keyboard for the app's language.
    const code = lang().code;
    const layout =
      s.kbLayout === "auto" ? (code === "fr" ? "azerty" : code === "de" ? "qwertz" : "qwerty") : s.kbLayout;
    // ANSI is the US keyboard (most English-speaking players); the rest of the world mostly uses ISO.
    const format = s.kbFormat === "auto" ? (code === "en" ? "ansi" : "iso") : s.kbFormat;
    return { layout, format };
  }

  private keyboardSwitches(): HTMLElement {
    const kb = this.keyboardChoice();
    const seg = <T extends string>(value: T, options: [T, string][], set: (v: T) => void) =>
      h(
        "div.segmented.small",
        null,
        options.map(([v, l]) =>
          h("button", { class: value === v ? "active" : "", onclick: () => (set(v), this.render()) }, l),
        ),
      );
    return h(
      "div.kb-switches",
      null,
      h("span.sub", null, t("controls.myKeyboard")),
      seg(
        kb.layout,
        [
          ["azerty", "AZERTY"],
          ["qwerty", "QWERTY"],
          ["qwertz", "QWERTZ"],
        ],
        (v) => this.ctx.store.updateSettings({ kbLayout: v }),
      ),
      seg(
        kb.format,
        [
          ["iso", "ISO"],
          ["ansi", "ANSI"],
        ],
        (v) => this.ctx.store.updateSettings({ kbFormat: v }),
      ),
      h(
        "span.sub",
        { title: t("controls.isoLShapedEnterKeyOne") },
        t("controls.bindingsSavedKeyboard", { layout: this.layout }),
      ),
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
    return h(
      "div.legend-grid",
      null,
      rows.map(([combo, list]) =>
        h("div.legend-row", null, h("kbd", null, combo), h("div.acts", null, this.chips(list))),
      ),
    );
  }

  // ---------------- gamepad ----------------

  private gamepad(device: string, binds: Bind[]): HTMLElement {
    const ps = device === "DualShock4" || device === "Playstation3Controller";
    const label: Record<string, string> = ps
      ? {
          A: "✕",
          B: "○",
          X: "□",
          Y: "△",
          LBumper: "L1",
          RBumper: "R1",
          LTrigger: "L2",
          RTrigger: "R2",
          Back: "Share",
          Start: "Options",
          LThumb: "L3",
          RThumb: "R3",
          Guide: "PS",
          Touchpad: t("controls.touchpad"),
        }
      : {
          A: "A",
          B: "B",
          X: "X",
          Y: "Y",
          LBumper: "LB",
          RBumper: "RB",
          LTrigger: "LT",
          RTrigger: "RT",
          Back: "View / Back",
          Start: "Menu / Start",
          LThumb: t("controls.l3LeftStickClick"),
          RThumb: t("controls.r3RightStickClick"),
          Guide: "Guide",
          Touchpad: t("controls.pad"),
        };
    Object.assign(label, {
      DPadUp: t("controls.dPad2"),
      DPadDown: t("controls.dPad4"),
      DPadLeft: t("controls.dPad"),
      DPadRight: t("controls.dPad3"),
      LStickX: t("controls.leftStick"),
      LStickY: t("controls.leftStick2"),
      RStickX: t("controls.rightStick"),
      RStickY: t("controls.rightStick2"),
    });
    const POS: Record<string, [number, number]> = {
      LTrigger: [200, 38],
      RTrigger: [560, 38],
      LBumper: [200, 82],
      RBumper: [560, 82],
      LStickX: [178, 170],
      LStickY: [230, 222],
      LThumb: [230, 170],
      RStickX: [408, 250],
      RStickY: [460, 302],
      RThumb: [460, 250],
      DPadUp: [300, 220],
      DPadDown: [300, 280],
      DPadLeft: [270, 250],
      DPadRight: [330, 250],
      Y: [540, 132],
      X: [503, 170],
      B: [577, 170],
      A: [540, 208],
      Back: [335, 150],
      Start: [425, 150],
      Guide: [380, 118],
      Touchpad: [380, 185],
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
    const svg = el("svg", {
      viewBox: "0 0 760 380",
      class: "pad-svg",
      role: "img",
      "aria-label": t("controls.gamepadDiagram"),
    });
    // Body.
    svg.append(
      el("path", {
        class: "pad-body",
        d: "M210 95 Q380 70 550 95 Q640 105 670 190 L700 300 Q712 352 660 360 Q615 366 585 320 L545 270 Q380 262 215 270 L175 320 Q145 366 100 360 Q48 352 60 300 L90 190 Q120 105 210 95 Z",
      }),
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
    for (const k of ["Y", "X", "B", "A"])
      svg.append(el("text", { class: "pad-face", x: POS[k][0], y: POS[k][1] + 5 }, label[k]));
    for (const c of order) {
      const [x, y] = POS[c];
      const g = groupOf(this.meta!, byControl.get(c)![0].action);
      svg.append(
        el("circle", { class: `pad-marker ${groupClass(g)}`, cx: x, cy: y, r: 13 }),
        el("text", { class: "pad-num", x, y: y + 4.5 }, String(num.get(c))),
      );
    }
    return h(
      "div",
      null,
      h("div.pad-wrap", null, svg),
      this.legendKey(),
      h(
        "div.legend-grid",
        null,
        order.map((c) =>
          h(
            "div.legend-row",
            null,
            h("kbd.num", null, h("b", null, String(num.get(c))), ` ${label[c] ?? c}`),
            h("div.acts", null, this.chips(byControl.get(c)!)),
          ),
        ),
        unknown.length
          ? h("div.legend-row", null, h("kbd", null, t("controls.other")), h("div.acts", null, this.chips(unknown)))
          : null,
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
      return h(
        `div.btn-tile.${groupClass(g)}`,
        null,
        h("span.btn-label", null, label),
        h("div.acts", null, this.chips(list)),
      );
    };
    return h(
      "div",
      null,
      this.legendKey(),
      axes.size
        ? h(
            "div.board-section",
            null,
            h("h4", null, mouse ? t("controls.axesWheel") : t("controls.axes")),
            h(
              "div.axis-list",
              null,
              [...axes.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, list]) =>
                  h(
                    "div.axis-row",
                    null,
                    h("span.axis-name", null, keyLabel(meta, k)),
                    h("span.axis-bar", null, h("span")),
                    h("div.acts", null, this.chips(list)),
                  ),
                ),
            ),
          )
        : null,
      hats.size
        ? h(
            "div.board-section",
            null,
            h("h4", null, t("controls.hatsPov")),
            h(
              "div.hat-list",
              null,
              [...hats.entries()].map(([id, dirs]) => {
                const cell = (d: string, arrow: string) => {
                  const list = dirs.get(d);
                  return h(
                    `div.hat-cell.${d.toLowerCase()}${list ? ".bound" : ""}`,
                    null,
                    h("span.btn-label", null, arrow),
                    list ? h("div.acts", null, this.chips(list)) : null,
                  );
                };
                return h(
                  "div.hat",
                  null,
                  h("span.hat-title", null, t("controls.hat", { id })),
                  cell("Up", "↑"),
                  cell("Left", "←"),
                  h("div.hat-center"),
                  cell("Right", "→"),
                  cell("Down", "↓"),
                );
              }),
            ),
          )
        : null,
      buttons.size
        ? h(
            "div.board-section",
            null,
            h("h4", null, t("controls.buttons")),
            h(
              "div.btn-grid",
              null,
              [...buttons.entries()].sort(([a], [b]) => n(a) - n(b)).map(([k, list]) => tile(keyLabel(meta, k), list)),
            ),
          )
        : null,
    );
  }
}

function rank(meta: BindsMeta, device: string): number {
  const kind = deviceInfo(meta, device).kind;
  return { joystick: 0, gamepad: 1, keyboard: 2, mouse: 3, vr: 4 }[kind];
}

/** Letter rows for the common layouts (Elite names keys after the layout's printed letters). */
type Family = "qwerty" | "azerty" | "qwertz";
type Id = string | string[];
interface KeyRows<T> {
  num: T[];
  r1: T[];
  r2: T[];
  r3: T[];
  /** ANSI: the key at the end of the Q row; ISO: the key left of Enter. */
  extra: T;
  /** ISO only: the key between left Shift and the first letter. */
  iso: T;
}

/** The keyboard family of a layout code from the bindings file (fr-FR, de-DE, en-GB…). */
export function layoutFamily(layout: string): Family {
  const l = layout.toLowerCase();
  if (/^(de|cs|sk|hu|sl|hr|bs|sr-latn|sq)\b|-ch$/.test(l)) return "qwertz";
  if (/^(fr|nl-be)\b/.test(l)) return "azerty";
  return "qwerty";
}

const letters = (s: string) => s.split("").map((c) => `Key_${c}`);
const digits = "1234567890".split("").map((c) => `Key_${c}`);

/**
 * The names the game gives the keys, position by position, for each family of layouts. Letters
 * follow the layout; for the other keys the usual name comes first, then the alternatives some
 * layouts use.
 */
const KEY_IDS: Record<Family, KeyRows<Id>> = {
  qwerty: {
    num: ["Key_Grave", ...digits, "Key_Minus", "Key_Equals"],
    r1: [...letters("QWERTYUIOP"), "Key_LeftBracket", "Key_RightBracket"],
    r2: [...letters("ASDFGHJKL"), "Key_SemiColon", "Key_Apostrophe"],
    r3: [...letters("ZXCVBNM"), "Key_Comma", "Key_Period", "Key_Slash"],
    extra: ["Key_BackSlash", "Key_Hash"],
    iso: ["Key_LessThan", "Key_OEM102"],
  },
  azerty: {
    num: [["Key_Grave", "Key_Superscript_Two"], ...digits, ["Key_Minus", "Key_RightParenthesis"], "Key_Equals"],
    r1: [...letters("AZERTYUIOP"), ["Key_LeftBracket", "Key_Circumflex"], ["Key_RightBracket", "Key_Dollar"]],
    r2: [...letters("QSDFGHJKLM"), ["Key_Apostrophe", "Key_U_Grave"]],
    r3: [
      ...letters("WXCVBN"),
      "Key_Comma",
      "Key_SemiColon",
      ["Key_Period", "Key_Colon"],
      ["Key_Slash", "Key_Exclamation"],
    ],
    extra: ["Key_BackSlash", "Key_Hash", "Key_Asterisk"],
    iso: ["Key_LessThan", "Key_OEM102"],
  },
  qwertz: {
    num: [["Key_Grave", "Key_Circumflex"], ...digits, ["Key_Minus", "Key_SZ"], ["Key_Equals", "Key_Acute"]],
    r1: [...letters("QWERTZUIOP"), ["Key_LeftBracket", "Key_U_Umlaut"], ["Key_RightBracket", "Key_Plus"]],
    r2: [...letters("ASDFGHJKL"), ["Key_SemiColon", "Key_O_Umlaut"], ["Key_Apostrophe", "Key_A_Umlaut"]],
    r3: [...letters("YXCVBNM"), "Key_Comma", "Key_Period", "Key_Slash"],
    extra: ["Key_BackSlash", "Key_Hash"],
    iso: ["Key_LessThan", "Key_OEM102"],
  },
};

/** What is printed on the keys, for the keyboard chosen in EDCH. */
const KEY_CAPS: Record<Family, KeyRows<string>> = {
  qwerty: {
    num: ["`", ..."1234567890".split(""), "-", "="],
    r1: [..."QWERTYUIOP".split(""), "[", "]"],
    r2: [..."ASDFGHJKL".split(""), ";", "'"],
    r3: [..."ZXCVBNM".split(""), ",", ".", "/"],
    extra: "\\",
    iso: "\\",
  },
  azerty: {
    num: ["²", "& 1", "é 2", '" 3', "' 4", "( 5", "- 6", "è 7", "_ 8", "ç 9", "à 0", ")", "="],
    r1: [..."AZERTYUIOP".split(""), "^", "$"],
    r2: [..."QSDFGHJKLM".split(""), "ù"],
    r3: [..."WXCVBN".split(""), ",", ";", ":", "!"],
    extra: "*",
    iso: "<",
  },
  qwertz: {
    num: ["^", ..."1234567890".split(""), "ß", "´"],
    r1: [..."QWERTZUIOP".split(""), "Ü", "+"],
    r2: [..."ASDFGHJKL".split(""), "Ö", "Ä"],
    r3: [..."YXCVBNM".split(""), ",", ".", "-"],
    extra: "#",
    iso: "<",
  },
};
