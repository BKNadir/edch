// What's new after an update: the CHANGELOG sections between the last version seen and this one
// (the changelog is written in English, like the release notes).

import { h } from "./dom.js";
import { dialog } from "./dialog.js";
import { SOFTWARE_VERSION } from "./eddn.js";
import type { Store } from "./store.js";

const parse = (v: string) => v.split(".").map((n) => Number(n) || 0);
const newer = (a: string, b: string) => {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** Changelog sections (version → bullet points), newest first. */
async function sections(): Promise<{ version: string; items: string[] }[]> {
  const res = await fetch("CHANGELOG.md");
  if (!res.ok) return [];
  const text = await res.text();
  const out: { version: string; items: string[] }[] = [];
  for (const block of text.split(/^## /m).slice(1)) {
    const [head, ...lines] = block.split("\n");
    const version = head.trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    out.push({ version, items: lines.filter((l) => /^[-*] /.test(l.trim())).map((l) => l.trim().slice(2).replace(/\*\*/g, "").replace(/`/g, "")) });
  }
  return out;
}

/** Shows the news of every version after `since` up to this one (or only this one). */
export async function showChangelog(since?: string) {
  const all = await sections().catch(() => []);
  const list = all.filter((s) => !newer(s.version, SOFTWARE_VERSION) && (since ? newer(s.version, since) : s.version === SOFTWARE_VERSION)).slice(0, 8);
  if (!list.length) return;
  await dialog(
    `Nouveautés d'EDCH ${SOFTWARE_VERSION}`,
    list.map((s) => h("section.changelog-version", null, h("h4", { "data-no-tr": "" }, s.version), h("ul.update-notes", { "data-no-tr": "" }, s.items.map((t) => h("li", null, t))))),
    [{ label: "OK", primary: true, value: "ok" }],
  );
}

/** At start-up: after an update, show what's new (unless turned off), then remember this version. */
export async function changelogAfterUpdate(store: Store) {
  const s = store.state.settings;
  const last = s.lastSeenVersion;
  if (last === SOFTWARE_VERSION) return;
  store.updateSettings({ lastSeenVersion: SOFTWARE_VERSION });
  if (last && s.showChangelog && newer(SOFTWARE_VERSION, last)) await showChangelog(last);
}
