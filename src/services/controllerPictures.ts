// Controller pictures of the Controls page (EDRefCard templates, about 1.3 MB each on GitHub, which
// only lets them be cached for 5 minutes). Each picture shown is downloaded once and kept on the
// PC, unchanged (full quality), in EDCH's folder (`picture_cache.rs`): the page then shows it at
// once, offline too. In a browser (demo, phone), pictures simply come from GitHub.

import { isTauri, readKeptPicture, writeKeptPicture } from "../platform/bridge.js";
import { log } from "../platform/logger.js";

/** Where an earlier test build kept shrunk copies in the browser storage: emptied once. */
const OLD_STORAGE_KEY = "edch.controllerPictures";

/** Kept pictures already read this session: template name → object URL of the picture. */
const shown = new Map<string, string>();
/** Pictures being downloaded, so a redraw doesn't download one twice. */
const downloading = new Set<string>();

/** Frees the browser storage an earlier test build used for these pictures. */
function dropOldCopies() {
  try {
    localStorage.removeItem(OLD_STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing to free */
  }
}

/**
 * The address to show a template's picture from: its copy kept on the PC (an object URL), or
 * undefined when it isn't kept yet (then show `url` and call `keepPicture`).
 */
export async function keptPictureUrl(name: string): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const known = shown.get(name);
  if (known) return known;
  try {
    const bytes = await readKeptPicture(name);
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    shown.set(name, objectUrl);
    return objectUrl;
  } catch {
    return undefined;
  }
}

/** Downloads a template's picture from `url` and keeps it on the PC, unchanged. Quiet on failure. */
export async function keepPicture(name: string, url: string): Promise<void> {
  if (!isTauri() || shown.has(name) || downloading.has(name)) return;
  downloading.add(name);
  dropOldCopies();
  try {
    const reply = await fetch(url);
    if (!reply.ok) return;
    const bytes = new Uint8Array(await reply.arrayBuffer());
    await writeKeptPicture(name, bytes);
    shown.set(name, URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" })));
    log.debug("controls", `Controller picture kept (${Math.round(bytes.length / 1024)} kB)`);
  } catch (error) {
    log.debug("controls", `Controller picture not kept: ${String((error as Error)?.message ?? error)}`);
  } finally {
    downloading.delete(name);
  }
}
