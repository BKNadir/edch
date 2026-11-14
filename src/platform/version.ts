// This build's version. Bumped with package.json, src-tauri/Cargo.toml and tauri.conf.json at
// each release (see CONTRIBUTING.md, "Releasing").

/** Name sent to EDDN, EDSM and Inara with the data. */
export const SOFTWARE_NAME = "EDCH";

export const SOFTWARE_VERSION = "0.10.14";

/**
 * The GitHub release this build was published as ("v0.10.11" or "v0.10.11-pre.83"): CI writes it
 * to build-info.json before building. Null for local builds (npm run demo, app:dev).
 */
let publishedTag: Promise<string | null> | null = null;
export function buildTag(): Promise<string | null> {
  publishedTag ??= fetch("build-info.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((info) => (info && typeof info.tag === "string" ? (info.tag as string) : null))
    .catch(() => null);
  return publishedTag;
}

/** A pre-release tag ("v0.10.11-pre.83"). */
export const isPreReleaseTag = (tag: string | null | undefined) => Boolean(tag && /-pre\.\d+$/.test(tag));
