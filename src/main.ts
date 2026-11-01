import { NAV, visibleNav } from "./nav.js";
import { gameBadge, setupDesktop } from "./desktop.js";
import { focusButtons, initFocus, toggleNav } from "./focus.js";
import { setRemoteCopyHere } from "./bridge.js";
import { changelogAfterUpdate } from "./changelog.js";
import { bindAlerts, clearAlert, goTo, inStartup, startupAlert } from "./alerts.js";
import { LANGS, browserLang, guessLang, initI18n, saveLang, savedLang, watchTranslations } from "./i18n.js";
import { installerLanguage, isTauri, onJournal, readAuxFile, startJournal, defaultJournalDir, type WatchStatus } from "./bridge.js";
import { loadGame } from "./data.js";
import { h, icon, replace } from "./dom.js";
import { applyCargoFile, applyLines, applyLocker, applyMarketFile, applyStatus, emptyState } from "./journal.js";
import { Uploaders } from "./uploaders.js";
import { detectRemote, remoteLanguage, runRemoteClient, setupRemoteHost } from "./remote.js";
import { MobileView } from "./views/mobile.js";
import { AboutView } from "./views/about.js";
import { RemoteGuideView } from "./views/guide.js";
import { applyTheme } from "./theme.js";
import { bindLinks, openSystem } from "./links.js";
import { captureActions, captureErrors, captureShownErrors, eventDetail, log, setDebugLog } from "./logger.js";
import { MissionsView } from "./views/missions.js";
import { ColonisationView } from "./views/colonisation.js";
import { GoalsView } from "./views/goals.js";
import { ExplorationView } from "./views/exploration.js";
import { MiningView } from "./views/mining.js";
import { PowerplayView } from "./views/powerplay.js";
import { SessionView } from "./views/session.js";
import { loadExobio } from "./exobio.js";
import { applyActivityEvents, emptyActivity } from "./activity.js";
import { bindStore, loadHistory, onLiveEvents, setupLive } from "./live.js";
import { startUpdateChecks } from "./updater.js";
import { SearchView } from "./views/search.js";
import { NavigationView } from "./views/navigation.js";
import { SyncView } from "./views/sync.js";
import { ControlsView } from "./views/controls.js";
import { Store } from "./store.js";
import type { Ctx, View } from "./context.js";
import { demoLines } from "./demo.js";
import { DetailPanel } from "./views/detail.js";
import { MaterialsView } from "./views/materials.js";
import { OdysseyView } from "./views/odyssey.js";
import { EngineeringView } from "./views/engineering.js";
import { WishlistView } from "./views/wishlist.js";
import { EngineersView } from "./views/engineers.js";
import { SettingsView } from "./views/settings.js";
import { setHere } from "./views/results.js";


function navIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  svg.appendChild(p);
  return svg;
}

async function boot() {
  const app = document.getElementById("app")!;
  captureErrors();
  captureActions();
  captureShownErrors();
  let game;
  try {
    [game] = await Promise.all([loadGame(), loadExobio()]);
  } catch (e) {
    log.error("app", `Game data: ${e}`);
    replace(app, h("p.error", null, `Impossible de charger les données du jeu : ${e}`));
    return;
  }
  // Language: chosen once (pre-selected from the installer / Windows language), changeable in Settings.
  // A phone served by EDCH's local server follows the PC's language until it picks its own.
  const remoteMode = isTauri() ? null : await detectRemote();
  let code = savedLang();
  if (remoteMode) {
    // A phone is the PC's screen elsewhere: same language, no language screen.
    code = (remoteMode === "paired" ? await remoteLanguage() : null) ?? code ?? browserLang();
  } else if (!code || !LANGS.some((l) => l.code === code)) {
    code = await pickLanguage(app, guessLang(await installerLanguage()));
    saveLang(code);
  }
  await initI18n(code);
  watchTranslations(document.body);
  if (remoteMode === "unpaired") {
    replace(app, unpairedScreen());
    return;
  }

  const store = new Store();
  bindStore(store);
  bindLinks(store);
  bindAlerts(store);
  initFocus(store);
  setRemoteCopyHere(store.state.settings.copyOnPhone);
  store.subscribe((st) => setRemoteCopyHere(st.settings.copyOnPhone));
  // An unexpected error right after start-up is worth a banner, not just a log line.
  window.addEventListener("error", (e) => {
    if (inStartup()) startupAlert("ui-error", "Erreur inattendue au démarrage", String(e.message ?? e));
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (inStartup()) startupAlert("ui-error", "Erreur inattendue au démarrage", String((e.reason as Error)?.message ?? e.reason));
  });
  await setDebugLog(store.state.settings.debugLog);
  log.info("app", `UI ready (language ${code}, view ${store.state.view})`);
  setHere(() => ({ system: store.state.cmdr.location?.system, seenAt: store.state.cmdr.location?.seenAt }));
  const ctx: Ctx = { game, store };
  const cap = (id: string) => game.capacityOf(id);
  const sync = new Uploaders(
    () => store.state.settings.sync,
    () => store.state.settings.journalDir,
    () => store.state.cmdr.materials,
    () => store.notify(),
    () => store.state.cmdr.fid,
  );
  ctx.sync = sync;

  // ----- layout -----
  const header = h("header.topbar");
  const nav = h("nav.sidebar");
  const main = h("main.content");
  const aside = h("aside.detail");
  replace(app, header, h("div.shell", null, nav, main, aside));

  const views: Record<string, View> = {
    materials: new MaterialsView(ctx),
    odyssey: new OdysseyView(ctx),
    engineering: new EngineeringView(ctx),
    wishlist: new WishlistView(ctx),
    engineers: new EngineersView(ctx),
    search: new SearchView(ctx),
    navigation: new NavigationView(ctx),
    sync: new SyncView(ctx),
    controls: new ControlsView(ctx),
    mobile: new MobileView(ctx),
    about: new AboutView(ctx),
    "guide-remote": new RemoteGuideView(ctx),
    missions: new MissionsView(ctx),
    colonisation: new ColonisationView(ctx),
    goals: new GoalsView(ctx),
    exploration: new ExplorationView(ctx),
    mining: new MiningView(ctx),
    powerplay: new PowerplayView(ctx),
    session: new SessionView(ctx),
    settings: new SettingsView(ctx, () => resetForReplay()),
  };
  const detail = new DetailPanel(ctx);
  detail.mount(aside);

  let mounted = "";
  const render = () => {
    const s = store.state;
    renderHeader(header, ctx);
    replace(
      nav,
      visibleNav(s.settings.hiddenViews ?? [], remoteMode ? ["mobile"] : []).map((n) =>
        n.id === "-" ? h("div.nav-sep") : h(
          "button",
          { class: s.view === n.id ? "active" : "", "data-nav": n.id, title: n.label, onclick: () => store.setView(n.id) },
          navIcon(n.icon),
          h("span", null, n.label),
          n.id === "wishlist" && s.wishlist.length ? h("small.count", null, String(s.wishlist.length)) : null,
        ),
      ),
    );
    // A page hidden in Settings (or from an older menu) falls back to the first page shown.
    const shown = visibleNav(s.settings.hiddenViews ?? [], remoteMode ? ["mobile"] : []);
    const hiddenNow = NAV.some((n) => n.id === s.view) && !shown.some((n) => n.id === s.view);
    const view = (remoteMode && s.view === "mobile" ? null : hiddenNow ? null : views[s.view]) ?? views[shown.find((n) => n.id !== "-")?.id ?? "materials"] ?? views.materials;
    if (mounted !== s.view) {
      mounted = s.view;
      view.mount(main);
      main.scrollTop = 0;
    } else {
      view.update();
    }
    detail.update();
  };
  applyTheme(store.state.settings.theme);
  store.subscribe((st) => applyTheme(st.settings.theme));
  // Interface size (PC and phone).
  let scale = 0;
  const applyScale = () => {
    const want = Math.min(150, Math.max(70, Number(store.state.settings.uiScale) || 100));
    if (want === scale) return;
    scale = want;
    (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = want === 100 ? "" : `${want}%`;
  };
  applyScale();
  store.subscribe(applyScale);
  // Page at start-up.
  const start = store.state.settings.startView;
  if (start && start !== store.state.view && (views as Record<string, unknown>)[start]) store.state.view = start;
  store.subscribe(render);
  render();

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && store.state.selected) store.select(undefined);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      const input = main.querySelector<HTMLInputElement>("input.search");
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }
  });

  // ----- journal -----
  let replaying = true;
  function resetForReplay() {
    // A fresh replay rebuilds everything from the journal.
    store.state.cmdr = emptyState();
    replaying = true;
    store.notify();
    void loadHistory(store.state.settings.journalDir);
  }

  const setWatch = (w: WatchStatus) => {
    store.state.watch = w;
    if (w.state === "live") clearAlert("journal");
    else if (w.state === "error") startupAlert("journal", "Journal du jeu illisible", w.message ?? "", goTo("settings", "Paramètres"));
    else if (w.state === "waiting" && inStartup()) startupAlert("journal", "Aucun journal du jeu trouvé", w.message ?? "Vérifie le dossier du journal dans les Paramètres.", goTo("settings", "Paramètres"));
    if (w.state === "live" || w.state === "waiting") {
      replaying = false;
      store.persistCmdr();
    }
    store.notify();
  };

  if (!isTauri()) {
    // Served by EDCH's local server to a phone? Then follow the PC; else browser demo.
    if (remoteMode === "paired") {
      setupLive(store);
      void runRemoteClient(store);
      return;
    }
    store.state.cmdr = emptyState();
    const demo = applyLines(store.state.cmdr, demoLines(), cap);
    store.state.activity = emptyActivity();
    applyActivityEvents(store.state.activity, demo.events);
    setupLive(store);
    setWatch({ state: "demo" });
    return;
  }

  await setupRemoteHost(store);
  setupDesktop(store);
  void changelogAfterUpdate(store);
  startUpdateChecks(store);
  setupLive(store);

  let saveTimer: number | undefined;
  let uploads = Promise.resolve();
  sync.start();
  await onJournal({
    batch: (b) => {
      const { changed, events } = applyLines(store.state.cmdr, b.lines, cap);
      if (!b.replay) {
        onLiveEvents(events);
        if (log.debugOn && events.length) {
          log.debug("journal", `Events: ${events.map((e) => e.event).join(", ")}`);
          for (const e of events) {
            const d = eventDetail(e);
            if (d) log.debug("journal", d);
          }
        }
      }
      // Uploads run in order; nothing from the startup replay is ever sent.
      uploads = uploads.then(async () => {
        for (const ev of events) await sync.handle(ev, !b.replay);
      });
      // Cargo events often only give the total: the hold's content is in Cargo.json.
      if (!b.replay && events.some((e) => e.event === "Cargo" && !e.Inventory && (e.Vessel ?? "Ship") === "Ship") && store.state.settings.journalDir) {
        readAuxFile(store.state.settings.journalDir, "Cargo.json")
          .then((text) => {
            if (applyCargoFile(store.state.cmdr, JSON.parse(text))) store.notify();
          })
          .catch(() => undefined);
      }
      // The Market event's goods are in Market.json: read it at once (a carrier's market is live data).
      if (!b.replay && events.some((e) => e.event === "Market") && store.state.settings.journalDir) {
        readAuxFile(store.state.settings.journalDir, "Market.json")
          .then((text) => {
            if (applyMarketFile(store.state.cmdr, JSON.parse(text))) store.notify();
          })
          .catch(() => undefined);
      }
      // ShipLocker events often only say "look at ShipLocker.json".
      if (events.some((e) => e.event === "ShipLocker" && !e.Items) && store.state.settings.journalDir) {
        readAuxFile(store.state.settings.journalDir, "ShipLocker.json")
          .then((text) => {
            if (applyLocker(store.state.cmdr, JSON.parse(text))) store.notify();
          })
          .catch(() => undefined);
      }
      if (changed) {
        store.notify();
        if (!replaying) {
          window.clearTimeout(saveTimer);
          saveTimer = window.setTimeout(() => store.persistCmdr(), 2000);
        }
      }
    },
    status: setWatch,
    aux: (a) => {
      try {
        if (a.name === "Status.json") {
          if (applyStatus(store.state.cmdr, JSON.parse(a.content))) store.notify();
          return;
        }
        if (a.name === "Market.json") {
          if (applyMarketFile(store.state.cmdr, JSON.parse(a.content))) {
            log.debug("carrier", "Carrier market read from Market.json");
            store.notify();
          }
          return;
        }
        if (a.name === "Cargo.json") {
          if (applyCargoFile(store.state.cmdr, JSON.parse(a.content))) store.notify();
          return;
        }
        if (a.name !== "ShipLocker.json") return;
        if (applyLocker(store.state.cmdr, JSON.parse(a.content))) store.notify();
      } catch {
        /* half-written file: the next change will fix it */
      }
    },
  });

  let dir = store.state.settings.journalDir;
  if (!dir) {
    dir = (await defaultJournalDir()) ?? "";
    if (dir) store.updateSettings({ journalDir: dir });
  }
  if (dir) {
    resetForReplay();
    startJournal(dir).catch((e) => setWatch({ state: "error", message: String(e) }));
  } else {
    setWatch({ state: "error", message: "Indique le dossier du journal dans les Paramètres." });
  }
}

/** First-run language screen. Labels are in each language, so it needs no translation. */
/** Shown on a phone that reached the local server without (or with an outdated) QR code. */
function unpairedScreen(): HTMLElement {
  const expired = location.hash === "#expired";
  return h(
    "div.lang-screen",
    null,
    h("img", { src: "favicon.png", alt: "" }),
    h("h1", null, "EDCH"),
    h("h2", null, "Cet appareil n'est pas connecté à EDCH"),
    expired ? h("p.warn", null, "Ce QR code n'est plus valable : un nouveau code a été créé sur le PC. Scanne celui qui est affiché maintenant.") : null,
    h("p", null, "Scanne le QR code affiché dans EDCH sur ton PC (page Mobile) pour connecter cet appareil."),
    h("p.sub", null, "La connexion est enregistrée dans le navigateur qui ouvre le lien. Si ton lecteur de QR code l'ouvre dans sa propre fenêtre, ouvre-le plutôt dans Chrome ou Safari, ou copie le lien dans ton navigateur."),
    h("button.primary", { onclick: () => location.replace("/") }, "Réessayer"),
  );
}

function pickLanguage(app: HTMLElement, preselected: string): Promise<string> {
  return new Promise((resolve) => {
    let chosen = preselected;
    const buttons = LANGS.map((l) =>
      h("button.lang-choice", { class: l.code === chosen ? "active" : "", "data-code": l.code, onclick: () => select(l.code) }, l.label),
    );
    const select = (c: string) => {
      chosen = c;
      for (const b of buttons) b.classList.toggle("active", b.dataset.code === c);
    };
    replace(
      app,
      h(
        "div.lang-screen",
        null,
        h("img", { src: "favicon.png", alt: "" }),
        h("h1", null, "EDCH"),
        h("p.sub", null, "Choose your language · Choisis ta langue · Sprache wählen · Elige tu idioma · Escolha o idioma · Выберите язык"),
        h("div.lang-grid", null, buttons),
        h("button.primary", { onclick: () => resolve(chosen) }, "OK"),
      ),
    );
  });
}

const SECURITY_FR: Record<string, string> = { High: "Sécurité haute", Medium: "Sécurité moyenne", Low: "Sécurité basse", Anarchy: "Anarchie" };
const ALLEGIANCE_FR: Record<string, string> = { Independent: "Indépendant", Federation: "Fédération", Empire: "Empire", Alliance: "Alliance", Thargoid: "Thargoid", Guardian: "Gardien", PilotsFederation: "Pilots Federation" };

function renderHeader(el: HTMLElement, ctx: Ctx) {
  const { cmdr, watch } = ctx.store.state;
  const loc = cmdr.location;
  const statusLabel: Record<string, string> = { live: "En direct", waiting: "En attente du jeu", error: "Erreur", demo: "Démo", idle: "Arrêté", remote: "Connecté au PC", offline: "PC injoignable" };
  const states = new Set<string>();
  for (const f of loc?.factions ?? []) {
    if (f.name === loc?.controllingFaction && f.state && f.state !== "None") states.add(f.state);
    for (const a of f.active) if (a !== "None") states.add(a);
  }
  replace(
    el,
    h("button.brand", { title: "Masquer ou afficher le menu", onclick: () => toggleNav() }, h("img", { src: "favicon.png", alt: "" }), h("span", null, "EDCH")),
    h(
      "div.cmdr",
      null,
      h("strong", null, cmdr.commander ? `CMDR ${cmdr.commander}` : "CMDR —"),
      cmdr.ship ? h("span.sub", null, `${cmdr.ship.type}${cmdr.ship.name ? ` · ${cmdr.ship.name}` : ""}`) : null,
    ),
    loc
      ? h(
          "div.where",
          null,
          h("button.sys", { title: "Copier le système", onclick: () => openSystem(loc.system, { navigate: false }) }, icon("pin"), h("span", null, loc.system)),
          loc.station ? h("span.sub", null, loc.station) : null,
          [loc.security ? SECURITY_FR[loc.security] ?? loc.security : undefined, loc.allegiance ? ALLEGIANCE_FR[loc.allegiance] ?? loc.allegiance : undefined].filter(Boolean).map((t) => h("span.badge.muted", null, t!)),
          [...states].slice(0, 4).map((s) => h("span.badge.hit", null, s)),
        )
      : h("div.where.sub", null, "Position inconnue"),
    gameBadge(ctx.store.state.game),
    focusButtons(),
    h("div.live", { class: watch.state, title: watch.message ?? watch.file ?? "" }, h("span.dot"), statusLabel[watch.state] ?? watch.state),
  );
}

boot();
