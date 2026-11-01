// Mobile access. On the PC: start/stop the local server and publish the state to it.
// On the phone: follow the PC's state and send wishlist edits back.

import { DEFAULT_THEME } from "./theme.js";
import { log } from "./logger.js";
import {
  forgetRemoteToken,
  onRemoteAction,
  remoteAction,
  remoteAddresses,
  remoteFetch,
  remotePublish,
  remoteStart,
  remoteState,
  remoteTailscale,
  remoteStop,
  setRemote,
  type RemoteInfo,
} from "./bridge.js";
import { toast } from "./dom.js";
import { lang } from "./i18n.js";
import { emptyActivity } from "./activity.js";
import { wingView } from "./live.js";
import { unsoldSummary } from "./views/exploration.js";
import { emptyState } from "./journal.js";
import { newRemoteToken, type Store } from "./store.js";

// ---------------- PC side ----------------

let running: RemoteInfo | null = null;
let publishTimer: number | undefined;

export const remoteRunning = () => running;

/** The URL encoded in the QR code. */
let tailscaleIp: string | null = null;
/** Looks for this PC's Tailscale address (called when the Mobile page opens). */
export async function detectTailscale(): Promise<string | null> {
  tailscaleIp = await remoteTailscale();
  return tailscaleIp;
}
export const tailscaleAddress = () => tailscaleIp;

/** The URL in the QR code and the link: Tailscale address when chosen and available, else the LAN one. */
export function pairingUrl(store: Store): string | null {
  const r = store.state.settings.remote;
  if (!running || !r.token) return null;
  const host = (r.tailscale && tailscaleIp) || r.host || running.addresses[0] || "localhost";
  return `http://${host}:${running.port}/pair?t=${r.token}`;
}

export async function startRemote(store: Store): Promise<RemoteInfo> {
  let r = store.state.settings.remote;
  if (!r.token) {
    store.updateSettings({ remote: { ...r, token: newRemoteToken() } });
    r = store.state.settings.remote;
  }
  running = await remoteStart(r.token, r.port);
  publishNow(store);
  return running;
}

export async function stopRemote() {
  running = null;
  await remoteStop().catch(() => undefined);
}

/** A new secret: every paired device has to scan the new QR code. */
export async function rotateToken(store: Store) {
  store.updateSettings({ remote: { ...store.state.settings.remote, token: newRemoteToken() } });
  if (running) await startRemote(store);
}

export const detectedAddresses = () => remoteAddresses().catch(() => [] as string[]);

function snapshot(store: Store): string {
  const s = store.state;
  // Never share API keys, the secret itself or the PC's paths.
  const { sync: _sync, remote: _remote, journalDir: _dir, wing: _wing, debugLog: _debug, ...settings } = s.settings;
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
  });
}

function publishNow(store: Store) {
  if (!running) return;
  remotePublish(snapshot(store)).catch(() => undefined);
}

/** PC: keep phones up to date and apply what they send. */
export async function setupRemoteHost(store: Store) {
  store.subscribe(() => {
    if (!running) return;
    window.clearTimeout(publishTimer);
    publishTimer = window.setTimeout(() => publishNow(store), 600);
  });
  await onRemoteAction((action) => {
    log.info("remote", `Phone action: ${String(action?.type ?? "?")}`);
    if (action?.type === "wishlist" && Array.isArray(action.items)) store.setWishlist(action.items, true);
    if (action?.type === "theme" && action.theme && typeof action.theme === "object") {
      store.updateSettings({ theme: { ...DEFAULT_THEME, ...store.state.settings.theme, ...action.theme } });
    }
  });
  if (store.state.settings.remote.enabled) {
    try {
      await startRemote(store);
    } catch (e) {
      toast(String(e));
    }
  }
}

// ---------------- phone side ----------------

/** Served by EDCH's local server? "paired" when this device holds the current secret. */
export async function detectRemote(): Promise<"paired" | "unpaired" | null> {
  try {
    const res = await remoteFetch("/api/hello");
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.remote !== true) return null;
    if (body.paired) return "paired";
    forgetRemoteToken(); // stale secret ("New code" on the PC)
    return "unpaired";
  } catch {
    return null;
  }
}

/** The PC's language, so the phone shows the same one until the user picks another. */
export async function remoteLanguage(): Promise<string | null> {
  try {
    const r = await Promise.race([remoteState(0), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
    return typeof r?.state?.lang === "string" ? r.state.lang : null;
  } catch {
    return null;
  }
}

export async function runRemoteClient(store: Store) {
  setRemote(true);
  store.onWishlistChange = (items) => {
    remoteAction({ type: "wishlist", items }).catch(() => toast("PC injoignable : modification non envoyée"));
  };
  // Appearance changed on the phone: the PC saves it and every screen follows.
  let sentTheme = "";
  store.subscribe((st) => {
    const key = JSON.stringify(st.settings.theme);
    if (!sentTheme) sentTheme = key;
    if (key === sentTheme) return;
    sentTheme = key;
    remoteAction({ type: "theme", theme: st.settings.theme }).catch(() => undefined);
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
        sentTheme = JSON.stringify(store.state.settings.theme);
        if (s.activity) store.state.activity = { ...emptyActivity(), ...s.activity };
        (store.state as unknown as Record<string, unknown>).remoteWing = s.wing ?? null;
      }
      if (store.state.watch.state !== "remote") {
        store.state.watch = { state: "remote" };
      }
      store.notify();
    } catch {
      store.state.watch = { state: "offline", message: "PC injoignable" };
      store.notify();
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
}
