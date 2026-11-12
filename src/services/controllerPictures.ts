// Controller pictures of the Controls page (EDRefCard templates, about 1.3 MB each on GitHub, which
// only lets them be cached for 5 minutes). The pictures shown are kept on the PC, shrunk to a
// lighter JPEG, so the page shows them at once next time, offline too. Only the last few are kept
// (they live in localStorage, shared with the rest of the app's settings).

import { log } from "../platform/logger.js";

/** Where the kept pictures are saved. */
const STORAGE_KEY = "edch.controllerPictures";
/** How many pictures are kept (a joystick and its throttle, and one more). */
const MAX_KEPT = 3;
/** Width the pictures are shrunk to (the templates are 3840 px wide; the page never needs more). */
const KEPT_WIDTH = 1920;
/** JPEG quality of a kept picture: about 300 to 500 kB each. */
const KEPT_QUALITY = 0.85;

/** A kept picture: its address on GitHub, the picture itself (data: URL), when it was last shown. */
interface KeptPicture {
  url: string;
  picture: string;
  shownAt: number;
}

function readKept(): KeptPicture[] {
  try {
    const kept = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(kept) ? kept : [];
  } catch {
    return [];
  }
}

/** Saves `kept`, dropping the oldest pictures when the browser storage is full. */
function writeKept(kept: KeptPicture[]) {
  const newestFirst = [...kept].sort((a, b) => b.shownAt - a.shownAt).slice(0, MAX_KEPT);
  while (newestFirst.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newestFirst));
      return;
    } catch {
      newestFirst.pop();
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: pictures are simply not kept */
  }
}

/** The kept copy of the picture at `url` (a data: URL), or undefined when it isn't kept yet. */
export function keptPicture(url: string): string | undefined {
  const kept = readKept();
  const found = kept.find((entry) => entry.url === url);
  if (!found) return undefined;
  found.shownAt = Date.now();
  writeKept(kept);
  return found.picture;
}

/**
 * Downloads the picture at `url`, shrinks it and keeps it. Quiet on failure (no network, storage
 * full): the page keeps loading the picture from GitHub.
 */
export async function keepPicture(url: string): Promise<void> {
  if (readKept().some((entry) => entry.url === url)) return;
  try {
    const reply = await fetch(url);
    if (!reply.ok) return;
    const bitmap = await createImageBitmap(await reply.blob());
    const scale = Math.min(1, KEPT_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const picture = canvas.toDataURL("image/jpeg", KEPT_QUALITY);
    writeKept([...readKept().filter((entry) => entry.url !== url), { url, picture, shownAt: Date.now() }]);
    log.debug("controls", `Controller picture kept (${Math.round(picture.length / 1024)} kB)`);
  } catch (error) {
    log.debug("controls", `Controller picture not kept: ${String((error as Error)?.message ?? error)}`);
  }
}
