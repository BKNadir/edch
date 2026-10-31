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
  state: "live" | "waiting" | "error" | "demo" | "idle";
  file?: string | null;
  message?: string | null;
}

export interface AuxFile {
  name: string;
  content: string;
}

export const isTauri = (): boolean => typeof window !== "undefined" && Boolean(window.__TAURI__?.core);

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
  if (isTauri()) {
    return window.__TAURI__!.core.invoke<HttpReply>("http_fetch", { method, url, body: body ?? null, contentType });
  }
  const response = await fetch(url, { method, headers: body ? { "Content-Type": contentType } : undefined, body });
  return { status: response.status, body: await response.text() };
}

function parse(reply: HttpReply, what: string): any {
  if (reply.status === 429) throw new Error(`${what} : trop de requêtes, réessaie dans un instant`);
  if (reply.status < 200 || reply.status >= 300) throw new Error(`${what} a répondu ${reply.status}`);
  try {
    return JSON.parse(reply.body);
  } catch {
    throw new Error(`${what} : réponse illisible`);
  }
}

/** POST a Spansh JSON search (systems/bodies/stations). */
export async function spanshPost(endpoint: string, body: unknown): Promise<any> {
  return parse(await httpFetch("POST", `https://spansh.co.uk/api/${endpoint}`, JSON.stringify(body)), "Spansh");
}

export async function spanshGet(path: string): Promise<any> {
  return parse(await httpFetch("GET", `https://spansh.co.uk/api/${path}`), "Spansh");
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
    const res = parse(await httpFetch("GET", `https://spansh.co.uk/api/results/${job}`), "Spansh");
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
  if (!isTauri()) return Promise.reject(new Error("Disponible dans l'application (pas en mode démo)"));
  return window.__TAURI__!.core.invoke<T>(cmd, args);
};

export const optionsDir = () => invoke<string>("options_dir");
export const listOptionFiles = () => invoke<OptionFile[]>("list_option_files");
export const readOptionFile = (folder: string, name: string) => invoke<string>("read_option_file", { folder, name });
export const exportConfig = (includeGraphics: boolean) => invoke<string>("export_config", { includeGraphics });
export const importConfig = (bytes: Uint8Array) => invoke<ImportReport>("import_config", { data: Array.from(bytes) });
export const revealPath = (path: string) => invoke<void>("reveal_path", { path });

export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
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
