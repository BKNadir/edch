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

/** POST a Spansh search. In the app it goes through Rust (no CORS); in a browser, direct. */
export async function spanshPost(endpoint: string, body: unknown): Promise<any> {
  const text = JSON.stringify(body);
  if (isTauri()) {
    const raw = await window.__TAURI__!.core.invoke<string>("spansh_post", { endpoint, body: text });
    return JSON.parse(raw);
  }
  const response = await fetch(`https://spansh.co.uk/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
  });
  if (!response.ok) throw new Error(`Spansh a répondu ${response.status}`);
  return response.json();
}

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
