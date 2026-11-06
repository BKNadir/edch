// Exports the current ship to EDSY or Coriolis: both open a journal Loadout passed in the page's
// address, gzipped and base64url-encoded (the format EDMarketConnector uses for the same links).

import type { Settings } from "../../state/store.js";

/** The build sites EDCH can open a ship in. */
export type BuildSite = Settings["buildSite"];

/** Where each site reads an imported loadout. */
const IMPORT_ADDRESSES: Record<BuildSite, string> = {
  edsy: "https://edsy.org/#/I=",
  coriolis: "https://coriolis.io/import?data=",
};

/** Site names as shown on the buttons. */
export const BUILD_SITE_NAMES: Record<BuildSite, string> = { edsy: "EDSY", coriolis: "Coriolis" };

/** The address that opens `loadout` (a journal Loadout event) in `site`. */
export async function buildExportUrl(loadout: Record<string, unknown>, site: BuildSite): Promise<string> {
  // Keys sorted and no spaces, like EDMarketConnector: the same ship always gives the same link.
  const json = JSON.stringify(sortKeys(loadout));
  const gzipped = await gzip(json);
  return IMPORT_ADDRESSES[site] + base64url(gzipped).replace(/=/g, "%3D");
}

/** A copy of `value` with every object's keys in alphabetical order. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  return value;
}

/** `text` (UTF-8) compressed with gzip. */
async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Base64 with "-" and "_" (URL-safe), "=" padding kept. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}
