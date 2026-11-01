import { LANGS, browserLang, guessLang, initI18n, saveLang, savedLang, watchTranslations } from "./i18n.js";
import { installerLanguage, isTauri, onJournal, readAuxFile, startJournal, defaultJournalDir, type WatchStatus } from "./bridge.js";
import { loadGame } from "./data.js";
import { h, icon, replace } from "./dom.js";
import { applyLines, applyLocker, applyStatus, emptyState } from "./journal.js";
import { Uploaders } from "./uploaders.js";
import { detectRemote, remoteLanguage, runRemoteClient, setupRemoteHost } from "./remote.js";
import { MobileView } from "./views/mobile.js";
import { AboutView } from "./views/about.js";
import { RemoteGuideView } from "./views/guide.js";
import { applyTheme } from "./theme.js";
import { MissionsView } from "./views/missions.js";
import { ColonisationView } from "./views/colonisation.js";
import { GoalsView } from "./views/goals.js";
import { ExplorationView } from "./views/exploration.js";
import { MiningView } from "./views/mining.js";
import { PowerplayView } from "./views/powerplay.js";
import { SessionView } from "./views/session.js";
import { loadExobio } from "./exobio.js";
import { applyActivityEvents, emptyActivity } from "./activity.js";
import { loadHistory, onLiveEvents, setupLive } from "./live.js";
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
import { copySystem, setHere } from "./views/results.js";

const NAV: { id: string; label: string; icon: string }[] = [
  { id: "materials", label: "Matériaux", icon: "M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" },
  { id: "odyssey", label: "Odyssey", icon: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM5 21c0-4 3-7 7-7s7 3 7 7" },
  { id: "engineering", label: "Ingénierie", icon: "M14 6l4 4-9 9H5v-4zM16 4l4 4" },
  { id: "wishlist", label: "Wishlist", icon: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" },
  { id: "engineers", label: "Ingénieurs", icon: "M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6" },
  { id: "search", label: "Recherche", icon: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20" },
  { id: "navigation", label: "Navigation", icon: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" },
  { id: "-", label: "", icon: "" },
  { id: "missions", label: "Missions", icon: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h6" },
  { id: "colonisation", label: "Colonisation", icon: "M5 21V4M5 4h11l-2 4 2 4H5" },
  { id: "goals", label: "Objectifs communautaires", icon: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" },
  { id: "exploration", label: "Exploration", icon: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM3 15c3 2 15-4 18-8" },
  { id: "mining", label: "Minage", icon: "M14 4l6 6M4 20l9-9M11 6c3-2 6-1 7 0M18 13c2-3 1-6 0-7" },
  { id: "powerplay", label: "Powerplay", icon: "M13 2L4 14h7l-1 8 9-12h-7z" },
  { id: "session", label: "Session", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" },
  { id: "-", label: "", icon: "" },
  { id: "controls", label: "Commandes", icon: "M6 9h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L15 15H9l-1.6 1.8A3 3 0 0 1 2 15v-2a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M15.5 12h.01M17.5 13.5h.01" },
  { id: "mobile", label: "Mobile", icon: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" },
  { id: "sync", label: "Synchro", icon: "M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" },
  { id: "about", label: "À propos", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01" },
  { id: "settings", label: "Paramètres", icon: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .2-1.5-1.5L16.7 4 13.8 3 13 5h-2l-.8-2-2.9 1 .2 2.7L6 8.2 4 8 3 11l2 1v0l-2 1 1 3 2-.2 1.5 1.5L7.3 20l2.9 1 .8-2h2l.8 2 2.9-1-.2-2.7 1.5-1.5 2 .2 1-3z" },
];

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
  let game;
  try {
    [game] = await Promise.all([loadGame(), loadExobio()]);
  } catch (e) {
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
      NAV.filter((n) => !(remoteMode && n.id === "mobile")).map((n) =>
        n.id === "-" ? h("div.nav-sep") : h(
          "button",
          { class: s.view === n.id ? "active" : "", "data-nav": n.id, title: n.label, onclick: () => store.setView(n.id) },
          navIcon(n.icon),
          h("span", null, n.label),
          n.id === "wishlist" && s.wishlist.length ? h("small.count", null, String(s.wishlist.length)) : null,
        ),
      ),
    );
    const view = (remoteMode && s.view === "mobile" ? null : views[s.view]) ?? views.materials;
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
  startUpdateChecks(store);
  setupLive(store);

  let saveTimer: number | undefined;
  let uploads = Promise.resolve();
  sync.start();
  await onJournal({
    batch: (b) => {
      const { changed, events } = applyLines(store.state.cmdr, b.lines, cap);
      if (!b.replay) onLiveEvents(events);
      // Uploads run in order; nothing from the startup replay is ever sent.
      uploads = uploads.then(async () => {
        for (const ev of events) await sync.handle(ev, !b.replay);
      });
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
    h("div.brand", null, h("img", { src: "favicon.png", alt: "" }), h("span", null, "EDCH")),
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
          h("button.sys", { title: "Copier le système", onclick: () => copySystem(loc.system) }, icon("pin"), h("span", null, loc.system)),
          loc.station ? h("span.sub", null, loc.station) : null,
          [loc.security ? SECURITY_FR[loc.security] ?? loc.security : undefined, loc.allegiance ? ALLEGIANCE_FR[loc.allegiance] ?? loc.allegiance : undefined].filter(Boolean).map((t) => h("span.badge.muted", null, t!)),
          [...states].slice(0, 4).map((s) => h("span.badge.hit", null, s)),
        )
      : h("div.where.sub", null, "Position inconnue"),
    h("div.live", { class: watch.state, title: watch.message ?? watch.file ?? "" }, h("span.dot"), statusLabel[watch.state] ?? watch.state),
  );
}

boot();
