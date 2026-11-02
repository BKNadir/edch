import { defaultJournalDir, isRemote, isTauri, logsOpen, startJournal, updateMode } from "../bridge.js";
import { setDebugLog } from "../logger.js";
import { h, replace, toast } from "../dom.js";
import { checkForUpdate } from "../updater.js";
import { SOFTWARE_VERSION as APP_VERSION } from "../eddn.js";
import { LANGS, lang, saveLang } from "../i18n.js";
import type { Ctx, View } from "../context.js";
import type { NotifySettings, Settings } from "../store.js";
import { notify, playTone, TONES } from "../notifier.js";
import { DEFAULT_THEME, PRESETS, type ThemeSettings } from "../theme.js";
import { ALWAYS_SHOWN, NAV } from "../nav.js";
import { startMenuEdit } from "../menuEdit.js";
import { startGame } from "../desktop.js";
import { showChangelog } from "../changelog.js";

const TABS: [string, string][] = [
  ["general", "Général"],
  ["game", "Jeu et recherche"],
  ["display", "Affichage"],
  ["notifications", "Notifications"],
  ["advanced", "Avancé"],
];

/** Which tab each card goes to, by its (French) title. */
const CARD_TAB: Record<string, string> = {
  Langue: "general",
  "Mises à jour": "general",
  Application: "general",
  "Lancer Elite Dangerous": "game",
  "Journal du jeu": "game",
  "Recherche de systèmes (Spansh)": "game",
  Ingénieurs: "game",
  Navigation: "game",
  "Pages et affichage": "display",
  Apparence: "display",
  Notifications: "notifications",
  "Logs de l'application": "advanced",
};

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

    const body = h(
        "div.settings",
        null,
        isRemote()
          ? null
          : h(
          "section.card",
          null,
          h("h3", null, "Langue"),
          h(
            "label.field",
            null,
            h("span", null, "Langue de l'interface"),
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
            h("small", null, "Les noms des matériaux, modules et effets suivent la traduction du jeu ; les noms des commandes restent ceux du jeu en anglais."),
          ),
        ),
        isTauri()
          ? h(
              "section.card",
              null,
              h("h3", null, "Mises à jour"),
              h("p.sub", null, `Version installée : ${APP_VERSION}`),
              h(
                "label.check",
                null,
                h("input", { type: "checkbox", checked: s.autoUpdate, onchange: (e: Event) => set({ autoUpdate: (e.target as HTMLInputElement).checked }) }),
                " Vérifier automatiquement les nouvelles versions sur GitHub",
              ),
              this.mode === "portable"
                ? h("p.sub", null, "Version portable : les mises à jour ne s'installent pas automatiquement. Quand une nouvelle version sort, EDCH ouvre la page de téléchargement.")
                : this.mode !== "installer"
                  ? h("p.sub", null, "Sur Linux, les mises à jour ne s'installent pas automatiquement : quand une nouvelle version sort, EDCH ouvre la page de téléchargement (AppImage, .deb, .rpm…).")
                  : null,
              h("div.row", null, h("button.ghost", { onclick: () => checkForUpdate(true) }, "Vérifier maintenant")),
            )
          : null,
        isTauri() && !isRemote() ? this.appCard() : null,
        isTauri() && !isRemote() ? this.launchCard() : null,
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
          number("Population min. pour les émissions d'intensité élevée", s.hgeMinPopulation, "hgeMinPopulation", "« Haute population » : 1 000 000 par défaut.", { min: "0", step: "100000" }),
          number("Données BGS max. (jours)", s.maxAgeDays, "maxAgeDays", "Ignore les états de faction plus vieux (Boom, Guerre…). 0 = pas de limite.", { min: "0", max: "60" }),
          h(
            "label.field",
            null,
            h("span", null, "Système de repli"),
            h("input", { type: "text", value: s.fallbackSystem, onchange: (e: Event) => set({ fallbackSystem: (e.target as HTMLInputElement).value.trim() || "Sol" }) }),
            h("small", null, "Utilisé tant que le jeu n'a pas donné ta position."),
          ),
          h("label.check", null, h("input", { type: "checkbox", checked: s.largePadOnly, onchange: (e: Event) => set({ largePadOnly: (e.target as HTMLInputElement).checked }) }), " Traders avec pad L seulement"),
          h(
            "label.check",
            null,
            h("input", { type: "checkbox", checked: s.systemOpensNav, onchange: (e: Event) => set({ systemOpensNav: (e.target as HTMLInputElement).checked }) }),
            " Cliquer sur un système ouvre aussi la Navigation, avec ce système en destination",
          ),
          h("small.sub", null, "Le nom est toujours copié dans le presse-papiers du PC, même quand tu cliques depuis le téléphone."),
          h(
            "label.check",
            null,
            h("input", { type: "checkbox", checked: s.copyOnPhone, onchange: (e: Event) => set({ copyOnPhone: (e.target as HTMLInputElement).checked }) }),
            " Depuis le téléphone, copier aussi dans le presse-papiers du téléphone",
          ),
        ),
        this.navigationCard(),
        this.engineersCard(),
        this.notifyCard(),
        this.pagesCard(),
        this.appearance(),
        isTauri() && !isRemote() ? this.logsCard() : null,
      );
    // Tabs: each card goes to the tab of its title (titles are compared before translation).
    const cards = [...body.children] as HTMLElement[];
    const tabOf = (card: HTMLElement) => CARD_TAB[card.querySelector("h3")?.textContent?.trim() ?? ""] ?? "general";
    const tabs = TABS.filter(([id]) => cards.some((c) => tabOf(c) === id));
    if (!tabs.some(([id]) => id === currentTab)) currentTab = tabs[0]?.[0] ?? "general";
    for (const c of cards) c.hidden = tabOf(c) !== currentTab;
    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h("h1", null, "Paramètres"),
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
    const t = this.ctx.store.state.settings.theme;
    const setTheme = (patch: Partial<ThemeSettings>, rerender = true) => {
      this.ctx.store.updateSettings({ theme: { ...this.ctx.store.state.settings.theme, ...patch } });
      if (rerender) this.render();
    };
    const picker = (label: string, key: "accent" | "cyan" | "bg") =>
      h(
        "label",
        null,
        h("input", { type: "color", value: t[key], oninput: (e: Event) => setTheme({ [key]: (e.target as HTMLInputElement).value, preset: "custom" }, false), onchange: () => this.render() }),
        h("span", null, label),
      );
    return h(
      "section.card",
      null,
      h("h3", null, "Apparence"),
      h("p.sub", null, "Choisis un thème ou tes propres couleurs. Le téléphone connecté utilise les mêmes réglages."),
      h(
        "div.theme-presets",
        null,
        PRESETS.map((p) =>
          h(
            `button.theme-preset${t.preset === p.id ? ".on" : ""}`,
            { onclick: () => setTheme({ preset: p.id, accent: p.accent, cyan: p.cyan, bg: p.bg }) },
            h("span.theme-swatch", null, h("i", { style: { background: p.accent } }), h("i", { style: { background: p.cyan } }), h("i", { style: { background: p.bg } })),
            p.label,
          ),
        ),
      ),
      h("div.theme-colors", null, picker("Couleur principale", "accent"), picker("Couleur secondaire", "cyan"), picker("Fond", "bg")),
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: t.oled, onchange: (e: Event) => setTheme({ oled: (e.target as HTMLInputElement).checked }) }),
        " Mode OLED : fond noir pur (économise la batterie des écrans OLED)",
      ),
      h("div.row", null, h("button.ghost", { onclick: () => setTheme({ ...DEFAULT_THEME }) }, "Rétablir les couleurs d'origine")),
    );
  }

  private navigationCard(): HTMLElement {
    const store = this.ctx.store;
    const s = store.state.settings;
    const box = (checked: boolean, onchange: (on: boolean) => void, label: string) =>
      h("label.check", null, h("input", { type: "checkbox", checked, onchange: (ev: Event) => onchange((ev.target as HTMLInputElement).checked) }), ` ${label}`);
    return h(
      "section.card",
      null,
      h("h3", null, "Navigation"),
      h("p.sub", null, "Le système suivant est copié dans le presse-papiers du PC, prêt à coller dans la carte galactique."),
      box(s.navAutoCopy, (on) => store.updateSettings({ navAutoCopy: on }), "Copier automatiquement le prochain saut quand j'arrive dans un système de l'itinéraire (page Navigation)"),
      box(s.engineers.autoCopyNext, (on) => store.updateSettings({ engineers: { ...store.state.settings.engineers, autoCopyNext: on } }), "Copier automatiquement le prochain saut quand j'arrive dans un système de la tournée des ingénieurs (wishlist)"),
      box(s.navNotifyCopy, (on) => store.updateSettings({ navNotifyCopy: on }), "Me notifier quand le prochain saut est copié (onglet Notifications, avec le son s'il est activé)"),
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
      null,
      h("h3", null, "Ingénieurs"),
      h("p.sub", null, "Pour la wishlist et la tournée des ingénieurs."),
      check("autoPick", "Choisir l'ingénieur le plus proche pour chaque ligne de la wishlist (sinon, tous les ingénieurs sont listés)"),
      check("knownOnly", "Seulement les ingénieurs déjà connus (rencontrés, invités ou débloqués)"),
      check("regionLimit", "Rester dans ma région : pas d'ingénieurs de Colonia quand je suis dans la Bulle, et inversement"),
      h(
        "label.field",
        null,
        h("span", null, "Distance max. de la tournée (al)"),
        h("input", { type: "number", min: "100", max: "50000", step: "100", value: String(e.maxTourLy), onchange: (ev: Event) => set({ maxTourLy: Math.max(100, Number((ev.target as HTMLInputElement).value) || 2000) }) }),
        h("small", null, "Total en ligne droite entre les arrêts. Au-delà, EDCH ne propose pas l'itinéraire."),
      ),
      check("autoTick", "Avancer la wishlist toute seule quand le jeu applique une modification"),
    );
  }

  private logsCard(): HTMLElement {
    const on = this.ctx.store.state.settings.debugLog;
    return h(
      "section.card",
      null,
      h("h3", null, "Logs de l'application"),
      h("p.sub", null, "EDCH note toujours ce qu'il fait dans un log standard (un fichier par démarrage). Les avertissements et les erreurs sont aussi copiés dans un log d'erreurs séparé, créé seulement en cas de problème. Les logs de plus d'une semaine sont supprimés automatiquement, mais les 5 derniers de chaque type sont toujours gardés."),
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
        " Mode debug : enregistre aussi un log détaillé, dans un fichier séparé",
      ),
      h("p.sub", null, "Le log debug contient tout : le log standard, les erreurs, et chaque action (clics, réglages modifiés, pages ouvertes, échanges avec le jeu et les services). Active-le pour signaler un problème, puis désactive-le : il grossit vite. Les clés API et le texte tapé ne sont jamais écrits dans les logs."),
      on && this.debugPath ? h("p.sub", { "data-no-tr": "" }, this.debugPath) : null,
      h(
        "div.row",
        null,
        h(
          "button.ghost",
          {
            onclick: () =>
              logsOpen().catch((e) => toast(`Impossible d'ouvrir le dossier : ${e}`)),
          },
          "Ouvrir le dossier des logs",
        ),
      ),
    );
  }

  /** Window behaviour and what's new after an update (PC). */
  private appCard(): HTMLElement {
    const s = this.ctx.store.state.settings;
    const set = (patch: Partial<Settings>) => this.ctx.store.updateSettings(patch);
    const options: [Settings["closeBehavior"], string][] = [
      ["quit", "Quitter EDCH"],
      ["minimize", "Réduire dans la barre des tâches"],
      ["tray", "Masquer dans la zone de notification (à côté de l'horloge)"],
      ["ask", "Demander avant de quitter"],
    ];
    return h(
      "section.card",
      null,
      h("h3", null, "Application"),
      h(
        "label.field",
        null,
        h("span", null, "Bouton de fermeture de la fenêtre"),
        h("select", { onchange: (e: Event) => set({ closeBehavior: (e.target as HTMLSelectElement).value as Settings["closeBehavior"] }) }, options.map(([v, l]) => h("option", { value: v, selected: s.closeBehavior === v }, l))),
        h("small", null, "Masqué dans la zone de notification, EDCH continue de lire le journal : double-clique sur son icône pour le rouvrir, ou clic droit → Quitter."),
      ),
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: s.showChangelog, onchange: (e: Event) => set({ showChangelog: (e.target as HTMLInputElement).checked }) }),
        " Afficher les nouveautés après une mise à jour",
      ),
      h("div.row", null, h("button.ghost", { onclick: () => showChangelog() }, "Voir les nouveautés de cette version")),
      h("p.sub", null, "EDCH ne s'ouvre qu'une fois : le relancer ramène la fenêtre déjà ouverte au premier plan. La fenêtre se rouvre là où tu l'as laissée."),
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
      ["epic", "Epic Games"],
      ["exe", "Un lanceur au choix (Frontier, MinEdLauncher…)"],
    ];
    return h(
      "section.card",
      null,
      h("h3", null, "Lancer Elite Dangerous"),
      h("p.sub", null, "Le bouton « Lancer Elite » en haut de l'écran démarre le jeu, et indique quand il tourne. Il marche aussi depuis le téléphone."),
      h("label.field", null, h("span", null, "Lancer avec"), h("select", { onchange: (e: Event) => set({ method: (e.target as HTMLSelectElement).value as Settings["gameLaunch"]["method"] }) }, methods.map(([v, l]) => h("option", { value: v, selected: g.method === v }, l)))),
      g.method === "exe"
        ? h(
            "label.field.wide",
            null,
            h("span", null, "Chemin du lanceur"),
            h("input", { type: "text", value: g.path, placeholder: "C:\\Program Files (x86)\\Frontier\\EDLaunch\\EDLaunch.exe", spellcheck: false, onchange: (e: Event) => set({ path: (e.target as HTMLInputElement).value.trim() }) }),
            h("small", null, "Un .exe, un raccourci .lnk, ou MinEdLauncher. Astuce : clic droit sur le fichier → « Copier en tant que chemin d'accès », puis colle ici (sans les guillemets)."),
          )
        : null,
      h("div.row", null, h("button.ghost", { onclick: () => startGame() }, "Lancer maintenant")),
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
      null,
      h("h3", null, "Pages et affichage"),
      h(
        "label.field",
        null,
        h("span", null, "Page au démarrage"),
        h(
          "select",
          { onchange: (e: Event) => set({ startView: (e.target as HTMLSelectElement).value }) },
          h("option", { value: "", selected: !s.startView }, "La dernière page ouverte"),
          pages.filter((p) => !hidden.has(p.id)).map((p) => h("option", { value: p.id, selected: s.startView === p.id }, p.label)),
        ),
      ),
      h(
        "label.field",
        null,
        h("span", null, "Taille de l'interface"),
        h("select", { onchange: (e: Event) => set({ uiScale: Number((e.target as HTMLSelectElement).value) }) }, [80, 90, 100, 110, 125, 150].map((v) => h("option", { value: String(v), selected: (s.uiScale || 100) === v }, `${v} %`))),
      ),
      h("p.sub", null, "Pages affichées dans le menu (décoche celles dont tu ne te sers pas) :"),
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
      h("small.sub", null, "Valable aussi sur le téléphone. Paramètres et À propos restent toujours visibles."),
      isRemote()
        ? null
        : h(
            "div.row",
            null,
            h("button.ghost", { onclick: () => startMenuEdit(this.ctx.store) }, "Éditer le menu"),
            h("small.sub", null, "Ordre des pages, groupes, et pages affichées sur le téléphone. Aussi par le bouton en bas du menu."),
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
      null,
      h("h3", null, "Notifications"),
      h("p.sub", null, "Pas de fenêtre Windows : un son et/ou la languette « Notifications » sur le bord droit qui clignote. Elle regroupe toutes les notifications : escadrille, minage, mises à jour, problèmes au démarrage… Clique dessus pour les voir, clique ailleurs pour refermer."),
      h(
        "div.notify-form",
        null,
        h("label.check", null, h("input", { type: "checkbox", checked: n.sound, onchange: (e: Event) => set({ sound: (e.target as HTMLInputElement).checked }) }), " Son"),
        h(
          "select",
          { "data-no-tr": "", onchange: (e: Event) => set({ tone: (e.target as HTMLSelectElement).value }) },
          TONES.map(([v, l]) => h("option", { value: v, selected: v === n.tone }, l)),
        ),
        h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(n.volume), title: "Volume", onchange: (e: Event) => set({ volume: Number((e.target as HTMLInputElement).value) }) }),
        h("button.ghost.small", { onclick: () => playTone(store.state.settings.notify.tone, store.state.settings.notify.volume) }, "Écouter"),
      ),
      h(
        "div.notify-form",
        null,
        h("label.check", null, h("input", { type: "checkbox", checked: n.color, onchange: (e: Event) => set({ color: (e.target as HTMLInputElement).checked }) }), " Couleur"),
        h("input", { type: "color", value: n.flash, onchange: (e: Event) => set({ flash: (e.target as HTMLInputElement).value }) }),
        h("button.ghost.small", { onclick: () => notify("Test de notification") }, "Tester"),
      ),
      h("label.check", null, h("input", { type: "checkbox", checked: n.hideTab, onchange: (e: Event) => set({ hideTab: (e.target as HTMLInputElement).checked }) }), " Masquer la languette (le son reste actif s'il est coché)"),
      h("h4.settings-sub", null, "Escadrille"),
      isRemote()
        ? h("p.sub", null, "Ces réglages se font sur le PC (ils vont avec le code d'escadrille).")
        : [
            wingCheck("notifyNew", "Prévenir quand un membre a une mission d'escadrille que je n'ai pas"),
            wingCheck("notifyAccept", "Prévenir quand un membre accepte une mission que je partage"),
            wingCheck("notifyAll", "Prévenir quand toute l'escadrille a accepté une mission"),
            wingCheck("notifyLeave", "Prévenir quand un membre ferme EDCH ou quitte l'escadrille en jeu"),
          ],
      h("h4.settings-sub", null, "Minage"),
      h(
        "label.check",
        null,
        h("input", { type: "checkbox", checked: store.state.settings.mining.alert, onchange: (e: Event) => store.updateSettings({ mining: { ...store.state.settings.mining, alert: (e.target as HTMLInputElement).checked } }) }),
        " Prévenir quand un prospecteur trouve une cible ou un cœur",
      ),
      h("small.sub", null, "Les cibles et leurs pourcentages se choisissent sur la page Minage."),
      h("h4.settings-sub", null, "Application"),
      h("p.sub", null, "Les nouvelles versions et les problèmes au démarrage apparaissent aussi dans la languette, sans son."),
    );
  }
}
