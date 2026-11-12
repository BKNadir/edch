// Remote access, app side. On the PC: publishes the app's state to the phones through the local
// server (services/remoteServer.ts) and applies what they send back. On the phone: follows the
// PC's state and sends wishlist and display changes back.

import { clipboardWrite, onRemoteAction, remoteAction, remoteState, setRemote } from "../platform/bridge.js";
import { lang, t } from "../platform/i18n.js";
import { log } from "../platform/logger.js";
import { emptyActivity } from "../game/activity/state.js";
import { unsoldSummary } from "../game/activity/exploration.js";
import { emptyState } from "../game/journal/state.js";
import { DEFAULT_THEME, validTheme } from "../state/themeSettings.js";
import { PHONE_SETTINGS, validPhoneSettings } from "../state/phoneSettings.js";
import { validWishItems, type Settings, type Store } from "../state/store.js";
import { goTo, startupAlert } from "../ui/alerts.js";
import { startGame } from "../ui/desktop.js";
import { toast } from "../ui/dom.js";
import { publishNow, remoteRunning, setRemotePublisher, startRemote } from "../services/remoteServer.js";
import { wingView } from "../features/missions/live.js";

function snapshot(store: Store): string {
  const s = store.state;
  // Never share API keys, the secret itself or the PC's paths.
  const {
    sync: _sync,
    remote: _remote,
    journalDir: _dir,
    wing: _wing,
    debugLog: _debug,
    gameLaunch: _launch,
    ...settings
  } = s.settings;
  // Activity without the body table (big for explorers): the phone gets the summaries it shows.
  const { bodies, ...activity } = s.activity;
  const here = s.activity.system?.address;
  const currentBodies = Object.fromEntries(Object.entries(bodies).filter(([, b]) => b.address === here));
  return JSON.stringify({
    cmdr: s.cmdr,
    wishlist: s.wishlist,
    settings,
    watch: s.watch,
    lang: lang().code,
    activity: { ...activity, bodies: currentBodies, unsold: unsoldSummary(bodies, s.activity.unsoldSystems) },
    wing: wingView(),
    game: s.game,
  });
}

/** PC: keep phones up to date and apply what they send. */
export async function setupRemoteHost(store: Store) {
  setRemotePublisher(store, snapshot);
  let publishTimer: number | undefined;
  store.subscribe(() => {
    if (!remoteRunning()) return;
    window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(() => publishNow(store), 600);
  });
  await onRemoteAction((action) => {
    log.info("remote", `Phone action: ${String(action?.type ?? "?")}`);
    if (action?.type === "wishlist" && Array.isArray(action.items))
      store.setWishlist(validWishItems(action.items), true);
    // A system clicked on the phone: the game runs here, so its clipboard is the one that matters.
    if (action?.type === "clipboard" && typeof action.text === "string" && action.text.length <= 2000) {
      clipboardWrite(action.text).catch((e) => log.warn("remote", `Clipboard: ${String((e as Error)?.message ?? e)}`));
    }
    if (action?.type === "theme" && action.theme && typeof action.theme === "object") {
      store.updateSettings({ theme: { ...DEFAULT_THEME, ...store.state.settings.theme, ...validTheme(action.theme) } });
    }
    // Display settings changed on the phone: the PC keeps them, and every screen follows.
    if (action?.type === "settings" && action.patch && typeof action.patch === "object") {
      const patch = validPhoneSettings(action.patch as Record<string, unknown>, store.state.settings);
      if (Object.keys(patch).length) store.updateSettings(patch);
    }
    if (action?.type === "launch") void startGame();
  });
  if (store.state.settings.remote.enabled) {
    try {
      await startRemote(store);
    } catch (e) {
      startupAlert(
        "remote",
        t("remote.remoteAccessUnavailable"),
        String((e as Error)?.message ?? e),
        goTo("mobile", t("common.remoteAccess")),
      );
    }
  }
}

// ---------------- phone side ----------------

export async function runRemoteClient(store: Store) {
  setRemote(true);
  store.onWishlistChange = (items) => {
    remoteAction({ type: "wishlist", items }).catch(() => toast(t("remote.pcUnreachableChangeNotSent")));
  };
  // Display settings changed on the phone: the PC saves them and every screen follows.
  const phonePart = (st: { settings: Settings }) => JSON.stringify(PHONE_SETTINGS.map((k) => st.settings[k]));
  let sentTheme = "";
  store.subscribe((st) => {
    const key = phonePart(st);
    if (!sentTheme) sentTheme = key;
    if (key === sentTheme) return;
    sentTheme = key;
    const patch = Object.fromEntries(PHONE_SETTINGS.map((k) => [k, st.settings[k]]));
    remoteAction({ type: "settings", patch }).catch(() => undefined);
  });
  let version = 0;
  for (;;) {
    try {
      const r = await remoteState(version);
      if (r.state && r.version !== version) {
        version = r.version;
        const s = r.state;
        // The PC switched language: follow it.
        if (typeof s.lang === "string" && s.lang !== lang().code) {
          location.reload();
          return;
        }
        store.state.cmdr = { ...emptyState(), ...s.cmdr };
        store.setWishlist(Array.isArray(s.wishlist) ? s.wishlist : [], true);
        store.state.settings = { ...store.state.settings, ...s.settings };
        if (typeof s.game === "string" || s.game === undefined) store.state.game = s.game;
        sentTheme = phonePart(store.state);
        if (s.activity) store.state.activity = { ...emptyActivity(), ...s.activity };
        (store.state as unknown as Record<string, unknown>).remoteWing = s.wing ?? null;
      }
      if (store.state.watch.state !== "remote") {
        store.state.watch = { state: "remote" };
      }
      store.notify();
    } catch {
      store.state.watch = { state: "offline", message: t("common.pcUnreachable") };
      store.notify();
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
}
