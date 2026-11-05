import { bindTour } from "../features/engineers/tour.js";
import { NAV, visibleNav } from "../ui/menu/pages.js";
import { gameBadge, setupDesktop } from "../ui/desktop.js";
import { focusButtons, initFocus, openedAsSinglePage, toggleNav } from "./focus.js";
import { excludedHere, renderMenu } from "../ui/menu/editMenu.js";
import { setRemoteCopyHere } from "../platform/bridge.js";
import { changelogAfterUpdate } from "../ui/changelog.js";
import { bindAlerts, clearAlert, goTo, inStartup, startupAlert } from "../ui/alerts.js";
import { t, watchGameNames } from "../platform/i18n.js";
import { isTauri, onJournal, readAuxFile, startJournal, defaultJournalDir, type WatchStatus } from "../platform/bridge.js";
import { loadGame } from "../game/data.js";
import { h, icon, replace } from "../ui/dom.js";
import { applyCargoFile, applyLines, applyLocker, applyMarketFile, applyStatus, emptyState } from "../game/journal.js";
import { Uploaders } from "../services/sync.js";
import { runRemoteClient, setupRemoteHost } from "./remote.js";
import { MobileView } from "../views/mobile/index.js";
import { AboutView } from "../views/about/index.js";
import { RemoteGuideView } from "../views/guide/index.js";
import { applyTheme } from "../ui/theme.js";
import { bindLinks, openSystem } from "../views/shared/links.js";
import { captureActions, captureErrors, captureShownErrors, eventDetail, log, setDebugLog } from "../platform/logger.js";
import { MissionsView } from "../views/missions/index.js";
import { ColonisationView } from "../views/colonisation/index.js";
import { GoalsView } from "../views/goals/index.js";
import { ExplorationView } from "../views/exploration/index.js";
import { MiningView } from "../views/mining/index.js";
import { PowerplayView } from "../views/powerplay/index.js";
import { SessionView } from "../views/session/index.js";
import { loadExobio } from "../game/exobio.js";
import { applyActivityEvents, emptyActivity } from "../game/activity.js";
import { bindStore, loadHistory, onLiveEvents, setupLive } from "../features/missions/live.js";
import { startUpdateChecks } from "../ui/updateBanner.js";
import { SearchView } from "../views/search/index.js";
import { NavigationView } from "../views/navigation/index.js";
import { SyncView } from "../views/sync/index.js";
import { ControlsView } from "../views/controls/index.js";
import { Store } from "../state/store.js";
import type { Ctx, View } from "../state/context.js";
import { demoLines } from "../game/demo.js";
import { DetailPanel } from "../views/detail/index.js";
import { MaterialsView } from "../views/materials/index.js";
import { OdysseyView } from "../views/odyssey/index.js";
import { EngineeringView } from "../views/engineering/index.js";
import { WishlistView } from "../views/wishlist/index.js";
import { EngineersView } from "../views/engineers/index.js";
import { SettingsView } from "../views/settings/index.js";
import { setHere } from "../views/shared/resultsTable.js";


function navIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  svg.appendChild(p);
  return svg;
}

/** Starts the app once the language is loaded (called by boot.ts). */
export async function startApp(code: string, remoteMode: "paired" | null) {
  const app = document.getElementById("app")!;
  captureErrors();
  captureActions();
  captureShownErrors();
  let game;
  try {
    [game] = await Promise.all([loadGame(), loadExobio()]);
  } catch (e) {
    log.error("app", `Game data: ${e}`);
    replace(app, h("p.error", null, t("main.couldnTLoadGameData", { e })));
    return;
  }
  watchGameNames(document.body);

  const store = new Store();
  bindStore(store);
  bindLinks(store, game.data.engineers);
  bindAlerts(store);
  initFocus(store);
  setRemoteCopyHere(store.state.settings.copyOnPhone);
  store.subscribe((st) => setRemoteCopyHere(st.settings.copyOnPhone));
  // An unexpected error right after start-up is worth a banner, not just a log line.
  window.addEventListener("error", (e) => {
    if (inStartup()) startupAlert("ui-error", t("main.unexpectedErrorStartUp"), String(e.message ?? e));
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (inStartup()) startupAlert("ui-error", t("main.unexpectedErrorStartUp"), String((e.reason as Error)?.message ?? e.reason));
  });
  await setDebugLog(store.state.settings.debugLog);
  log.info("app", `UI ready (language ${code}, view ${store.state.view})`);
  setHere(() => ({ system: store.state.cmdr.location?.system, seenAt: store.state.cmdr.location?.seenAt }));
  const ctx: Ctx = { game, store };
  bindTour(ctx);
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
    const menu = { remote: Boolean(remoteMode), everything: openedAsSinglePage(), navIcon };
    renderMenu(nav, store, menu);
    // A page hidden in Settings, switched off for the phone, or from an older menu falls back to
    // the first page shown.
    const shown = visibleNav(s.settings.hiddenViews ?? [], excludedHere(store, menu), s.settings.navOrder);
    const hiddenNow = NAV.some((n) => n.id === s.view) && !shown.some((n) => n.id === s.view);
    const view = (remoteMode && s.view === "mobile" ? null : hiddenNow ? null : views[s.view]) ?? views[shown.find((n) => n.id !== "-")?.id ?? "materials"] ?? views.materials;
    if (mounted !== s.view) {
      mounted = s.view;
      // Each page draws in its own container: a page you left (a Spansh answer arriving late, a
      // timer) then only redraws itself off screen, never over the page you are on.
      const host = h("div.view-host");
      replace(main, host);
      view.mount(host);
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
    else if (w.state === "error") startupAlert("journal", t("main.gameJournalUnreadable"), w.message ?? "", goTo("settings", t("common.settings")));
    else if (w.state === "waiting" && inStartup()) startupAlert("journal", t("main.noGameJournalFound"), w.message ?? t("main.checkJournalFolderSettings"), goTo("settings", t("common.settings")));
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
    setWatch({ state: "error", message: t("main.setJournalFolderSettings") });
  }
}


const SECURITY_FR: Record<string, string> = { High: t("common.highSecurity"), Medium: t("common.mediumSecurity"), Low: t("common.lowSecurity"), Anarchy: t("common.anarchy") };
const ALLEGIANCE_FR: Record<string, string> = { Independent: t("main.independent"), Federation: t("main.federation"), Empire: "Empire", Alliance: "Alliance", Thargoid: "Thargoid", Guardian: t("main.guardian"), PilotsFederation: "Pilots Federation" };

function renderHeader(el: HTMLElement, ctx: Ctx) {
  const { cmdr, watch } = ctx.store.state;
  const loc = cmdr.location;
  const statusLabel: Record<string, string> = { live: t("main.live"), waiting: t("main.waitingGame"), error: t("common.error"), demo: t("main.demo"), idle: t("main.stopped"), remote: t("main.connectedPc"), offline: t("common.pcUnreachable") };
  const states = new Set<string>();
  for (const f of loc?.factions ?? []) {
    if (f.name === loc?.controllingFaction && f.state && f.state !== "None") states.add(f.state);
    for (const a of f.active) if (a !== "None") states.add(a);
  }
  replace(
    el,
    h("button.brand", { title: t("main.hideShowMenu"), onclick: () => toggleNav() }, h("img", { src: "favicon.png", alt: "" }), h("span", null, "EDCH")),
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
          h("button.sys", { title: t("main.copySystemName"), onclick: () => openSystem(loc.system, { navigate: false }) }, icon("pin"), h("span", null, loc.system)),
          loc.station ? h("span.sub", null, loc.station) : null,
          [loc.security ? SECURITY_FR[loc.security] ?? loc.security : undefined, loc.allegiance ? ALLEGIANCE_FR[loc.allegiance] ?? loc.allegiance : undefined].filter(Boolean).map((label) => h("span.badge.muted", null, label!)),
          [...states].slice(0, 4).map((s) => h("span.badge.hit", null, s)),
        )
      : h("div.where.sub", null, t("common.unknownLocation")),
    gameBadge(ctx.store.state.game),
    focusButtons(),
    h("div.live", { class: watch.state, title: watch.message ?? watch.file ?? "" }, h("span.dot"), statusLabel[watch.state] ?? watch.state),
  );
}

