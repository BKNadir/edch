// Desktop side: is Elite Dangerous running, launch it from EDCH (also from the phone), and
// what closing the window does.

import {
  appQuit,
  gameRunning,
  isRemote,
  isTauri,
  launchGame,
  onConfirmClose,
  remoteAction,
  setCloseBehavior,
} from "../platform/bridge.js";
import { dialog } from "./dialog.js";
import { h, icon, toast } from "./dom.js";
import { log } from "../platform/logger.js";
import type { Store } from "../state/store.js";
import { t } from "../platform/i18n.js";

let store: Store | null = null;

/** PC: watches the game every 10 seconds, applies the close behaviour, asks before closing if chosen. */
export function setupDesktop(s: Store) {
  store = s;
  if (!isTauri() || isRemote()) return;
  const poll = async () => {
    const state = await gameRunning();
    if (state !== store!.state.game) {
      log.info(
        "game",
        state ? `Elite Dangerous ${state === "game" ? "running" : "launcher open"}` : "Elite Dangerous not running",
      );
      store!.state.game = state;
      store!.notify();
    }
  };
  void poll();
  window.setInterval(poll, 10_000);

  let mode = "";
  const applyClose = () => {
    if (store!.state.settings.closeBehavior === mode) return;
    mode = store!.state.settings.closeBehavior;
    void setCloseBehavior(mode);
  };
  applyClose();
  s.subscribe(applyClose);
  void onConfirmClose(async () => {
    const answer = await dialog(
      t("desktop.closeEdch"),
      [h("p", null, t("desktop.edchStopsReadingGameJournalRemote"))],
      [
        { label: t("desktop.cancel"), value: "no" },
        { label: t("common.close"), primary: true, value: "yes" },
      ],
    );
    if (answer === "yes") void appQuit();
  });
}

/** Starts the game (on a phone: asks the PC to). */
export async function startGame() {
  if (!store) return;
  if (isRemote()) {
    try {
      await remoteAction({ type: "launch" });
      toast(t("desktop.launchRequestedPc"));
    } catch {
      toast(t("common.pcUnreachable"));
    }
    return;
  }
  const g = store.state.settings.gameLaunch;
  try {
    await launchGame(g.method, g.path);
    toast(
      g.method === "steam"
        ? t("desktop.launchingThroughSteam")
        : g.method === "epic"
          ? t("desktop.launchingThroughEpicGames")
          : t("desktop.launchingGame"),
    );
    store.state.game = "launcher";
    store.notify();
  } catch (e) {
    toast(String((e as Error)?.message ?? e));
    store.setView("settings");
  }
}

/** The game's state and the launch button, for the top bar. */
export function gameBadge(game: string | undefined): HTMLElement | null {
  if (game === undefined) return null;
  if (game === "game")
    return h(
      "div.game-state.on",
      { title: t("desktop.eliteDangerousRunning") },
      h("span.dot"),
      t("desktop.eliteRunning"),
    );
  if (game === "launcher")
    return h(
      "div.game-state.wait",
      { title: t("desktop.eliteDangerousLauncherOpen") },
      h("span.dot"),
      t("desktop.launcherOpen"),
    );
  return h(
    "button.game-launch",
    { title: t("common.launchEliteDangerous"), onclick: () => startGame() },
    icon("play"),
    " " + t("desktop.launchElite"),
  );
}
