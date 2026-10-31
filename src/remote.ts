// Mobile access. On the PC: start/stop the local server and publish the state to it.
// On the phone: follow the PC's state and send wishlist edits back.

import {
  onRemoteAction,
  remoteAction,
  remoteAddresses,
  remotePublish,
  remoteStart,
  remoteState,
  remoteStop,
  setRemote,
  type RemoteInfo,
} from "./bridge.js";
import { toast } from "./dom.js";
import { emptyState } from "./journal.js";
import { newRemoteToken, type Store } from "./store.js";

// ---------------- PC side ----------------

let running: RemoteInfo | null = null;
let publishTimer: number | undefined;

export const remoteRunning = () => running;

/** The URL encoded in the QR code. */
export function pairingUrl(store: Store): string | null {
  const r = store.state.settings.remote;
  if (!running || !r.token) return null;
  const host = r.host || running.addresses[0] || "localhost";
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
  const { sync: _sync, remote: _remote, journalDir: _dir, ...settings } = s.settings;
  return JSON.stringify({ cmdr: s.cmdr, wishlist: s.wishlist, settings, watch: s.watch });
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
    if (action?.type === "wishlist" && Array.isArray(action.items)) store.setWishlist(action.items, true);
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

export async function detectRemote(): Promise<boolean> {
  try {
    const res = await fetch("/api/hello", { credentials: "same-origin" });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.remote === true;
  } catch {
    return false;
  }
}

export async function runRemoteClient(store: Store) {
  setRemote(true);
  store.onWishlistChange = (items) => {
    remoteAction({ type: "wishlist", items }).catch(() => toast("PC injoignable : modification non envoyée"));
  };
  let version = 0;
  for (;;) {
    try {
      const r = await remoteState(version);
      if (r.state && r.version !== version) {
        version = r.version;
        const s = r.state;
        store.state.cmdr = { ...emptyState(), ...s.cmdr };
        store.setWishlist(Array.isArray(s.wishlist) ? s.wishlist : [], true);
        store.state.settings = { ...store.state.settings, ...s.settings };
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
