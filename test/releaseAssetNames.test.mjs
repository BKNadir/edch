// Release file names: every build gets the system and the processor in its name, and the
// Windows installers keep what installed copies of EDCH look for to update themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseAssetName } from "../tools/release-assets.mjs";

const TAURI_NAMES = {
  "EDCH_0.10.14_x64-setup.exe": "EDCH_0.10.14_windows_x64-setup.exe",
  "EDCH_0.10.14_x64_en-US.msi": "EDCH_0.10.14_windows_x64.msi",
  "EDCH_0.10.14_arm64-setup.exe": "EDCH_0.10.14_windows_arm64-setup.exe",
  "EDCH_0.10.14_amd64.AppImage": "EDCH_0.10.14_linux_x64.AppImage",
  "EDCH_0.10.14_amd64.deb": "EDCH_0.10.14_linux_x64.deb",
  "EDCH-0.10.14-1.x86_64.rpm": "EDCH_0.10.14_linux_x64.rpm",
  "EDCH_0.10.14_aarch64.AppImage": "EDCH_0.10.14_linux_arm64.AppImage",
  "EDCH_0.10.14_arm64.deb": "EDCH_0.10.14_linux_arm64.deb",
  "EDCH-0.10.14-1.aarch64.rpm": "EDCH_0.10.14_linux_arm64.rpm",
};

test("release files: Tauri's names get the system and the processor", () => {
  for (const [tauri, renamed] of Object.entries(TAURI_NAMES)) assert.equal(releaseAssetName(tauri, "0.10.14"), renamed);
});

test("release files: names already right, other versions and PKGBUILD are left alone", () => {
  for (const name of [
    ...Object.values(TAURI_NAMES),
    "EDCH_0.10.14_windows_x64-portable.exe",
    "EDCH_0.10.14_windows_arm64-portable.exe",
    "EDCH_0.10.14_linux_x64.flatpak",
    "PKGBUILD",
    "EDCH_0.10.13_x64-setup.exe",
  ])
    assert.equal(releaseAssetName(name, "0.10.14"), null, name);
  // A dot in the version is a dot, not "any character".
  assert.equal(releaseAssetName("EDCH_0x10x14_amd64.deb", "0.10.14"), null);
});

test("release files: installed copies still find the Windows installer of their processor", () => {
  // The rule of src-tauri/src/update.rs: "-setup.exe" and "_x64-" or "_arm64-" in the name.
  const x64 = releaseAssetName("EDCH_0.10.14_x64-setup.exe", "0.10.14");
  const arm = releaseAssetName("EDCH_0.10.14_arm64-setup.exe", "0.10.14");
  assert.ok(x64.endsWith("-setup.exe") && x64.includes("_x64-") && !x64.includes("_arm64-"));
  assert.ok(arm.endsWith("-setup.exe") && arm.includes("_arm64-") && !arm.includes("_x64-"));
});

test("release files: renamed on GitHub, a copy uploaded again by a re-run removed", async () => {
  const { renameOnRelease } = await import("../tools/release-assets.mjs");
  // A release with Tauri's names, one file already renamed and its old copy uploaded again.
  const assets = [
    { id: 1, name: "EDCH_0.10.14_amd64.deb" },
    { id: 2, name: "EDCH_0.10.14_linux_x64.AppImage" },
    { id: 3, name: "EDCH_0.10.14_amd64.AppImage" },
    { id: 4, name: "PKGBUILD" },
  ];
  const calls = [];
  const savedFetch = globalThis.fetch;
  const savedLog = console.log;
  process.env.GITHUB_TOKEN = "test";
  process.env.GITHUB_REPOSITORY = "owner/edch";
  console.log = () => {};
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? "GET";
    calls.push(`${method} ${url.replace("https://api.github.com/repos/owner/edch", "")}`);
    const id = Number(url.split("/").pop());
    if (method === "GET") return { ok: true, json: async () => ({ assets: assets.map((a) => ({ ...a })) }) };
    if (method === "DELETE")
      assets.splice(
        assets.findIndex((a) => a.id === id),
        1,
      );
    if (method === "PATCH") {
      const name = JSON.parse(init.body).name;
      if (assets.some((a) => a.name === name)) return { ok: false, status: 422 };
      assets.find((a) => a.id === id).name = name;
    }
    return { ok: true, status: 200 };
  };
  try {
    await renameOnRelease("v0.10.14-pre.1", "0.10.14");
  } finally {
    globalThis.fetch = savedFetch;
    console.log = savedLog;
  }
  assert.deepEqual(assets.map((a) => a.name).sort(), [
    "EDCH_0.10.14_linux_x64.AppImage",
    "EDCH_0.10.14_linux_x64.deb",
    "PKGBUILD",
  ]);
  assert.ok(calls.includes("DELETE /releases/assets/3"));
  assert.ok(!calls.includes("DELETE /releases/assets/2"));
});
