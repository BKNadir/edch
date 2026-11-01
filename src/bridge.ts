// Talks to the Rust side when running inside Tauri; falls back to a demo mode in a
// plain browser so the UI can be developed and checked without the game.

interface TauriGlobal {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  event: { listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<() => void> };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export interface JournalBatch {
  lines: string[];
  replay: boolean;
  file: string;
}

export interface WatchStatus {
  state: "live" | "waiting" | "error" | "demo" | "idle" | "remote" | "offline";
  file?: string | null;
  message?: string | null;
}

export interface AuxFile {
  name: string;
  content: string;
}

export const isTauri = (): boolean => typeof window !== "undefined" && Boolean(window.__TAURI__?.core);

/** True when this page is served by EDCH's local server to another device (phone, tablet). */
let remote = false;
export const isRemote = () => remote;
export const setRemote = (on: boolean) => {
  remote = on;
};

const TOKEN_KEY = "edch.remoteToken";

/** The pairing secret kept by the phone (sent as a header too, for browsers that drop the cookie). */
export function remoteToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function forgetRemoteToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing stored */
  }
}

/** fetch() to the PC with the pairing secret. */
export function remoteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = remoteToken();
  if (token) headers.set("X-EDCH-Token", token);
  return fetch(path, { credentials: "same-origin", ...init, headers });
}

async function remoteJson(path: string, init?: RequestInit): Promise<any> {
  const res = await remoteFetch(path, init);
  if (!res.ok) throw new Error(`EDCH (PC) a répondu ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export async function defaultJournalDir(): Promise<string | null> {
  if (!isTauri()) return null;
  return window.__TAURI__!.core.invoke<string | null>("default_journal_dir");
}

export async function startJournal(dir: string): Promise<void> {
  if (!isTauri()) return;
  await window.__TAURI__!.core.invoke("start_journal", { dir });
}

export async function readAuxFile(dir: string, name: string): Promise<string> {
  if (!isTauri()) throw new Error("not in app");
  return window.__TAURI__!.core.invoke<string>("read_aux_file", { dir, name });
}

export async function onJournal(handlers: {
  batch: (b: JournalBatch) => void;
  status: (s: WatchStatus) => void;
  aux: (a: AuxFile) => void;
}): Promise<void> {
  if (!isTauri()) return;
  const ev = window.__TAURI__!.event;
  await ev.listen<JournalBatch>("journal-batch", (e) => handlers.batch(e.payload));
  await ev.listen<WatchStatus>("journal-status", (e) => handlers.status(e.payload));
  await ev.listen<AuxFile>("aux-file", (e) => handlers.aux(e.payload));
}

export interface HttpReply {
  status: number;
  body: string;
}

/** HTTP through Rust in the app (no CORS); plain fetch in a browser. Never throws on HTTP status. */
export async function httpFetch(method: string, url: string, body?: string, contentType = "application/json"): Promise<HttpReply> {
  if (remote) {
    return remoteJson("/api/http", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, url, body: body ?? null, contentType }) });
  }
  if (isTauri()) {
    return window.__TAURI__!.core.invoke<HttpReply>("http_fetch", { method, url, body: body ?? null, contentType });
  }
  const response = await fetch(url, { method, headers: body ? { "Content-Type": contentType } : undefined, body });
  return { status: response.status, body: await response.text() };
}

const TRANSIENT = new Set([500, 502, 503, 504, 520, 521, 522, 523, 524]);

/** Spansh's servers sometimes answer 502/503 under load: retry twice before giving up. */
async function spanshFetch(method: string, url: string, body?: string, contentType?: string): Promise<HttpReply> {
  const waits = [1500, 4000];
  for (let attempt = 0; ; attempt++) {
    let reply: HttpReply | null = null;
    let failure: unknown = null;
    try {
      reply = await httpFetch(method, url, body, contentType);
    } catch (e) {
      failure = e;
    }
    const retry = failure !== null || (reply !== null && TRANSIENT.has(reply.status));
    if (!retry || attempt >= waits.length) {
      if (failure !== null) throw failure;
      return reply!;
    }
    await new Promise((ok) => setTimeout(ok, waits[attempt]));
  }
}

function parse(reply: HttpReply, what: string): any {
  if (reply.status === 429) throw new Error(`${what} : trop de requêtes, réessaie dans un instant`);
  if (TRANSIENT.has(reply.status)) throw new Error(`${what} est momentanément indisponible (erreur ${reply.status}), réessaie dans un instant`);
  if (reply.status < 200 || reply.status >= 300) throw new Error(`${what} a répondu ${reply.status}`);
  try {
    return JSON.parse(reply.body);
  } catch {
    throw new Error(`${what} : réponse illisible`);
  }
}

/** POST a Spansh JSON search (systems/bodies/stations). */
export async function spanshPost(endpoint: string, body: unknown): Promise<any> {
  return parse(await spanshFetch("POST", `https://spansh.co.uk/api/${endpoint}`, JSON.stringify(body)), "Spansh");
}

export async function spanshGet(path: string): Promise<any> {
  return parse(await spanshFetch("GET", `https://spansh.co.uk/api/${path}`), "Spansh");
}

/** Spansh route plotters: submit a form, then poll the job until it is done. */
export async function spanshJob(endpoint: string, form: [string, string][], onWait?: (n: number) => void): Promise<any> {
  const encoded = form.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const submitted = parse(await httpFetch("POST", `https://spansh.co.uk/api/${endpoint}`, encoded, "application/x-www-form-urlencoded"), "Spansh");
  if (submitted.error) throw new Error(String(submitted.error));
  const job = submitted.job;
  if (!job) throw new Error("Spansh n'a pas donné de numéro de calcul");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    onWait?.(i);
    const res = parse(await spanshFetch("GET", `https://spansh.co.uk/api/results/${job}`), "Spansh");
    if (res.status === "queued") continue;
    if (res.status === "ok" && res.result) return res.result;
    throw new Error(String(res.error ?? `calcul ${res.status ?? "échoué"}`));
  }
  throw new Error("Spansh calcule encore après 3 minutes, réessaie plus tard");
}

export interface OptionFile {
  folder: "Bindings" | "Graphics";
  name: string;
  size: number;
  modified: number;
}

export interface ImportReport {
  written: string[];
  skipped: string[];
  backup: string;
}

const invoke = <T>(cmd: string, args?: Record<string, unknown>) => {
  if (remote) return Promise.reject(new Error("Disponible seulement sur le PC"));
  if (!isTauri()) return Promise.reject(new Error("Disponible dans l'application (pas en mode démo)"));
  return window.__TAURI__!.core.invoke<T>(cmd, args);
};

export const optionsDir = () => invoke<string>("options_dir");
export const listOptionFiles = (): Promise<OptionFile[]> => (remote ? remoteJson("/api/options") : invoke<OptionFile[]>("list_option_files"));
export const readOptionFile = async (folder: string, name: string): Promise<string> => {
  if (!remote) return invoke<string>("read_option_file", { folder, name });
  const res = await remoteFetch(`/api/option?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.text();
};
export const exportConfig = (includeGraphics: boolean) => invoke<string>("export_config", { includeGraphics });
export const importConfig = (bytes: Uint8Array) => invoke<ImportReport>("import_config", { data: Array.from(bytes) });
export const revealPath = (path: string) => invoke<void>("reveal_path", { path });

// ----- mobile access (local server) -----
export interface RemoteInfo {
  port: number;
  addresses: string[];
}
export const remoteStart = (token: string, port: number) => invoke<RemoteInfo>("remote_start", { token, port });
export const remoteStop = () => invoke<void>("remote_stop");
export const remotePublish = (state: string) => invoke<void>("remote_publish", { state });
export const remoteQr = (text: string) => invoke<string>("remote_qr", { text });
export const remoteAddresses = () => invoke<string[]>("remote_addresses");
/** This PC's Tailscale address (100.x.y.z), or null when Tailscale isn't running. */
export const remoteTailscale = () => invoke<string | null>("remote_tailscale").catch(() => null);
export async function onRemoteAction(cb: (action: any) => void): Promise<void> {
  if (!isTauri()) return;
  await window.__TAURI__!.event.listen<any>("remote-action", (e) => cb(e.payload));
}

/** Phone side: wait for the next state published by the PC (long poll). */
export async function remoteState(since: number): Promise<{ version: number; state: any }> {
  return remoteJson(`/api/state?since=${since}`);
}
export async function remoteAction(action: unknown): Promise<void> {
  await remoteJson("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
}

export const logWrite = (level: string, source: string, message: string) => invoke<void>("log_write", { level, source, message });
export const logSetDebug = (on: boolean) => invoke<string | null>("log_set_debug", { on });
export const logsOpen = () => invoke<string>("logs_open");
/** Portable build (no installer): updates open the release page instead. */
export const isPortable = () => (isTauri() && !isRemote() ? invoke<boolean>("is_portable").catch(() => false) : Promise.resolve(false));
export const installerLanguage = () => (isTauri() ? invoke<number | null>("installer_language").catch(() => null) : Promise.resolve(null));

export async function openUrl(url: string): Promise<void> {
  if (isTauri() && !remote) {
    await window.__TAURI__!.core.invoke("open_url", { url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for webviews without clipboard permission.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

// ----- updates (GitHub releases) -----
export interface UpdateInfo {
  version: string;
  current: string;
  notes: string;
  page: string;
  asset: string;
  url: string;
  size: number;
  digest: string | null;
}

export const updateCheck = () => invoke<UpdateInfo | null>("update_check");
export const updateDownload = (info: UpdateInfo) => invoke<string>("update_download", { info });
export const updateInstall = (path: string) => invoke<void>("update_install", { path });
export async function onUpdateProgress(cb: (done: number, total: number) => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  return window.__TAURI__!.event.listen<{ done: number; total: number }>("update-progress", (e) => cb(e.payload.done, e.payload.total));
}

/** Journal lines of the last `days` days for these events (start-up rebuild of the activity). */
export async function scanHistory(dir: string, days: number, events: string[]): Promise<string[]> {
  if (!isTauri() || remote) return [];
  return window.__TAURI__!.core.invoke<string[]>("scan_history", { dir, days, events });
}
