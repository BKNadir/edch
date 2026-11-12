// Controls page: reads the game's bindings (.binds) and shows, per device, what each key, button
// and axis does (keyboard, gamepad, joystick and mouse pictures), with search, filters and backup.

import {
  actionName,
  type Bind,
  type BindsMeta,
  comboLabel,
  deviceInfo,
  type DeviceTemplate,
  fileForPreset,
  groupOf,
  keyLabel,
  parseBinds,
  parseStartPreset,
  presetLineFor,
  templateBox,
} from "../../features/controls/binds.js";
import { DEMO_BINDS } from "../../game/demo.js";
import {
  exportConfig,
  importConfig,
  isTauri,
  listOptionFiles,
  type OptionFile,
  readOptionFile,
  revealPath,
} from "../../platform/bridge.js";
import { fold, gameText, t } from "../../platform/i18n.js";
import type { Ctx, View } from "../../state/context.js";
import { h, icon, replace, toast } from "../../ui/dom.js";
import { keepPicture, keptPicture } from "../../services/controllerPictures.js";
import { board, gamepad, GROUP_LABELS, groupClass, legendTable } from "./deviceBoard.js";
import { keyboard } from "./keyboard.js";

const MODES: [string, string, string[] | null][] = [
  ["all", t("controls.all"), null],
  ["ship", t("common.ship"), ["Ship", "Fighter", "Scanners", "Multicrew"]],
  ["srv", "SRV", ["SRV"]],
  ["foot", t("common.foot"), ["OnFoot", "Holo-Me"]],
  ["ui", t("controls.mapsUi"), ["Galaxy map", "UI", "Camera", "Head look", "Misc"]],
];

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
      return [name, gameText(name), combo, gameText(combo), b.action, GROUP_LABELS[g] ?? g].some((candidate) =>
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
    if (info.kind === "keyboard")
      drawing = keyboard(
        this.meta!,
        this.ctx,
        this.layout,
        () => this.legendKey(),
        () => this.render(),
        binds,
      );
    else if (tpl) drawing = this.templateView(device, tpl, binds, info.kind === "gamepad");
    else if (info.kind === "gamepad") drawing = gamepad(this.meta!, () => this.legendKey(), device, binds);
    else drawing = board(this.meta!, () => this.legendKey(), binds, info.kind === "mouse");
    return h("section.card.diagram", null, title, drawing);
  }

  /** EDRefCard picture of the device with each control's actions written in its box. */
  private templateView(device: string, tpl: DeviceTemplate, binds: Bind[], isGamepad: boolean): HTMLElement {
    const meta = this.meta!;
    const [w, hgt] = tpl.size;
    const placed = new Map<string, Bind[]>();
    const unplaced: Bind[] = [];
    for (const b of binds) {
      const box = templateBox(tpl, device, b.key);
      if (box) placed.set(box, [...(placed.get(box) ?? []), b]);
      else unplaced.push(b);
    }
    const fallback = () =>
      isGamepad
        ? gamepad(this.meta!, () => this.legendKey(), device, binds)
        : board(this.meta!, () => this.legendKey(), binds, false);
    // The picture kept on the PC when there is one (instant, offline too); else GitHub's, kept for next time.
    const pictureUrl = `${meta.templateBase}${tpl.image}.jpg`;
    const kept = keptPicture(pictureUrl);
    if (!kept) void keepPicture(pictureUrl);
    const img = h("img.tpl-img", {
      src: kept ?? pictureUrl,
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
        ? h("div", null, h("h4.sub", null, t("controls.noBoxTemplate")), legendTable(this.meta!, unplaced))
        : null,
    );
  }

  // ---------------- legend helpers ----------------

  private legendKey(): HTMLElement {
    const used = new Set(this.visible().map((b) => groupOf(this.meta!, b.action)));
    return h(
      "div.legend-key",
      null,
      [...used].map((g) => h(`span.act.${groupClass(g)}`, null, GROUP_LABELS[g] ?? g)),
    );
  }

  // ---------------- keyboard ----------------

  // ---------------- gamepad ----------------

  // ---------------- joystick / HOTAS / mouse ----------------
}

function rank(meta: BindsMeta, device: string): number {
  const kind = deviceInfo(meta, device).kind;
  return { joystick: 0, gamepad: 1, keyboard: 2, mouse: 3, vr: 4 }[kind];
}
