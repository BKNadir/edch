// Automatic updates: compares this build with the latest GitHub release, offers it in a
// banner, downloads the installer on demand and restarts EDCH through it.

import { isPortable, isRemote, isTauri, onUpdateProgress, openUrl, updateCheck, updateDownload, updateInstall, type UpdateInfo } from "./bridge.js";
import { h, replace, toast } from "./dom.js";
import { locale } from "./i18n.js";
import { log } from "./logger.js";
import type { Store } from "./store.js";

const EVERY = 6 * 60 * 60 * 1000;

type Phase =
  | { kind: "hidden" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; done: number; total: number }
  | { kind: "ready"; info: UpdateInfo; path: string }
  | { kind: "failed"; info: UpdateInfo; message: string };

let phase: Phase = { kind: "hidden" };
/** Portable build: nothing is installed, "Update" opens the latest release page. */
let portable = false;
let showNotes = false;

/** The release notes (CHANGELOG section, in English): bullet points before the install line. */
function notesList(notes: string): HTMLElement | null {
  const items = notes
    .split(/\n---/)[0]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*] /.test(l))
    .map((l) => l.slice(2).replace(/\*\*/g, "").replace(/`/g, ""));
  if (!items.length) return null;
  return h("ul.update-notes", { "data-no-tr": "" }, items.map((t) => h("li", null, t)));
}
let bar: HTMLElement | null = null;
let store: Store | null = null;

const mb = (n: number) => (n / 1048576).toLocaleString(locale(), { maximumFractionDigits: 1 });

function render() {
  if (!bar) {
    bar = h("div#update-bar", { role: "status" });
    document.body.append(bar);
  }
  if (phase.kind === "hidden") {
    bar.classList.remove("show");
    return;
  }
  bar.classList.add("show");
  const p = phase;
  const close = h("button.ghost.small", { title: "Plus tard", onclick: () => later() }, "Plus tard");
  if (p.kind === "available") {
    replace(
      bar,
      h(
        "div.update-text",
        null,
        h("strong", null, `EDCH ${p.info.version} est disponible`),
        h("span.sub", null, `Version installée : ${p.info.current}`),
        showNotes ? notesList(p.info.notes) : null,
        showNotes && p.info.page ? h("button.inline-link", { onclick: () => openUrl(p.info.page) }, "Voir sur GitHub") : null,
      ),
      h(
        "div.row",
        null,
        h("button.ghost.small", { onclick: () => ((showNotes = !showNotes), render()) }, showNotes ? "Masquer les nouveautés" : "Nouveautés"),
        close,
        portable
          ? h("button.primary.small", { onclick: () => openUrl(p.info.page || "https://github.com/BKNadir/edch/releases/latest") }, "Télécharger la version portable")
          : h("button.primary.small", { onclick: () => download(p.info) }, "Mettre à jour"),
      ),
    );
  } else if (p.kind === "downloading") {
    const pct = p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
    replace(
      bar,
      h(
        "div.update-text",
        null,
        h("strong", null, `Téléchargement de EDCH ${p.info.version}…`),
        h("span.sub", null, p.total > 0 ? `${pct} % · ${mb(p.done)} / ${mb(p.total)} Mo` : `${mb(p.done)} Mo`),
        h("div.update-progress", null, h("span", { style: { width: `${pct}%` } })),
      ),
    );
  } else if (p.kind === "ready") {
    replace(
      bar,
      h("div.update-text", null, h("strong", null, `EDCH ${p.info.version} est prêt`), h("span.sub", null, "Relance l'application pour terminer la mise à jour. Elle se rouvrira toute seule.")),
      h("div.row", null, close, h("button.primary.small", { onclick: () => install(p) }, "Relancer maintenant")),
    );
  } else {
    replace(
      bar,
      h("div.update-text", null, h("strong", null, "La mise à jour a échoué"), h("span.sub", null, p.message)),
      h("div.row", null, close, h("button.primary.small", { onclick: () => download(p.info) }, "Réessayer")),
    );
  }
}

function later() {
  if (phase.kind === "hidden") return;
  // "Later" on an offer skips this version; a downloaded one is kept for the next start.
  if (phase.kind === "available" && store) store.updateSettings({ skippedVersion: phase.info.version });
  phase = { kind: "hidden" };
  render();
}

async function download(info: UpdateInfo) {
  log.info("update", `Downloading ${info.version}`);
  phase = { kind: "downloading", info, done: 0, total: info.size };
  render();
  const stop = await onUpdateProgress((done, total) => {
    if (phase.kind !== "downloading") return;
    phase = { ...phase, done, total };
    render();
  });
  try {
    const path = await updateDownload(info);
    phase = { kind: "ready", info, path };
  } catch (e) {
    phase = { kind: "failed", info, message: String((e as Error)?.message ?? e) };
    log.warn("update", `Download failed: ${phase.message}`);
  } finally {
    stop();
  }
  render();
}

async function install(p: { info: UpdateInfo; path: string }) {
  try {
    await updateInstall(p.path);
  } catch (e) {
    phase = { kind: "failed", info: p.info, message: String((e as Error)?.message ?? e) };
    render();
  }
}

/** Checks GitHub now. `manual`: also report "up to date" and errors, and ignore a skipped version. */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!isTauri() || isRemote() || !store) return;
  if (phase.kind === "downloading" || phase.kind === "ready") {
    if (manual) render();
    return;
  }
  try {
    const info = await updateCheck();
    if (!info) {
      if (manual) toast("EDCH est à jour");
      return;
    }
    log.info("update", `Version ${info.version} available (installed ${info.current})`);
    if (!manual && info.version === store.state.settings.skippedVersion) return;
    phase = { kind: "available", info };
    render();
  } catch (e) {
    log.warn("update", `Check failed: ${String((e as Error)?.message ?? e)}`);
    if (manual) toast(`Vérification impossible : ${String((e as Error)?.message ?? e)}`);
  }
}

/** At start-up (a few seconds in) and every 6 hours, when enabled in Settings. */
export function startUpdateChecks(s: Store) {
  store = s;
  if (!isTauri()) return;
  void isPortable().then((p) => (portable = p));
  const tick = () => {
    if (store?.state.settings.autoUpdate) void checkForUpdate(false);
  };
  window.setTimeout(tick, 5000);
  window.setInterval(tick, EVERY);
}
