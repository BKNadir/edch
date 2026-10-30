import { isTauri, onJournal, readAuxFile, startJournal, defaultJournalDir, type WatchStatus } from "./bridge.js";
import { loadGame } from "./data.js";
import { h, icon, replace } from "./dom.js";
import { applyLines, applyLocker, emptyState } from "./journal.js";
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
import { copySystem } from "./views/results.js";

const NAV: { id: string; label: string; icon: string }[] = [
  { id: "materials", label: "Matériaux", icon: "M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" },
  { id: "odyssey", label: "Odyssey", icon: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM5 21c0-4 3-7 7-7s7 3 7 7" },
  { id: "engineering", label: "Ingénierie", icon: "M14 6l4 4-9 9H5v-4zM16 4l4 4" },
  { id: "wishlist", label: "Wishlist", icon: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" },
  { id: "engineers", label: "Ingénieurs", icon: "M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6" },
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
    game = await loadGame();
  } catch (e) {
    replace(app, h("p.error", null, `Impossible de charger les données du jeu : ${e}`));
    return;
  }
  const store = new Store();
  const ctx: Ctx = { game, store };
  const cap = (id: string) => game.capacityOf(id);

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
      NAV.map((n) =>
        h(
          "button",
          { class: s.view === n.id ? "active" : "", title: n.label, onclick: () => store.setView(n.id) },
          navIcon(n.icon),
          h("span", null, n.label),
          n.id === "wishlist" && s.wishlist.length ? h("small.count", null, String(s.wishlist.length)) : null,
        ),
      ),
    );
    const view = views[s.view] ?? views.materials;
    if (mounted !== s.view) {
      mounted = s.view;
      view.mount(main);
      main.scrollTop = 0;
    } else {
      view.update();
    }
    detail.update();
  };
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
    store.state.cmdr = emptyState();
    applyLines(store.state.cmdr, demoLines(), cap);
    setWatch({ state: "demo" });
    return;
  }

  let saveTimer: number | undefined;
  await onJournal({
    batch: (b) => {
      const { changed, events } = applyLines(store.state.cmdr, b.lines, cap);
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
      if (a.name !== "ShipLocker.json") return;
      try {
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

const SECURITY_FR: Record<string, string> = { High: "Sécurité haute", Medium: "Sécurité moyenne", Low: "Sécurité basse", Anarchy: "Anarchie" };
const ALLEGIANCE_FR: Record<string, string> = { Independent: "Indépendant", Federation: "Fédération", Empire: "Empire", Alliance: "Alliance", Thargoid: "Thargoid", Guardian: "Gardien", PilotsFederation: "Pilots Federation" };

function renderHeader(el: HTMLElement, ctx: Ctx) {
  const { cmdr, watch } = ctx.store.state;
  const loc = cmdr.location;
  const statusLabel: Record<string, string> = { live: "En direct", waiting: "En attente du jeu", error: "Erreur", demo: "Démo", idle: "Arrêté" };
  const states = new Set<string>();
  for (const f of loc?.factions ?? []) {
    if (f.name === loc?.controllingFaction && f.state && f.state !== "None") states.add(f.state);
    for (const a of f.active) if (a !== "None") states.add(a);
  }
  replace(
    el,
    h("div.brand", null, h("img", { src: "favicon.png", alt: "" }), h("span", null, "ED Companion")),
    h(
      "div.cmdr",
      null,
      h("strong", null, cmdr.commander ? `CMDR ${cmdr.commander}` : "CMDR —"),
      cmdr.ship ? h("span.sub", null, `${cmdr.ship.type}${cmdr.ship.name ? ` « ${cmdr.ship.name} »` : ""}`) : null,
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
