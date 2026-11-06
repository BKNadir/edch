// App start-up (after boot.ts loaded the language): game data, the store, the layout, then
// either the journal feed (PC), the PC's state (paired phone), or a demo journal (browser).

import { isTauri, setRemoteCopyHere } from "../platform/bridge.js";
import { t, watchGameNames } from "../platform/i18n.js";
import { captureActions, captureErrors, captureShownErrors, log, setDebugLog } from "../platform/logger.js";
import { applyActivityEvents } from "../game/activity/index.js";
import { emptyActivity } from "../game/activity/state.js";
import { loadGame } from "../game/data.js";
import { demoLines } from "../game/demo.js";
import { loadExobio } from "../game/exobio.js";
import { applyLines } from "../game/journal/events.js";
import { emptyState } from "../game/journal/state.js";
import type { Ctx } from "../state/context.js";
import { Store } from "../state/store.js";
import { bindAlerts, inStartup, startupAlert } from "../ui/alerts.js";
import { changelogAfterUpdate } from "../ui/changelog.js";
import { setupDesktop } from "../ui/desktop.js";
import { h, replace } from "../ui/dom.js";
import { startUpdateChecks } from "../ui/updateBanner.js";
import { Uploaders } from "../services/sync/index.js";
import { bindTour } from "../features/engineers/tour.js";
import { startCopyOnGameFocus } from "../features/navigation/copyOnGameFocus.js";
import { startMissingDataChecks } from "../features/dataGaps/missingData.js";
import { bindStore, setupLive } from "../features/missions/live.js";
import { bindLinks } from "../views/shared/links.js";
import { setHere } from "../views/shared/resultsTable.js";
import { initFocus } from "./focus.js";
import { replayJournal, setWatch, startJournalFeed } from "./journalFeed.js";
import { runRemoteClient, setupRemoteHost } from "./remote.js";
import { startShell } from "./shell.js";

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
    if (inStartup())
      startupAlert("ui-error", t("main.unexpectedErrorStartUp"), String((e.reason as Error)?.message ?? e.reason));
  });
  await setDebugLog(store.state.settings.debugLog);
  log.info("app", `UI ready (language ${code}, view ${store.state.view})`);
  setHere(() => ({ system: store.state.cmdr.location?.system, seenAt: store.state.cmdr.location?.seenAt }));
  const ctx: Ctx = { game, store };
  bindTour(ctx);
  startCopyOnGameFocus(ctx);
  startMissingDataChecks();
  const capacityOf = (id: string) => game.capacityOf(id);
  const sync = new Uploaders(
    () => store.state.settings.sync,
    () => store.state.settings.journalDir,
    () => store.state.cmdr.materials,
    () => store.notify(),
    () => store.state.cmdr.fid,
  );
  ctx.sync = sync;

  startShell(app, ctx, remoteMode, () => replayJournal(store));

  if (!isTauri()) {
    // Served by EDCH's local server to a phone? Then follow the PC; else browser demo.
    if (remoteMode === "paired") {
      setupLive(store);
      void runRemoteClient(store);
      return;
    }
    store.state.cmdr = emptyState();
    const demo = applyLines(store.state.cmdr, demoLines(), capacityOf);
    store.state.activity = emptyActivity();
    applyActivityEvents(store.state.activity, demo.events);
    setupLive(store);
    setWatch(store, { state: "demo" });
    return;
  }

  await setupRemoteHost(store);
  setupDesktop(store);
  void changelogAfterUpdate(store);
  startUpdateChecks(store);
  setupLive(store);
  await startJournalFeed(store, sync, capacityOf);
}
