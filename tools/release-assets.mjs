// Names of the files attached to a GitHub release: the system and the processor in every name,
// the same way for all of them ("EDCH_0.10.14_windows_x64-setup.exe", "EDCH_0.10.14_linux_arm64.deb").
// Tauri's bundler names its files its own way; the CI runs this after each build to rename them on
// the release:
//
//   node tools/release-assets.mjs <tag> <version>      (GITHUB_TOKEN and GITHUB_REPOSITORY set)
//
// The installed copies of EDCH find their update by "-setup.exe" and "_x64-" or "_arm64-" in the
// name (src-tauri/src/update.rs), and the portable version knows itself by "portable": the new
// names keep both.

import { pathToFileURL } from "node:url";

/**
 * The name a release file gets, from the name Tauri gave it, or `null` when it keeps its name
 * (already renamed, made by the CI with the right name, or not a build: PKGBUILD).
 */
export function releaseAssetName(name, version) {
  const v = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = [
    [new RegExp(`^EDCH_${v}_x64-setup\\.exe$`), `EDCH_${version}_windows_x64-setup.exe`],
    [new RegExp(`^EDCH_${v}_x64_[a-z]{2}-[A-Z]{2}\\.msi$`), `EDCH_${version}_windows_x64.msi`],
    [new RegExp(`^EDCH_${v}_arm64-setup\\.exe$`), `EDCH_${version}_windows_arm64-setup.exe`],
    [new RegExp(`^EDCH_${v}_amd64\\.(AppImage|deb)$`), `EDCH_${version}_linux_x64.$1`],
    [new RegExp(`^EDCH_${v}_aarch64\\.AppImage$`), `EDCH_${version}_linux_arm64.AppImage`],
    [new RegExp(`^EDCH_${v}_arm64\\.deb$`), `EDCH_${version}_linux_arm64.deb`],
    [new RegExp(`^EDCH-${v}-\\d+\\.x86_64\\.rpm$`), `EDCH_${version}_linux_x64.rpm`],
    [new RegExp(`^EDCH-${v}-\\d+\\.aarch64\\.rpm$`), `EDCH_${version}_linux_arm64.rpm`],
  ];
  for (const [pattern, renamed] of rules) if (pattern.test(name)) return name.replace(pattern, renamed);
  return null;
}

/** Renames the files of release `tag` on GitHub (see the header). */
export async function renameOnRelease(tag, version) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are needed");
  const api = (path, init = {}) =>
    fetch(`https://api.github.com/repos/${repository}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
    });
  const listAssets = async () => {
    const answer = await api(`/releases/tags/${encodeURIComponent(tag)}`);
    if (!answer.ok) throw new Error(`release ${tag}: HTTP ${answer.status}`);
    return (await answer.json()).assets ?? [];
  };

  for (const asset of await listAssets()) {
    const renamed = releaseAssetName(asset.name, version);
    if (!renamed) continue;
    const answer = await api(`/releases/assets/${asset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: renamed }),
    });
    if (answer.ok) {
      console.log(`${asset.name} -> ${renamed}`);
      continue;
    }
    // Another job renamed it meanwhile, or a re-run uploaded it again next to the renamed one.
    const now = await listAssets();
    const stillThere = now.some((a) => a.id === asset.id && a.name === asset.name);
    if (!now.some((a) => a.name === renamed)) throw new Error(`${asset.name}: HTTP ${answer.status}`);
    if (stillThere) await api(`/releases/assets/${asset.id}`, { method: "DELETE" });
    console.log(`${asset.name}: ${renamed} already there`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, version] = process.argv.slice(2);
  if (!tag || !version) {
    console.error("usage: node tools/release-assets.mjs <tag> <version>");
    process.exit(2);
  }
  renameOnRelease(tag, version).catch((error) => {
    console.error(String(error?.message ?? error));
    process.exit(1);
  });
}
