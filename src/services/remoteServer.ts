// Remote access server (PC side): starts and stops EDCH's local web server, builds the pairing
// link (QR code) and publishes the app's state to the paired phones. What is published is built
// by the app (app/remote.ts registers it with setRemotePublisher), so this module only handles
// the server itself.

import {
  remoteAddresses,
  remotePublish,
  remoteStart,
  remoteStop,
  remoteTailscale,
  type RemoteInfo,
} from "../platform/bridge.js";
import { newRemoteToken, type Store } from "../state/store.js";

let running: RemoteInfo | null = null;
let hostStore: Store | null = null;
/** Builds the JSON sent to the phones (registered by the app). */
let buildSnapshot: ((store: Store) => string) | null = null;

/** Called once by the app: which store to follow and how to build what the phones receive. */
export function setRemotePublisher(store: Store, snapshot: (store: Store) => string) {
  hostStore = store;
  buildSnapshot = snapshot;
}

/** Sends the current state to the phones now (no-op while the server is off). */
export function publishNow(store: Store) {
  if (!running || !buildSnapshot) return;
  remotePublish(buildSnapshot(store)).catch(() => undefined);
}

export const remoteRunning = () => running;

/** The URL encoded in the QR code. */
let tailscaleIp: string | null = null;
/** Looks for this PC's Tailscale address (called when the Mobile page opens). */
export async function detectTailscale(): Promise<string | null> {
  tailscaleIp = await remoteTailscale();
  return tailscaleIp;
}
export const tailscaleAddress = () => tailscaleIp;

/** The address in the QR code and the link: the one chosen in the list, if this PC still has it. */
export function pairingHost(store: Store, known: string[] = running?.addresses ?? []): string {
  const r = store.state.settings.remote;
  return (r.host && known.includes(r.host) ? r.host : known[0]) || r.host || "localhost";
}

export function pairingUrl(store: Store, known?: string[]): string | null {
  const r = store.state.settings.remote;
  if (!running || !r.token) return null;
  return `http://${pairingHost(store, known)}:${running.port}/pair?t=${r.token}`;
}

export async function startRemote(store: Store): Promise<RemoteInfo> {
  let r = store.state.settings.remote;
  if (!r.token) {
    store.updateSettings({ remote: { ...r, token: newRemoteToken() } });
    r = store.state.settings.remote;
  }
  running = await remoteStart(r.token, r.port);
  publishNow(store);
  store.notify(); // the top bar shows "open in the browser" only while the server runs
  return running;
}

export async function stopRemote() {
  running = null;
  await remoteStop().catch(() => undefined);
  hostStore?.notify();
}

/** A new secret: every paired device has to scan the new QR code. */
export async function rotateToken(store: Store) {
  store.updateSettings({ remote: { ...store.state.settings.remote, token: newRemoteToken() } });
  if (running) await startRemote(store);
}

export const detectedAddresses = () => remoteAddresses().catch(() => [] as string[]);
