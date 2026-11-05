import { defaultJournalDir, isRemote, isTauri, logsOpen, startJournal, updateMode } from "../bridge.js";
import { setDebugLog } from "../logger.js";
import { h, replace, toast } from "../dom.js";
import { checkForUpdate } from "../updater.js";
import { SOFTWARE_VERSION as APP_VERSION } from "../eddn.js";
import { lang, LANGS, saveLang, t } from "../i18n.js";
import type { Ctx, View } from "../context.js";
import type { NotifySettings, Settings } from "../store.js";
import { notify, playTone, TONES } from "../notifier.js";
import { DEFAULT_THEME, PRESETS, type ThemeSettings } from "../theme.js";
import { ALWAYS_SHOWN, NAV } from "../nav.js";
import { startMenuEdit } from "../menuEdit.js";
import { startGame } from "../desktop.js";
import { showChangelog } from "../changelog.js";

const TABS: [string, string][] = [
  ["general", t("settings.general")],
  ["game", t("settings.gameSearch")],
  ["display", t("settings.display")],
  ["notifications", t("common.notifications")],
  ["advanced", t("settings.advanced")],
];

let currentTab = (() => {
  try {
    return localStorage.getItem("edc.settingsTab") ?? "general";
  } catch {
    return "general";
  }
})();

/** Opens Settings on a given tab (links from other pages). */
export function openSettingsTab(store: { setView(view: string): void }, tab: string) {
  currentTab = tab;
  store.setView("settings");
}

export class SettingsView implements View {
  private root?: HTMLElement;
  constructor(private ctx: Ctx, private restart: () => void) {}

  private mode = "installer";
  private debugPath: string | null = null;

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
    void updateMode().then((m) => {
      if (m !== this.mode) {
        this.mode = m;
        this.render();
      }
    });
    if (this.ctx.store.state.settings.debugLog) {
      void setDebugLog(true).then((path) => {
        this.debugPath = path;
        this.render();
      });
    }
  }

  // Inputs keep focus: only re-render on mount.
  update() {
    const status = this.root?.querySelector(".watch-status");
    if (status) status.textContent = this.statusText();
  }

  private statusText(): string {
    const w = this.ctx.store.state.watch;
    if (w.state === "live") return t("settings.readingLive", { file: w.file ?? "" });
    if (w.state === "waiting") return w.message ?? t("settings.waitingGame");
    if (w.state === "error") return t("settings.error", { message: w.message ?? "" });
    if (w.state === "demo") return t("settings.demoModeBrowserSampleJournal");
    return t("settings.readingStopped");
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

    const body = h(
        "div.settings",
        null,
        isRemote()
          ? null
          : h(
          "section.card",
          { "data-tab": "general" },
          h("h3", null, t("settings.language")),
          h(
            "label.field",
            null,
            h("span", null, t("settings.interfaceLanguage")),
            h(
              "select",
              {
                "data-no-tr": "",
                onchange: (e: Event) => {
                  saveLang((e.target as HTMLSelectElement).value);
                  location.reload();
                },
              },
              LANGS.map((l) => h("option", { value: l.code, selected: l.code === lang().code }, l.label)),
            ),
            h("small", null, t("settings.materialModuleEffectNamesFollowGame")),
          ),
        ),
        isTauri()
          ? h(
              "section.card",
              { "data-tab": "general" },
              h("h3", null, t("settings.updates")),
              h("p.sub", null, t("common.installedVersion", { current: APP_VERSION })),
              h(
                "label.check",
                null,
                h("input", { type: "checkbox", checked: s.autoUpdate, onchange: (e: Event) => set({ autoUpdate: (e.target as HTMLInputElement).checked }) }),
                (" " + t("settings.checkGithubNewVersionsAutomatically")),
              ),
              this.mode === "portable"
                ? h("p.sub", null, t("settings.portableVersionUpdatesArenTInstalled"))
                : this.mode !== "installer"
                  ? h("p.sub", null, t("settings.linuxUpdatesArenTInstalledAutomatically"))
                  : null,
              h("div.row", null, h("button.ghost", { onclick: () => checkForUpdate(true) }, t("settings.checkNow"))),
            )
          : null,
        isTauri() && !isRemote() ? this.appCard() : null,
        isTauri() && !isRemote() ? this.launchCard() : null,
        h(
          "section.card",
          { "data-tab": "game" },
          h("h3", null, t("settings.gameJournal")),
          h("p.sub.watch-status", null, this.statusText()),
          h("label.field.wide", null, h("span", null, t("settings.journalFolder")), dir),
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
              t("settings.detect"),
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
                    toast(t("settings.journalReadingStarted"));
                  } catch (e) {
                    toast(String(e));
                  }
                },
              },
              t("settings.saveRead"),
            ),
          ),
        ),
        h(
          "section.card",
          { "data-tab": "game" },
          h("h3", null, t("settings.systemSearchSpansh")),
          number(t("settings.maxDistanceLy"), s.maxDistance, "maxDistance", t("settings.searchRadiusAroundLocation"), { min: "10", max: "5000", step: "10" }),
          number(t("settings.minPopulationHighGradeEmissions"), s.hgeMinPopulation, "hgeMinPopulation", t("settings.highPopulation1000000Default"), { min: "0", step: "100000" }),
          number(t("settings.maxBgsDataAgeDays"), s.maxAgeDays, "maxAgeDays", t("settings.ignoresOlderFactionStatesBoomWar"), { min: "0", max: "60" }),
          h(
            "label.field",
            null,
            h("span", null, t("settings.fallbackSystem")),
            h("input", { type: "text", value: s.fallbackSystem, onchange: (e: Event) => set({ fallbackSystem: (e.target as HTMLInputElement).value.trim() || "Sol" }) }),
            h("small", null, t("settings.usedUntilGameReportsLocation")),
          ),
          h("label.check", null, h("input", { type: "checkbox", checked: s.largePadOnly, onchange: (e: Event) => set({ largePadOnly: (e.target as HTMLInputElement).checked }) }), (" " + t("settings.tradersLPadOnly"))),
          h(
            "label.check",
            null,
            h("input", { type: "checkbox", checked: s.systemOpensNav, onchange: (e: Event) => set({ systemOpensNav: (e.target as HTMLInputElement).checked }) }),
            (" " + t("settings.clickingSystemAlsoOpensNavigationSystem")),
          ),
          h("small.sub", null, t("settings.nameAlwaysCopiedPcSClipboard")),
          h(
            "label.check",
            null,
            h("input", { type: "checkbox", checked: s.copyOnPhone, onchange: (e: Event) => set({ copyOnPhone: (e.target as HTMLInputElement).checked }) }),
            (" " + t("settings.fromPhoneAlsoCopyPhoneS")),
          ),
        ),
        this.navigationCard(),
        this.engineersCard(),
        this.notifyCard(),
        this.pagesCard(),
        this.appearance(),
        isTauri() && !isRemote() ? this.logsCard() : null,
      );
    // Tabs: each card says which tab it belongs to (data-tab).
    const cards = [...body.children] as HTMLElement[];
    const tabOf = (card: HTMLElement) => card.dataset.tab ?? "general";
    const tabs = TABS.filter(([id]) => cards.some((c) => tabOf(c) === id));
    if (!tabs.some(([id]) => id === currentTab)) currentTab = tabs[0]?.[0] ?? "general";
    for (const c of cards) c.hidden = tabOf(c) !== currentTab;
    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h("h1", null, t("common.settings")),
        h(
          "div.segmented.settings-tabs",
          null,
          tabs.map(([id, label]) => h("button", { class: id === currentTab ? "active" : "", onclick: () => this.showTab(id) }, label)),
        ),
      ),
      body,
    );
  }

  private showTab(id: string) {
    currentTab = id;
    try {
      localStorage.setItem("edc.settingsTab", id);
    } catch {
      /* not kept: fine */
    }
    this.render();
    this.root?.scrollTo?.({ top: 0 });
  }

  private appearance(): HTMLElement {
    const theme = this.ctx.store.state.settings.theme;
    const setTheme = (patch: Partial<ThemeSettings>, rerender = true) => {
      this.ctx.store.updateSettings({ theme: { ...this.ctx.store.state.settings.theme, ...patch } });
      if (rerender) this.render();
    };
    const picker = (label: string, key: "accent" | "cyan" | "bg") =>
      h(
        "label",
        null,
        h("input", { type: "color", value: theme[key], oninput: (e: Event) => setTheme({ [key]: (e.target as HTMLInputElement).value, preset: "custom" }, false), onchange: () => this.render() }),
        h("span", null, label),
      );
    return h(
      "section.card",
      { "data-tab": "display" },
      h("h3", null, t("settings.appearance")),
      h("p.sub", null, t("settings.pickThemeOwnColoursConnectedPhone")),
      h(
        "div.theme-presets",
        null,
        PRESETS.map((p) =>
          h(
            `button.theme-preset${theme.preset === p.id ? ".on" : ""}`,
            { onclick: () => setTheme({ preset: p.id, accent: p.accent, cyan: p.cyan, bg: p.bg }) },
            h("span.theme-swatch", null, h("i", { style: { background: p.accent } }), h("i", { style: { background: p.cyan } }), h("i", { style: { background: p.bg } })),
            p.label,
          ),
        ),
      ),
      h("div.theme-colors", null, picker(t("settings.mainColour"), "accent"), picker(t("settings.secondaryColour"), "cyan"), picker(t("settings.background"), "bg")),
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: theme.oled, onchange: (e: Event) => setTheme({ oled: (e.target as HTMLInputElement).checked }) }),
        (" " + t("settings.oledModePureBlackBackgroundSaves")),
      ),
      h("div.row", null, h("button.ghost", { onclick: () => setTheme({ ...DEFAULT_THEME }) }, t("settings.restoreOriginalColours"))),
    );
  }

  private navigationCard(): HTMLElement {
    const store = this.ctx.store;
    const s = store.state.settings;
    const box = (checked: boolean, onchange: (on: boolean) => void, label: string) =>
      h("label.check", null, h("input", { type: "checkbox", checked, onchange: (ev: Event) => onchange((ev.target as HTMLInputElement).checked) }), ` ${label}`);
    return h(
      "section.card",
      { "data-tab": "game" },
      h("h3", null, t("common.navigation")),
      h("p.sub", null, t("settings.nextSystemCopiedPcSClipboard")),
      box(s.navAutoCopy, (on) => store.updateSettings({ navAutoCopy: on }), t("settings.copyNextJumpAutomaticallyWhenI")),
      box(s.engineers.autoCopyNext, (on) => store.updateSettings({ engineers: { ...store.state.settings.engineers, autoCopyNext: on } }), t("settings.copyNextJumpAutomaticallyWhenI2")),
      box(s.navNotifyCopy, (on) => store.updateSettings({ navNotifyCopy: on }), t("settings.notifyMeWhenNextJumpCopied")),
    );
  }

  private engineersCard(): HTMLElement {
    const store = this.ctx.store;
    const e = store.state.settings.engineers;
    const set = (patch: Partial<typeof e>) => store.updateSettings({ engineers: { ...store.state.settings.engineers, ...patch } });
    const check = (key: "autoPick" | "knownOnly" | "regionLimit" | "autoCopyNext" | "autoTick", label: string) =>
      h("label.check", null, h("input", { type: "checkbox", checked: e[key], onchange: (ev: Event) => set({ [key]: (ev.target as HTMLInputElement).checked }) }), ` ${label}`);
    return h(
      "section.card",
      { "data-tab": "game" },
      h("h3", null, t("common.engineers")),
      h("p.sub", null, t("settings.wishlistEngineerTour")),
      check("autoPick", t("settings.pickNearestEngineerEachWishlistLine")),
      check("knownOnly", t("settings.onlyEngineersAlreadyKnowMetInvited")),
      check("regionLimit", t("settings.stayMyRegionNoColoniaEngineers")),
      h(
        "label.field",
        null,
        h("span", null, t("settings.maxTourDistanceLy")),
        h("input", { type: "number", min: "100", max: "50000", step: "100", value: String(e.maxTourLy), onchange: (ev: Event) => set({ maxTourLy: Math.max(100, Number((ev.target as HTMLInputElement).value) || 2000) }) }),
        h("small", null, t("settings.totalStraightLineDistanceBetweenStops")),
      ),
      check("autoTick", t("settings.moveWishlistItselfWhenGameApplies")),
    );
  }

  private logsCard(): HTMLElement {
    const on = this.ctx.store.state.settings.debugLog;
    return h(
      "section.card",
      { "data-tab": "advanced" },
      h("h3", null, t("settings.applicationLogs")),
      h("p.sub", null, t("settings.edchAlwaysRecordsWhatDoesStandard")),
      h(
        "label.check",
        null,
        h("input", {
          type: "checkbox",
          checked: on,
          onchange: async (e: Event) => {
            const value = (e.target as HTMLInputElement).checked;
            this.ctx.store.updateSettings({ debugLog: value });
            this.debugPath = await setDebugLog(value);
            this.render();
          },
        }),
        (" " + t("settings.debugModeAlsoWritesDetailedLog")),
      ),
      h("p.sub", null, t("settings.debugLogContainsEverythingStandardLog")),
      on && this.debugPath ? h("p.sub", { "data-no-tr": "" }, this.debugPath) : null,
      h(
        "div.row",
        null,
        h(
          "button.ghost",
          {
            onclick: () =>
              logsOpen().catch((e) => toast(t("common.canTOpenFolder", { e }))),
          },
          t("common.openLogsFolder"),
        ),
      ),
    );
  }

  /** Window behaviour and what's new after an update (PC). */
  private appCard(): HTMLElement {
    const s = this.ctx.store.state.settings;
    const set = (patch: Partial<Settings>) => this.ctx.store.updateSettings(patch);
    const options: [Settings["closeBehavior"], string][] = [
      ["quit", t("settings.quitEdch")],
      ["minimize", t("settings.minimiseTaskbar")],
      ["tray", t("settings.hideNotificationAreaNextClock")],
      ["ask", t("settings.askBeforeQuitting")],
    ];
    return h(
      "section.card",
      { "data-tab": "general" },
      h("h3", null, t("settings.application")),
      h(
        "label.field",
        null,
        h("span", null, t("settings.windowSCloseButton")),
        h("select", { onchange: (e: Event) => set({ closeBehavior: (e.target as HTMLSelectElement).value as Settings["closeBehavior"] }) }, options.map(([v, l]) => h("option", { value: v, selected: s.closeBehavior === v }, l))),
        h("small", null, t("settings.hiddenNotificationAreaEdchKeepsReading")),
      ),
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: s.showChangelog, onchange: (e: Event) => set({ showChangelog: (e.target as HTMLInputElement).checked }) }),
        (" " + t("settings.showWhatSNewAfterUpdate")),
      ),
      h("div.row", null, h("button.ghost", { onclick: () => showChangelog() }, t("settings.seeWhatSNewVersion"))),
      h("p.sub", null, t("settings.edchOnlyOpensOnceLaunchingAgain")),
    );
  }

  /** How EDCH starts the game (button in the top bar). */
  private launchCard(): HTMLElement {
    const g = this.ctx.store.state.settings.gameLaunch;
    const set = (patch: Partial<Settings["gameLaunch"]>) => {
      this.ctx.store.updateSettings({ gameLaunch: { ...this.ctx.store.state.settings.gameLaunch, ...patch } });
      this.render();
    };
    const methods: [Settings["gameLaunch"]["method"], string][] = [
      ["steam", "Steam"],
      ["epic", t("settings.epicGames")],
      ["exe", t("settings.launcherChoiceFrontierMinedlauncher")],
    ];
    return h(
      "section.card",
      { "data-tab": "game" },
      h("h3", null, t("common.launchEliteDangerous")),
      h("p.sub", null, t("settings.launchEliteButtonTopScreenStarts")),
      h("label.field", null, h("span", null, t("settings.launch")), h("select", { onchange: (e: Event) => set({ method: (e.target as HTMLSelectElement).value as Settings["gameLaunch"]["method"] }) }, methods.map(([v, l]) => h("option", { value: v, selected: g.method === v }, l)))),
      g.method === "exe"
        ? h(
            "label.field.wide",
            null,
            h("span", null, t("settings.launcherPath")),
            h("input", { type: "text", value: g.path, placeholder: "C:\\Program Files (x86)\\Frontier\\EDLaunch\\EDLaunch.exe", spellcheck: false, onchange: (e: Event) => set({ path: (e.target as HTMLInputElement).value.trim() }) }),
            h("small", null, t("settings.exeLnkShortcutMinedlauncherTipRight")),
          )
        : null,
      h("div.row", null, h("button.ghost", { onclick: () => startGame() }, t("settings.launchNow"))),
    );
  }

  /** Pages shown in the menu, start page and interface size (PC and phone). */
  private pagesCard(): HTMLElement {
    const s = this.ctx.store.state.settings;
    const set = (patch: Partial<Settings>) => {
      this.ctx.store.updateSettings(patch);
      this.render();
    };
    const pages = NAV.filter((n) => n.id !== "-" && !ALWAYS_SHOWN.has(n.id) && !(isRemote() && n.id === "mobile"));
    const hidden = new Set(s.hiddenViews ?? []);
    return h(
      "section.card",
      { "data-tab": "display" },
      h("h3", null, t("settings.pagesDisplay")),
      h(
        "label.field",
        null,
        h("span", null, t("settings.startPage")),
        h(
          "select",
          { onchange: (e: Event) => set({ startView: (e.target as HTMLSelectElement).value }) },
          h("option", { value: "", selected: !s.startView }, t("settings.lastPageOpened")),
          pages.filter((p) => !hidden.has(p.id)).map((p) => h("option", { value: p.id, selected: s.startView === p.id }, p.label)),
        ),
      ),
      h(
        "label.field",
        null,
        h("span", null, t("settings.interfaceSize")),
        h("select", { onchange: (e: Event) => set({ uiScale: Number((e.target as HTMLSelectElement).value) }) }, [80, 90, 100, 110, 125, 150].map((v) => h("option", { value: String(v), selected: (s.uiScale || 100) === v }, `${v} %`))),
      ),
      h("p.sub", null, t("settings.pagesShownMenuUntickOnesDon")),
      h(
        "div.page-toggles",
        null,
        pages.map((p) =>
          h(
            "label.check",
            null,
            h("input", {
              type: "checkbox",
              checked: !hidden.has(p.id),
              onchange: (e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                const next = new Set(this.ctx.store.state.settings.hiddenViews ?? []);
                if (on) next.delete(p.id);
                else next.add(p.id);
                set({ hiddenViews: [...next] });
              },
            }),
            " ",
            h("span", null, p.label),
          ),
        ),
      ),
      h("small.sub", null, t("settings.appliesPhoneTooSettingsAboutAlways")),
      isRemote()
        ? null
        : h(
            "div.row",
            null,
            h("button.ghost", { onclick: () => startMenuEdit(this.ctx.store) }, t("common.editMenu")),
            h("small.sub", null, t("settings.pageOrderGroupsPagesShownPhone")),
          ),
    );
  }

  private notifyCard(): HTMLElement {
    const store = this.ctx.store;
    const n = store.state.settings.notify;
    const set = (patch: Partial<NotifySettings>) => store.updateSettings({ notify: { ...store.state.settings.notify, ...patch } });
    const wingCheck = (key: "notifyNew" | "notifyAccept" | "notifyAll" | "notifyLeave", label: string) =>
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: store.state.settings.wing[key], onchange: (e: Event) => store.updateSettings({ wing: { ...store.state.settings.wing, [key]: (e.target as HTMLInputElement).checked } }) }),
        ` ${label}`,
      );
    return h(
      "section.card",
      { "data-tab": "notifications" },
      h("h3", null, t("common.notifications")),
      h("p.sub", null, t("settings.noWindowsPopUpSoundNotifications")),
      h(
        "div.notify-form",
        null,
        h("label.check", null, h("input", { type: "checkbox", checked: n.sound, onchange: (e: Event) => set({ sound: (e.target as HTMLInputElement).checked }) }), (" " + t("settings.sound"))),
        h(
          "select",
          { "data-no-tr": "", onchange: (e: Event) => set({ tone: (e.target as HTMLSelectElement).value }) },
          TONES.map(([v, l]) => h("option", { value: v, selected: v === n.tone }, l)),
        ),
        h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(n.volume), title: t("settings.volume"), onchange: (e: Event) => set({ volume: Number((e.target as HTMLInputElement).value) }) }),
        h("button.ghost.small", { onclick: () => playTone(store.state.settings.notify.tone, store.state.settings.notify.volume) }, t("settings.listen")),
      ),
      h(
        "div.notify-form",
        null,
        h("label.check", null, h("input", { type: "checkbox", checked: n.color, onchange: (e: Event) => set({ color: (e.target as HTMLInputElement).checked }) }), (" " + t("settings.colour"))),
        h("input", { type: "color", value: n.flash, onchange: (e: Event) => set({ flash: (e.target as HTMLInputElement).value }) }),
        h("button.ghost.small", { onclick: () => notify(t("settings.testNotification")) }, t("settings.test")),
      ),
      h("label.check", null, h("input", { type: "checkbox", checked: n.hideTab, onchange: (e: Event) => set({ hideTab: (e.target as HTMLInputElement).checked }) }), (" " + t("settings.hideTabSoundStaysIfTicked"))),
      h("h4.settings-sub", null, t("common.wing")),
      isRemote()
        ? h("p.sub", null, t("settings.theseAreSetPcTheyGo"))
        : [
            wingCheck("notifyNew", t("settings.notifyMeWhenMemberHasWing")),
            wingCheck("notifyAccept", t("settings.notifyMeWhenMemberAcceptsMission")),
            wingCheck("notifyAll", t("settings.notifyMeWhenWholeWingHas")),
            wingCheck("notifyLeave", t("settings.tellMeWhenMemberClosesEdch")),
          ],
      h("h4.settings-sub", null, t("common.mining")),
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: store.state.settings.mining.alert, onchange: (e: Event) => store.updateSettings({ mining: { ...store.state.settings.mining, alert: (e.target as HTMLInputElement).checked } }) }),
        (" " + t("settings.tellMeWhenProspectorFindsTarget")),
      ),
      h("small.sub", null, t("settings.targetsTheirPercentagesAreChosenMining")),
      h("h4.settings-sub", null, t("settings.application")),
      h("p.sub", null, t("settings.newVersionsStartUpProblemsAlso")),
    );
  }
}
